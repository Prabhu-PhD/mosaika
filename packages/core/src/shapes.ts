import type {
  BentoDocumentState,
  BentoSculptOverlay,
  CellRole,
  CellShapeKind,
  CutoutCorner,
  RectPt,
} from '@bento/contract';
import { resolveTreeLayout, round2, sortReadingOrder } from './geometry.js';

export const CELL_SHAPE_KINDS: readonly CellShapeKind[] = [
  'rect',
  'pill',
  'circle',
  'arch',
  'leaf',
  'chamfer',
] as const;

export const CELL_SHAPE_LABELS: Record<CellShapeKind, string> = {
  rect: 'Rect',
  pill: 'Pill',
  circle: 'Circle',
  arch: 'Arch',
  leaf: 'Leaf',
  chamfer: 'Chamfer',
};

export function nextCellShapeKind(current?: CellShapeKind): CellShapeKind {
  const idx = CELL_SHAPE_KINDS.indexOf(current ?? 'rect');
  return CELL_SHAPE_KINDS[(idx + 1) % CELL_SHAPE_KINDS.length]!;
}

type PathCmd =
  | { type: 'M'; x: number; y: number }
  | { type: 'L'; x: number; y: number }
  | { type: 'A'; rx: number; ry: number; laf: 0 | 1; sweep: 0 | 1; x: number; y: number }
  | { type: 'Z' };

function fmt(n: number): string {
  return String(round2(n));
}

function serializeCommands(cmds: readonly PathCmd[]): string {
  return cmds
    .map((c) => {
      switch (c.type) {
        case 'M':
          return `M ${fmt(c.x)} ${fmt(c.y)}`;
        case 'L':
          return `L ${fmt(c.x)} ${fmt(c.y)}`;
        case 'A':
          return `A ${fmt(c.rx)} ${fmt(c.ry)} 0 ${c.laf} ${c.sweep} ${fmt(c.x)} ${fmt(c.y)}`;
        case 'Z':
          return 'Z';
      }
    })
    .join(' ');
}

function reflectCommands(
  cmds: readonly PathCmd[],
  w: number,
  h: number,
  flipX: boolean,
  flipY: boolean
): PathCmd[] {
  const flipSweep = flipX !== flipY;
  return cmds.map((c) => {
    if (c.type === 'Z') return c;
    const x = flipX ? w - c.x : c.x;
    const y = flipY ? h - c.y : c.y;
    if (c.type === 'A') {
      return {
        ...c,
        x,
        y,
        sweep: flipSweep ? ((c.sweep === 1 ? 0 : 1) as 0 | 1) : c.sweep,
      };
    }
    return { ...c, x, y };
  });
}

function buildRoundedRectCommands(
  w: number,
  h: number,
  rTL: number,
  rTR: number,
  rBR: number,
  rBL: number
): PathCmd[] {
  const maxR = Math.min(w, h) / 2;
  const tl = Math.max(0, Math.min(rTL, maxR));
  const tr = Math.max(0, Math.min(rTR, maxR));
  const br = Math.max(0, Math.min(rBR, maxR));
  const bl = Math.max(0, Math.min(rBL, maxR));

  const cmds: PathCmd[] = [{ type: 'M', x: tl, y: 0 }];
  cmds.push({ type: 'L', x: w - tr, y: 0 });
  if (tr > 0.05) cmds.push({ type: 'A', rx: tr, ry: tr, laf: 0, sweep: 1, x: w, y: tr });
  cmds.push({ type: 'L', x: w, y: h - br });
  if (br > 0.05) cmds.push({ type: 'A', rx: br, ry: br, laf: 0, sweep: 1, x: w - br, y: h });
  cmds.push({ type: 'L', x: bl, y: h });
  if (bl > 0.05) cmds.push({ type: 'A', rx: bl, ry: bl, laf: 0, sweep: 1, x: 0, y: h - bl });
  cmds.push({ type: 'L', x: 0, y: tl });
  if (tl > 0.05) cmds.push({ type: 'A', rx: tl, ry: tl, laf: 0, sweep: 1, x: tl, y: 0 });
  cmds.push({ type: 'Z' });
  return cmds;
}

/**
 * Generates an exact local-coordinate (0..w, 0..h) SVG path for any CellShapeKind.
 */
