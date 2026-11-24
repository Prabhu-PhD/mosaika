import type { BspNode, GridSystemId, RectPt, SplitAxis } from '@bento/contract';
import {
  computeMinCellDimensions,
  computeSubtreeMinSpan,
  normalizeRect,
  resolveTreeLayout,
  round2,
  round4,
} from './geometry.js';

export interface GridSystemDefinition {
  id: GridSystemId;
  label: string;
  name: string;
  cols: number;
  rows: number;
  description: string;
}

export const GRID_SYSTEMS: readonly GridSystemDefinition[] = [
  {
    id: 'swiss-12x6',
    label: '12×6',
    name: 'Swiss 12×6',
    cols: 12,
    rows: 6,
    description: 'Classic 12-column Swiss editorial lattice (divisible by 2, 3, 4, and 6).',
  },
  {
    id: 'deck-6x4',
    label: '6×4',
    name: 'Deck 6×4',
    cols: 6,
    rows: 4,
    description: 'Bold 6-column presentation lattice for clean executive rhythm.',
  },
  {
    id: 'matrix-4x3',
    label: '4×3',
    name: 'Matrix 4×3',
    cols: 4,
    rows: 3,
    description: 'Tight 4-track architectural lattice ideal for hairline & spotlight grids.',
  },
  {
    id: 'free',
    label: 'Free',
    name: 'Freeform',
    cols: 0,
    rows: 0,
    description: 'Unconstrained harmonic BSP without global column/row locking.',
  },
] as const;

export interface GridTrackBand {
  index: number;
  start: number;
  size: number;
}

export interface GridLattice {
  systemId: Exclude<GridSystemId, 'free'>;
  cols: number;
  rows: number;
  colWidth: number;
  rowHeight: number;
  gutterPt: number;
  /** Exact visual column rectangles for rendering a Swiss Grid Overlay */
  colBands: GridTrackBand[];
  /** Exact visual row rectangles for rendering a Swiss Grid Overlay */
  rowBands: GridTrackBand[];
  /** Internal vertical cut coordinates (right edge of col k-1 for k = 1..cols-1) */
  verticalCuts: number[];
  /** Internal horizontal cut coordinates (bottom edge of row k-1 for k = 1..rows-1) */
  horizontalCuts: number[];
}

export function getGridSystemDefinition(id: GridSystemId): GridSystemDefinition {
  return GRID_SYSTEMS.find((g) => g.id === id) ?? GRID_SYSTEMS[0]!;
}

function selectSafeTrackCount(
  totalSpan: number,
  gutterPt: number,
  requested: number
): number {
  const candidates: number[] = [];
  if (requested >= 12) candidates.push(12, 6, 4, 3, 2);
  else if (requested >= 6) candidates.push(6, 4, 3, 2);
  else if (requested >= 4) candidates.push(4, 3, 2);
  else if (requested >= 3) candidates.push(3, 2);
  else candidates.push(2);

  for (const count of candidates) {
    const unit = (totalSpan - (count - 1) * gutterPt) / count;
    if (unit >= 6) {
      return count;
    }
  }
  return 1;
}

/**
 * Computes the exact Josef Müller-Brockmann modular track lattice for anchorRect & gutterPt:
 *   u_x = (W - (C - 1) * g) / C,   u_y = (H - (R - 1) * g) / R
 */
export function computeGridLattice(
  anchorRect: RectPt,
  gutterPt: number,
  gridSystem: GridSystemId
): GridLattice | null {
  if (gridSystem === 'free') {
    return null;
  }

  const def = getGridSystemDefinition(gridSystem);
  const root = normalizeRect(anchorRect);
  const g = round2(Math.max(0, gutterPt));

  const cols = selectSafeTrackCount(root.width, g, def.cols);
  const rows = selectSafeTrackCount(root.height, g, def.rows);

  const colWidth = (root.width - (cols - 1) * g) / cols;
  const rowHeight = (root.height - (rows - 1) * g) / rows;

  const colBands: GridTrackBand[] = [];
  const verticalCuts: number[] = [];
  for (let c = 0; c < cols; c++) {
    const start = round2(root.left + c * (colWidth + g));
    const end =
      c === cols - 1 ? round2(root.left + root.width) : round2(start + colWidth);
    colBands.push({ index: c, start, size: round2(end - start) });
    if (c < cols - 1) {
      verticalCuts.push(end);
    }
  }

  const rowBands: GridTrackBand[] = [];
  const horizontalCuts: number[] = [];
  for (let r = 0; r < rows; r++) {
    const start = round2(root.top + r * (rowHeight + g));
    const end =
      r === rows - 1 ? round2(root.top + root.height) : round2(start + rowHeight);
    rowBands.push({ index: r, start, size: round2(end - start) });
    if (r < rows - 1) {
      horizontalCuts.push(end);
    }
  }

  return {
    systemId: gridSystem,
    cols,
    rows,
    colWidth,
    rowHeight,
    gutterPt: g,
    colBands,
    rowBands,
    verticalCuts,
    horizontalCuts,
  };
}

export interface GridTrackSnapResult {
  ratio: number;
  trackIndex: number; // 1..total-1
  totalTracks: number;
  firstSpan: number;
  secondSpan: number;
}

/**
 * Finds the nearest valid global Swiss track cut inside `parentRect` for a desired split ratio,
 * strictly respecting minFirstSpan and minSecondSpan.
 */
