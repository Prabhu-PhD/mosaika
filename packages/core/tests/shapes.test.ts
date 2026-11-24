import { describe, expect, it } from 'vitest';
import type { RectPt } from '@bento/contract';
import {
  buildArcNotchSvgPath,
  buildCellRenderSpecs,
  buildCellShapeSvgPath,
  buildLNotchSvgPath,
  CELL_SHAPE_KINDS,
  createIntentBentoDocument,
  mirrorBentoLayout,
  resolveVisualCells,
  setLeafShapeKind,
} from '../src/index.js';

const LANDSCAPE: RectPt = { left: 48, top: 108, width: 864, height: 390 };

describe('@bento/core sculpted shapes & puzzle cutouts', () => {
  it('generates valid SVG paths for all non-rect CellShapeKinds', () => {
    expect(buildCellShapeSvgPath(200, 120, 'rect', 12)).toBeUndefined();
    for (const kind of CELL_SHAPE_KINDS) {
      if (kind === 'rect') continue;
      const path = buildCellShapeSvgPath(200, 120, kind, 14);
      expect(path).toBeDefined();
      expect(path!.startsWith('M ')).toBe(true);
      expect(path!.endsWith(' Z')).toBe(true);
    }
  });

  it('builds valid concave L-notch and circular arc-notch paths for all 4 corners', () => {
    for (const corner of ['tl', 'tr', 'bl', 'br'] as const) {
      const lPath = buildLNotchSvgPath(400, 300, corner, 150, 110, 16);
      expect(lPath.startsWith('M ')).toBe(true);
      expect(lPath.endsWith(' Z')).toBe(true);
      expect(lPath).toContain(' A ');
    }

    const arcBR = buildArcNotchSvgPath(420, 190, 'br', 426, 196, 86, 14);
    expect(arcBR).toBeDefined();
    expect(arcBR).toContain('A 86 86 0 0 0');
  });

  it('supports per-tile shape assignment and graceful degradation when !supportsCustomGeometry', () => {
    const res = createIntentBentoDocument(LANDSCAPE, 'executive-brief', { seed: 48219 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const updated = setLeafShapeKind(res.value, 'slot_01', 'circle');
    const customSpecs = buildCellRenderSpecs(updated, { supportsCustomGeometry: true });
    expect(customSpecs[0]!.shapeKind).toBe('circle');
    expect(customSpecs[0]!.svgPath).toBeDefined();

    const fallbackSpecs = buildCellRenderSpecs(updated, { supportsCustomGeometry: false });
    expect(fallbackSpecs[0]!.shapeKind).toBeUndefined();
    expect(fallbackSpecs[0]!.svgPath).toBeUndefined();
  });

  it('produces Sculpted organic shapes and Puzzle L-Wrap / Center-Hub overlays + mirrors cleanly', () => {
    const sculpted = createIntentBentoDocument(LANDSCAPE, 'sculpted', { seed: 40423 });
    expect(sculpted.ok).toBe(true);
    if (sculpted.ok) {
      const cells = resolveVisualCells(sculpted.value);
      expect(cells.some((c) => c.shapeKind !== 'rect' && Boolean(c.svgPath))).toBe(true);
    }

    // Check both Center-Hub and L-Wrap Puzzle variants across seeds
    let sawCenterHub = false;
    let sawLWrap = false;
    for (let s = 1; s <= 20; s++) {
      const puzzle = createIntentBentoDocument(LANDSCAPE, 'puzzle', { count: 4, seed: s * 101 });
      if (!puzzle.ok) continue;
      if (puzzle.value.sculpt?.kind === 'center-hub') {
        sawCenterHub = true;
        const cells = resolveVisualCells(puzzle.value);
        expect(cells.some((c) => c.slotId === 'slot_hub' && c.shapeKind === 'circle')).toBe(true);
        // At least 4 surrounding cards have carved circular arc notches
        expect(cells.filter((c) => !c.isOverlayCell && Boolean(c.svgPath)).length).toBeGreaterThanOrEqual(4);
      } else if (puzzle.value.sculpt?.kind === 'l-wrap') {
        sawLWrap = true;
        const origCorner = puzzle.value.sculpt.corner;
        const cells = resolveVisualCells(puzzle.value);
        expect(cells.some((c) => c.slotId === 'slot_inset')).toBe(true);
        expect(cells.some((c) => !c.isOverlayCell && Boolean(c.svgPath))).toBe(true);

        const flipped = mirrorBentoLayout(puzzle.value, 'horizontal');
        expect(flipped.ok).toBe(true);
        if (flipped.ok && flipped.value.sculpt?.kind === 'l-wrap') {
          expect(flipped.value.sculpt.corner).not.toBe(origCorner);
        }
      }
    }
    expect(sawCenterHub).toBe(true);
    expect(sawLWrap).toBe(true);
  });
});