export function buildCellShapeSvgPath(
  w: number,
  h: number,
  shapeKind: CellShapeKind,
  radiusPt: number
): string | undefined {
  if (shapeKind === 'rect') {
    return undefined;
  }

  if (shapeKind === 'pill') {
    const r = Math.min(w, h) / 2;
    return serializeCommands(buildRoundedRectCommands(w, h, r, r, r, r));
  }

  if (shapeKind === 'circle') {
    const r = Math.max(1, Math.min(w, h) / 2);
    const cx = w / 2;
    const cy = h / 2;
    return `M ${fmt(cx - r)} ${fmt(cy)} A ${fmt(r)} ${fmt(r)} 0 1 0 ${fmt(cx + r)} ${fmt(cy)} A ${fmt(r)} ${fmt(r)} 0 1 0 ${fmt(cx - r)} ${fmt(cy)} Z`;
  }

  if (shapeKind === 'arch') {
    const topR = Math.min(w / 2, h * 0.52);
    const botR = Math.min(Math.max(2, radiusPt * 0.5), w * 0.16, h * 0.16);
    return serializeCommands(buildRoundedRectCommands(w, h, topR, topR, botR, botR));
  }

  if (shapeKind === 'leaf') {
    const bigR = Math.min(w, h) * 0.44;
    const smallR = Math.min(Math.max(2, radiusPt * 0.35), 6);
    return serializeCommands(buildRoundedRectCommands(w, h, bigR, smallR, bigR, smallR));
  }

  // 'chamfer': architectural 45-degree snipped corners
  const c = Math.max(6, Math.min(Math.max(12, radiusPt * 1.25), Math.min(w, h) * 0.22));
  return serializeCommands([
    { type: 'M', x: c, y: 0 },
    { type: 'L', x: w - c, y: 0 },
    { type: 'L', x: w, y: c },
    { type: 'L', x: w, y: h - c },
    { type: 'L', x: w - c, y: h },
    { type: 'L', x: c, y: h },
    { type: 'L', x: 0, y: h - c },
    { type: 'L', x: 0, y: c },
    { type: 'Z' },
  ]);
}

/**
 * Generates an exact L-shaped card path with smooth outer corners AND a smooth inverted concave inner corner.
 */
export function buildLNotchSvgPath(
  w: number,
  h: number,
  corner: CutoutCorner,
  cutW: number,
  cutH: number,
  radiusPt: number
): string {
  const cw = Math.max(12, Math.min(cutW, w * 0.68));
  const ch = Math.max(12, Math.min(cutH, h * 0.68));
  const nx = w - cw;
  const ny = h - ch;

  const r = Math.max(0, Math.min(radiusPt, nx * 0.42, ny * 0.42, cw * 0.42, ch * 0.42));
  const ir = Math.max(0, Math.min(Math.max(radiusPt, 8), cw * 0.42, ch * 0.42));

  // Build canonical bottom-right ('br') cutout clockwise
  const brCmds: PathCmd[] = [
    { type: 'M', x: r, y: 0 },
    { type: 'L', x: w - r, y: 0 },
  ];
  if (r > 0.05) brCmds.push({ type: 'A', rx: r, ry: r, laf: 0, sweep: 1, x: w, y: r });
  brCmds.push({ type: 'L', x: w, y: ny - r });
  if (r > 0.05) brCmds.push({ type: 'A', rx: r, ry: r, laf: 0, sweep: 1, x: w - r, y: ny });
  brCmds.push({ type: 'L', x: nx + ir, y: ny });
  if (ir > 0.05) {
    // Inverted concave inner corner (sweep = 0)
    brCmds.push({ type: 'A', rx: ir, ry: ir, laf: 0, sweep: 0, x: nx, y: ny + ir });
  }
  brCmds.push({ type: 'L', x: nx, y: h - r });
  if (r > 0.05) brCmds.push({ type: 'A', rx: r, ry: r, laf: 0, sweep: 1, x: nx - r, y: h });
  brCmds.push({ type: 'L', x: r, y: h });
  if (r > 0.05) brCmds.push({ type: 'A', rx: r, ry: r, laf: 0, sweep: 1, x: 0, y: h - r });
  brCmds.push({ type: 'L', x: 0, y: r });
  if (r > 0.05) brCmds.push({ type: 'A', rx: r, ry: r, laf: 0, sweep: 1, x: r, y: 0 });
  brCmds.push({ type: 'Z' });

  const flipX = corner === 'bl' || corner === 'tl';
  const flipY = corner === 'tr' || corner === 'tl';
  return serializeCommands(reflectCommands(brCmds, w, h, flipX, flipY));
}

/**
 * Generates an exact card contour with a smooth concentric circular arc carved out of one corner
 * to cradle a floating central circle hub with exact `gutterPt` clearance.
 */
