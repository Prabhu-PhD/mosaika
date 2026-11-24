import type { BspLeafNode, BspNode, RectPt } from '@bento/contract';

export const MIN_CELL_FLOOR_PT = 48;
export const MIN_CELL_CEIL_PT = 96;
export const MAX_BOX_COUNT = 16;
export const MAX_GUTTER_PT = 36;
export const MAX_RADIUS_PT = 32;
export const READING_ORDER_ROW_BAND_PT = 12;

export interface ResolvedLeaf {
  leaf: BspLeafNode;
  rect: RectPt;
}

export interface ResolvedSplitHandle {
  nodeId: string;
  axis: 'vertical' | 'horizontal';
  /** Exact visual gutter strip between first and second subtrees */
  gutterRect: RectPt;
  /** Full bounding rect of the split node */
  parentRect: RectPt;
  ratio: number;
  minRatio: number;
  maxRatio: number;
  /** True if either side contains a locked leaf (dragging disabled to keep 0.00pt lock invariant) */
  locked: boolean;
}

export interface MinCellDimensions {
  minW: number;
  minH: number;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

export function normalizeRect(rect: RectPt): RectPt {
  return {
    left: round2(rect.left),
    top: round2(rect.top),
    width: round2(Math.max(0, rect.width)),
    height: round2(Math.max(0, rect.height)),
  };
}

export function computeMinCellDimensions(anchorRect: RectPt): MinCellDimensions {
  const minW = Math.max(
    MIN_CELL_FLOOR_PT,
    Math.min(MIN_CELL_CEIL_PT, round2(anchorRect.width * 0.12))
  );
  const minH = Math.max(
    MIN_CELL_FLOOR_PT,
    Math.min(MIN_CELL_CEIL_PT, round2(anchorRect.height * 0.12))
  );
  return { minW, minH };
}

export function canSplitVertical(rect: RectPt, gutterPt: number, minW: number): boolean {
  return round2(rect.width - gutterPt) >= round2(2 * minW);
}

export function canSplitHorizontal(rect: RectPt, gutterPt: number, minH: number): boolean {
  return round2(rect.height - gutterPt) >= round2(2 * minH);
}

export function computeRatioBounds(
  axisLength: number,
  gutterPt: number,
  minSide: number
): { rMin: number; rMax: number } | null {
  const avail = round2(axisLength - gutterPt);
  if (avail < round2(2 * minSide) || avail <= 0) {
    return null;
  }
  const rMin = minSide / avail;
  const rMax = 1 - rMin;
  return { rMin, rMax };
}

/**
 * Clamps a desired split ratio so both round2(avail * ratio) and round2(avail - firstSize)
 * strictly satisfy >= minSide under 0.01pt rounding.
 */
export function clampSplitRatioForRounding(
  axisLength: number,
  gutterPt: number,
  minSide: number,
  desiredRatio: number
): number {
  const avail = round2(axisLength - gutterPt);
  if (avail <= 0) {
    return 0.5;
  }
  const minFirst = round2(minSide);
  const maxFirst = round2(avail - minSide);
  if (minFirst >= maxFirst) {
    return round2(avail * 0.5) / avail;
  }
  const clampedDesired = Math.max(0, Math.min(1, desiredRatio));
  const rawFirst = round2(avail * clampedDesired);
  const safeFirst = Math.max(minFirst, Math.min(maxFirst, rawFirst));
  return safeFirst / avail;
}

export function computeMaxCount(
  anchorRect: RectPt,
  gutterPt: number,
  minDims?: MinCellDimensions
): number {
  const { minW, minH } = minDims ?? computeMinCellDimensions(anchorRect);
  const safeGutter = Math.max(0, gutterPt);
  const maxCols = Math.max(1, Math.floor((anchorRect.width + safeGutter) / (minW + safeGutter)));
  const maxRows = Math.max(1, Math.floor((anchorRect.height + safeGutter) / (minH + safeGutter)));
  return Math.min(MAX_BOX_COUNT, maxCols * maxRows);
}

/**
 * Recursive Inset Subtraction (PRD Section 3.4).
 * Computes second child dimension via exact subtraction (avail - first) to eliminate edge drift.
 */
export function resolveTreeLayout(
  tree: BspNode,
  anchorRect: RectPt,
  gutterPt: number
): ResolvedLeaf[] {
  const results: ResolvedLeaf[] = [];
  const rootRect = normalizeRect(anchorRect);
  const g = round2(Math.max(0, gutterPt));

  function walk(node: BspNode, rect: RectPt): void {
    if (node.kind === 'leaf') {
      results.push({ leaf: node, rect });
      return;
    }

    if (node.axis === 'vertical') {
      const availW = Math.max(0, round2(rect.width - g));
      const w1 = round2(availW * node.ratio);
      const w2 = round2(availW - w1);
      const rectFirst: RectPt = {
        left: rect.left,
        top: rect.top,
        width: w1,
        height: rect.height,
      };
      const rectSecond: RectPt = {
        left: round2(rect.left + w1 + g),
        top: rect.top,
        width: w2,
        height: rect.height,
      };
      walk(node.first, rectFirst);
      walk(node.second, rectSecond);
    } else {
      const availH = Math.max(0, round2(rect.height - g));
      const h1 = round2(availH * node.ratio);
      const h2 = round2(availH - h1);
      const rectFirst: RectPt = {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: h1,
      };
      const rectSecond: RectPt = {
        left: rect.left,
        top: round2(rect.top + h1 + g),
        width: rect.width,
        height: h2,
      };
      walk(node.first, rectFirst);
      walk(node.second, rectSecond);
    }
  }

  walk(tree, rootRect);
  return results;
}

/**
 * Resolves the bounding rectangle for every nodeId in the BSP tree.
 */
export function resolveAllNodeRects(
  tree: BspNode,
  anchorRect: RectPt,
  gutterPt: number
): Map<string, RectPt> {
  const map = new Map<string, RectPt>();
  const rootRect = normalizeRect(anchorRect);
  const g = round2(Math.max(0, gutterPt));

  function walk(node: BspNode, rect: RectPt): void {
    map.set(node.nodeId, rect);
    if (node.kind === 'leaf') {
      return;
    }
    if (node.axis === 'vertical') {
      const availW = Math.max(0, round2(rect.width - g));
      const w1 = round2(availW * node.ratio);
      const w2 = round2(availW - w1);
      walk(node.first, { left: rect.left, top: rect.top, width: w1, height: rect.height });
      walk(node.second, {
        left: round2(rect.left + w1 + g),
        top: rect.top,
        width: w2,
        height: rect.height,
      });
    } else {
      const availH = Math.max(0, round2(rect.height - g));
      const h1 = round2(availH * node.ratio);
      const h2 = round2(availH - h1);
      walk(node.first, { left: rect.left, top: rect.top, width: rect.width, height: h1 });
      walk(node.second, {
        left: rect.left,
        top: round2(rect.top + h1 + g),
        width: rect.width,
        height: h2,
      });
    }
  }

  walk(tree, rootRect);
  return map;
}

function hasLockedInSubtree(node: BspNode): boolean {
  if (node.kind === 'leaf') {
    return node.locked;
  }
  return hasLockedInSubtree(node.first) || hasLockedInSubtree(node.second);
}

/**
 * Computes the exact minimum total span (in pt) required along `axis` so that every leaf
 * inside `node` remains >= minSide while preserving nested split ratios.
 */
export function computeSubtreeMinSpan(
  node: BspNode,
  axis: 'vertical' | 'horizontal',
  gutterPt: number,
  minSide: number
): number {
  if (node.kind === 'leaf') {
    return minSide;
  }
  const m1 = computeSubtreeMinSpan(node.first, axis, gutterPt, minSide);
  const m2 = computeSubtreeMinSpan(node.second, axis, gutterPt, minSide);

  if (node.axis === axis) {
    const r = Math.max(0.01, Math.min(0.99, node.ratio));
    const neededAvail = Math.max(m1 / r, m2 / (1 - r));
    return round2(neededAvail + gutterPt);
  }
  return Math.max(m1, m2);
}

/**
 * Resolves interactive gutter splitter handles for every BspSplitNode in the tree,
 * including exact [minRatio, maxRatio] bounds that protect all nested leaves from breaching minW/minH.
 */
export function resolveSplitHandles(
  tree: BspNode,
  anchorRect: RectPt,
  gutterPt: number
): ResolvedSplitHandle[] {
  const handles: ResolvedSplitHandle[] = [];
  const rootRect = normalizeRect(anchorRect);
  const g = round2(Math.max(0, gutterPt));
  const { minW, minH } = computeMinCellDimensions(rootRect);

  function walk(node: BspNode, rect: RectPt): void {
    if (node.kind === 'leaf') {
      return;
    }

    const locked = hasLockedInSubtree(node);

    if (node.axis === 'vertical') {
      const availW = Math.max(0, round2(rect.width - g));
      const w1 = round2(availW * node.ratio);
      const w2 = round2(availW - w1);

      const minFirstW = computeSubtreeMinSpan(node.first, 'vertical', g, minW);
      const minSecondW = computeSubtreeMinSpan(node.second, 'vertical', g, minW);
      const minRatio = availW > 0 ? Math.min(node.ratio, minFirstW / availW) : node.ratio;
      const maxRatio = availW > 0 ? Math.max(node.ratio, 1 - minSecondW / availW) : node.ratio;

      handles.push({
        nodeId: node.nodeId,
        axis: 'vertical',
        gutterRect: {
          left: round2(rect.left + w1),
          top: rect.top,
          width: g,
          height: rect.height,
        },
        parentRect: rect,
        ratio: node.ratio,
        minRatio: Math.max(0.05, Math.min(0.95, minRatio)),
        maxRatio: Math.max(0.05, Math.min(0.95, maxRatio)),
        locked,
      });

      walk(node.first, { left: rect.left, top: rect.top, width: w1, height: rect.height });
      walk(node.second, {
        left: round2(rect.left + w1 + g),
        top: rect.top,
        width: w2,
        height: rect.height,
      });
    } else {
      const availH = Math.max(0, round2(rect.height - g));
      const h1 = round2(availH * node.ratio);
      const h2 = round2(availH - h1);

      const minFirstH = computeSubtreeMinSpan(node.first, 'horizontal', g, minH);
      const minSecondH = computeSubtreeMinSpan(node.second, 'horizontal', g, minH);
      const minRatio = availH > 0 ? Math.min(node.ratio, minFirstH / availH) : node.ratio;
      const maxRatio = availH > 0 ? Math.max(node.ratio, 1 - minSecondH / availH) : node.ratio;

      handles.push({
        nodeId: node.nodeId,
        axis: 'horizontal',
        gutterRect: {
          left: rect.left,
          top: round2(rect.top + h1),
          width: rect.width,
          height: g,
        },
        parentRect: rect,
        ratio: node.ratio,
        minRatio: Math.max(0.05, Math.min(0.95, minRatio)),
        maxRatio: Math.max(0.05, Math.min(0.95, maxRatio)),
        locked,
      });

      walk(node.first, { left: rect.left, top: rect.top, width: rect.width, height: h1 });
      walk(node.second, {
        left: rect.left,
        top: round2(rect.top + h1 + g),
        width: rect.width,
        height: h2,
      });
    }
  }

  walk(tree, rootRect);
  return handles;
}

/**
 * Computes the highest integer gutter in [0..MAX_GUTTER_PT] for an existing tree & anchorRect
 * such that every resolved leaf stays >= minW and >= minH (and > 0pt).
 */
export function computeSafeMaxGutter(tree: BspNode, anchorRect: RectPt): number {
  const normalized = normalizeRect(anchorRect);
  const { minW, minH } = computeMinCellDimensions(normalized);

  if (normalized.width < minW || normalized.height < minH) {
    return 0;
  }

  const isSafe = (g: number): boolean => {
    const leaves = resolveTreeLayout(tree, normalized, g);
    for (const item of leaves) {
      if (item.rect.width < minW || item.rect.height < minH) {
        return false;
      }
      if (item.rect.width <= 0 || item.rect.height <= 0) {
        return false;
      }
    }
    return true;
  };

  if (!isSafe(0)) {
    return 0;
  }

  let lo = 0;
  let hi = MAX_GUTTER_PT;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (isSafe(mid)) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return lo;
}

/**
 * Mathematically uniform corner radius adjustment for RoundedRectangle shapes.
 * a = round4(min(0.5, max(0, radiusPt / min(W_cell, H_cell))))
 */
export function computeCornerAdjustment(radiusPt: number, rect: RectPt): number {
  const minDim = Math.min(rect.width, rect.height);
  if (minDim <= 0 || radiusPt <= 0) {
    return 0;
  }
  return round4(Math.min(0.5, Math.max(0, radiusPt / minDim)));
}

/**
 * Deterministic visual reading order (PRD Section 3.11):
 * 1. role === 'hero' first
 * 2. ascending Math.round(rect.top / 12) (12pt row band tolerance)
 * 3. ascending rect.left
 * 4. tie-breaker: slotId lexicographical order
 */
export function sortReadingOrder(leaves: readonly ResolvedLeaf[]): ResolvedLeaf[] {
  return [...leaves].sort((a, b) => {
    const heroA = a.leaf.role === 'hero' ? 0 : 1;
    const heroB = b.leaf.role === 'hero' ? 0 : 1;
    if (heroA !== heroB) {
      return heroA - heroB;
    }
    const bandA = Math.round(a.rect.top / READING_ORDER_ROW_BAND_PT);
    const bandB = Math.round(b.rect.top / READING_ORDER_ROW_BAND_PT);
    if (bandA !== bandB) {
      return bandA - bandB;
    }
    if (a.rect.left !== b.rect.left) {
      return a.rect.left - b.rect.left;
    }
    if (a.rect.top !== b.rect.top) {
      return a.rect.top - b.rect.top;
    }
    return a.leaf.slotId.localeCompare(b.leaf.slotId);
  });
}

/**
 * Computes a safe slide content area below the typical PowerPoint title zone.
 */
export function computeAutoFitRect(slideBounds: RectPt): RectPt {
  const normalized = normalizeRect(slideBounds);
  const marginX = round2(Math.min(48, normalized.width * 0.05));
  const marginTop = round2(Math.min(108, normalized.height * 0.2));
  const marginBottom = round2(Math.min(42, normalized.height * 0.08));

  return {
    left: round2(normalized.left + marginX),
    top: round2(normalized.top + marginTop),
    width: round2(Math.max(MIN_CELL_FLOOR_PT, normalized.width - marginX * 2)),
    height: round2(Math.max(MIN_CELL_FLOOR_PT, normalized.height - marginTop - marginBottom)),
  };
}