export function snapRatioToGridLattice(
  lattice: GridLattice,
  parentRect: RectPt,
  axis: SplitAxis,
  desiredRatio: number,
  minFirstSpan: number,
  minSecondSpan: number,
  maxDistanceRatio?: number
): GridTrackSnapResult | null {
  const g = lattice.gutterPt;
  const cuts = axis === 'vertical' ? lattice.verticalCuts : lattice.horizontalCuts;
  const totalTracks = axis === 'vertical' ? lattice.cols : lattice.rows;
  const start = axis === 'vertical' ? parentRect.left : parentRect.top;
  const totalSpan = axis === 'vertical' ? parentRect.width : parentRect.height;
  const avail = round2(totalSpan - g);

  if (avail <= 0 || cuts.length === 0) {
    return null;
  }

  // Determine start/end track indices of parentRect for span readout
  const bands = axis === 'vertical' ? lattice.colBands : lattice.rowBands;
  let parentStartCol = 0;
  let parentEndCol = totalTracks;
  let bestStartDist = Infinity;
  let bestEndDist = Infinity;
  for (const band of bands) {
    const dStart = Math.abs(band.start - start);
    if (dStart < bestStartDist) {
      bestStartDist = dStart;
      parentStartCol = band.index;
    }
    const dEnd = Math.abs(band.start + band.size - (start + totalSpan));
    if (dEnd < bestEndDist) {
      bestEndDist = dEnd;
      parentEndCol = band.index + 1;
    }
  }

  let best: GridTrackSnapResult | null = null;
  let bestDist = maxDistanceRatio ?? Infinity;

  for (let i = 0; i < cuts.length; i++) {
    const cutPos = cuts[i]!;
    const firstSize = round2(cutPos - start);
    const secondSize = round2(avail - firstSize);
    if (firstSize < minFirstSpan || secondSize < minSecondSpan) {
      continue;
    }
    const ratio = round4(firstSize / avail);
    const dist = Math.abs(ratio - desiredRatio);
    if (dist <= bestDist) {
      bestDist = dist;
      const trackIndex = i + 1;
      best = {
        ratio,
        trackIndex,
        totalTracks,
        firstSpan: Math.max(1, trackIndex - parentStartCol),
        secondSpan: Math.max(1, parentEndCol - trackIndex),
      };
    }
  }

  return best;
}

function hasLockedInNode(node: BspNode): boolean {
  if (node.kind === 'leaf') return node.locked;
  return hasLockedInNode(node.first) || hasLockedInNode(node.second);
}

/**
 * Snaps every unlocked BspSplitNode in `tree` onto exact global Swiss lattice track lines
 * while guaranteeing 0.00pt shift on locked subtrees and strict >= minW / >= minH on all leaves.
 */
export function snapTreeToGridLattice(
  tree: BspNode,
  anchorRect: RectPt,
  gutterPt: number,
  gridSystem: GridSystemId
): BspNode {
  const lattice = computeGridLattice(anchorRect, gutterPt, gridSystem);
  if (!lattice) {
    return tree;
  }

  const root = normalizeRect(anchorRect);
  const g = round2(Math.max(0, gutterPt));
  const { minW, minH } = computeMinCellDimensions(root);

  function snapNode(node: BspNode, rect: RectPt): BspNode {
    if (node.kind === 'leaf') {
      return node;
    }

    const locked = hasLockedInNode(node);
    let ratio = node.ratio;

    if (!locked) {
      const minSide = node.axis === 'vertical' ? minW : minH;
      const minFirst = computeSubtreeMinSpan(node.first, node.axis, g, minSide);
      const minSecond = computeSubtreeMinSpan(node.second, node.axis, g, minSide);
      const snapped = snapRatioToGridLattice(
        lattice!,
        rect,
        node.axis,
        node.ratio,
        minFirst,
        minSecond
      );
      if (snapped) {
        ratio = snapped.ratio;
      }
    }

    if (node.axis === 'vertical') {
      const availW = Math.max(0, round2(rect.width - g));
      const w1 = round2(availW * ratio);
      const w2 = round2(availW - w1);
      const r1: RectPt = { left: rect.left, top: rect.top, width: w1, height: rect.height };
      const r2: RectPt = {
        left: round2(rect.left + w1 + g),
        top: rect.top,
        width: w2,
        height: rect.height,
      };
      return {
        ...node,
        ratio,
        first: snapNode(node.first, r1),
        second: snapNode(node.second, r2),
      };
    }

    const availH = Math.max(0, round2(rect.height - g));
    const h1 = round2(availH * ratio);
    const h2 = round2(availH - h1);
    const r1: RectPt = { left: rect.left, top: rect.top, width: rect.width, height: h1 };
    const r2: RectPt = {
      left: rect.left,
      top: round2(rect.top + h1 + g),
      width: rect.width,
      height: h2,
    };
    return {
      ...node,
      ratio,
      first: snapNode(node.first, r1),
      second: snapNode(node.second, r2),
    };
  }

  const candidate = snapNode(tree, root);

  // Safety verification: never return a snapped tree if round2 arithmetic breaches minW/minH
  const resolved = resolveTreeLayout(candidate, root, g);
  const breachesFloor = resolved.some((l) => l.rect.width < minW || l.rect.height < minH);
  return breachesFloor ? tree : candidate;
}