export function buildArcNotchSvgPath(
  w: number,
  h: number,
  corner: CutoutCorner,
  localHubCx: number,
  localHubCy: number,
  notchRadius: number,
  radiusPt: number
): string | undefined {
  // Map hub center into canonical bottom-right ('br') frame
  const flipX = corner === 'bl' || corner === 'tl';
  const flipY = corner === 'tr' || corner === 'tl';
  const cx = flipX ? w - localHubCx : localHubCx;
  const cy = flipY ? h - localHubCy : localHubCy;

  const dx = cx - w;
  const dy = cy - h;
  const R = notchRadius;

  // Must intersect both the right edge (x = w) and bottom edge (y = h) cleanly
  if (dx < -1 || dy < -1 || R <= Math.hypot(Math.max(0, dx), Math.max(0, dy)) + 4) {
    return undefined;
  }

  const termX = R * R - dy * dy;
  const termY = R * R - dx * dx;
  if (termX <= 1 || termY <= 1) {
    return undefined;
  }

  const xCut = cx - Math.sqrt(termX);
  const yCut = cy - Math.sqrt(termY);

  if (xCut <= 6 || xCut >= w - 2 || yCut <= 6 || yCut >= h - 2) {
    return undefined;
  }

  const r = Math.max(0, Math.min(radiusPt, xCut * 0.45, yCut * 0.45, w * 0.45, h * 0.45));

  const brCmds: PathCmd[] = [
    { type: 'M', x: r, y: 0 },
    { type: 'L', x: w - r, y: 0 },
  ];
  if (r > 0.05) brCmds.push({ type: 'A', rx: r, ry: r, laf: 0, sweep: 1, x: w, y: r });
  brCmds.push({ type: 'L', x: w, y: yCut });
  // Smooth concave circular arc around (cx, cy)
  brCmds.push({ type: 'A', rx: R, ry: R, laf: 0, sweep: 0, x: xCut, y: h });
  brCmds.push({ type: 'L', x: r, y: h });
  if (r > 0.05) brCmds.push({ type: 'A', rx: r, ry: r, laf: 0, sweep: 1, x: 0, y: h - r });
  brCmds.push({ type: 'L', x: 0, y: r });
  if (r > 0.05) brCmds.push({ type: 'A', rx: r, ry: r, laf: 0, sweep: 1, x: r, y: 0 });
  brCmds.push({ type: 'Z' });

  return serializeCommands(reflectCommands(brCmds, w, h, flipX, flipY));
}

export function mirrorSculptOverlay(
  sculpt: BentoSculptOverlay | undefined,
  direction: 'horizontal' | 'vertical'
): BentoSculptOverlay | undefined {
  if (!sculpt || sculpt.kind !== 'l-wrap') {
    return sculpt;
  }
  const mapH: Record<CutoutCorner, CutoutCorner> = {
    tl: 'tr',
    tr: 'tl',
    bl: 'br',
    br: 'bl',
  };
  const mapV: Record<CutoutCorner, CutoutCorner> = {
    tl: 'bl',
    bl: 'tl',
    tr: 'br',
    br: 'tr',
  };
  return {
    ...sculpt,
    corner: direction === 'horizontal' ? mapH[sculpt.corner] : mapV[sculpt.corner],
  };
}

export interface ResolvedVisualCell {
  slotId: string;
  rect: RectPt;
  role: CellRole;
  locked: boolean;
  shapeKind: CellShapeKind;
  svgPath?: string;
  contentHint?: string;
  isOverlayCell?: boolean;
}

/**
 * Resolves all visual cells for a BentoDocumentState, including per-tile shapes and optional
 * sculptural puzzle overlays (center-hub circular cutout or L-shaped corner wrap).
 */
export function resolveVisualCells(
  state: BentoDocumentState,
  options?: { supportsCustomGeometry?: boolean }
): ResolvedVisualCell[] {
  const allowCustom = options?.supportsCustomGeometry ?? true;
  const sorted = sortReadingOrder(
    resolveTreeLayout(state.tree, state.anchorRect, state.params.gutterPt)
  );
  const r = state.params.radiusPt;
  const g = state.params.gutterPt;

  const cells: ResolvedVisualCell[] = sorted.map(({ leaf, rect }) => {
    const shapeKind: CellShapeKind = allowCustom ? (leaf.shapeKind ?? 'rect') : 'rect';
    const svgPath = allowCustom
      ? buildCellShapeSvgPath(rect.width, rect.height, shapeKind, r)
      : undefined;
    return {
      slotId: leaf.slotId,
      rect,
      role: leaf.role,
      locked: leaf.locked,
      shapeKind,
      ...(svgPath ? { svgPath } : {}),
      ...(leaf.contentHint ? { contentHint: leaf.contentHint } : {}),
    };
  });

  const sculpt = state.sculpt;
  if (!allowCustom || !sculpt || sculpt.kind === 'none') {
    return cells;
  }

  if (sculpt.kind === 'center-hub') {
    const anchor = state.anchorRect;
    const minDim = Math.min(anchor.width, anchor.height);
    const hubR = round2(Math.max(24, Math.min(minDim * 0.25, minDim * sculpt.radiusRatio)));
    const cx = round2(anchor.left + anchor.width / 2);
    const cy = round2(anchor.top + anchor.height / 2);
    const notchR = round2(hubR + Math.max(4, g));

    // Carve smooth circular arcs out of any card whose corner meets the center hub
    for (const cell of cells) {
      const { left, top, width, height } = cell.rect;
      const corners: ReadonlyArray<{ c: CutoutCorner; x: number; y: number }> = [
        { c: 'tl', x: left, y: top },
        { c: 'tr', x: left + width, y: top },
        { c: 'bl', x: left, y: top + height },
        { c: 'br', x: left + width, y: top + height },
      ];
      let nearest = corners[0]!;
      let nearestDist = Number.POSITIVE_INFINITY;
      for (const pt of corners) {
        const d = Math.hypot(pt.x - cx, pt.y - cy);
        if (d < nearestDist) {
          nearestDist = d;
          nearest = pt;
        }
      }
      if (nearestDist < notchR - 4) {
        const carved = buildArcNotchSvgPath(
          width,
          height,
          nearest.c,
          cx - left,
          cy - top,
          notchR,
          r
        );
        if (carved) {
          cell.svgPath = carved;
          cell.shapeKind = 'rect';
          // Demote surrounding hero role so the floating center circle takes spotlight
          if (cell.role === 'hero') {
            cell.role = 'standard';
          }
        }
      }
    }

    const hubDiameter = round2(hubR * 2);
    const hubRect: RectPt = {
      left: round2(cx - hubR),
      top: round2(cy - hubR),
      width: hubDiameter,
      height: hubDiameter,
    };
    cells.push({
      slotId: 'slot_hub',
      rect: hubRect,
      role: 'hero',
      locked: false,
      shapeKind: 'circle',
      svgPath: buildCellShapeSvgPath(hubDiameter, hubDiameter, 'circle', r),
      contentHint: sculpt.hubHint ?? 'Core Hub',
      isOverlayCell: true,
    });

    return cells;
  }

  if (sculpt.kind === 'l-wrap') {
    // Pick the largest card (preferring hero) to carve into an architectural L-shape
    let targetCell = cells.find((c) => c.role === 'hero');
    if (!targetCell) {
      targetCell = [...cells].sort(
        (a, b) => b.rect.width * b.rect.height - a.rect.width * a.rect.height
      )[0];
    }
    if (!targetCell || targetCell.rect.width < 110 || targetCell.rect.height < 90) {
      return cells;
    }

    const { left, top, width, height } = targetCell.rect;
    const gap = Math.max(4, g);
    const insetW = round2(Math.max(44, Math.min(width * 0.56, width * sculpt.insetWidthRatio)));
    const insetH = round2(Math.max(36, Math.min(height * 0.56, height * sculpt.insetHeightRatio)));
    const cutW = round2(insetW + gap);
    const cutH = round2(insetH + gap);

    targetCell.svgPath = buildLNotchSvgPath(width, height, sculpt.corner, cutW, cutH, r);
    targetCell.shapeKind = 'rect';

    const insetLeft =
      sculpt.corner === 'tl' || sculpt.corner === 'bl' ? left : round2(left + width - insetW);
    const insetTop =
      sculpt.corner === 'tl' || sculpt.corner === 'tr' ? top : round2(top + height - insetH);

    const insetShape: CellShapeKind = sculpt.insetShape ?? 'rect';
    const insetRect: RectPt = {
      left: insetLeft,
      top: insetTop,
      width: insetW,
      height: insetH,
    };
    const insetPath = buildCellShapeSvgPath(insetW, insetH, insetShape, r);

    cells.push({
      slotId: 'slot_inset',
      rect: insetRect,
      role: 'standard',
      locked: false,
      shapeKind: insetShape,
      ...(insetPath ? { svgPath: insetPath } : {}),
      contentHint: sculpt.insetHint ?? 'Inset Highlight',
      isOverlayCell: true,
    });

    return cells;
  }

  return cells;
}
