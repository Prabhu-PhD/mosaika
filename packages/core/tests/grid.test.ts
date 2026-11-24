import { describe, expect, it } from 'vitest';
import type { GridSystemId, RectPt } from '@bento/contract';
import {
  collectLeaves,
  computeGridLattice,
  createIntentBentoDocument,
  LAYOUT_INTENTS,
  resizeSplitRatio,
  resolveSplitHandles,
  resolveTreeLayout,
  round2,
  setGridSystem,
  toggleLeafLock,
} from '../src/index.js';

const SLIDE_AREA: RectPt = { left: 48, top: 108, width: 864, height: 390 };

function assertOnLatticeTracks(
  rect: RectPt,
  lattice: NonNullable<ReturnType<typeof computeGridLattice>>
): void {
  const validLefts = lattice.colBands.map((b) => b.start);
  const validRights = lattice.colBands.map((b) => round2(b.start + b.size));
  const validTops = lattice.rowBands.map((b) => b.start);
  const validBottoms = lattice.rowBands.map((b) => round2(b.start + b.size));

  const tol = 0.05;
  expect(validLefts.some((x) => Math.abs(rect.left - x) <= tol)).toBe(true);
  expect(validRights.some((x) => Math.abs(rect.left + rect.width - x) <= tol)).toBe(true);
  expect(validTops.some((y) => Math.abs(rect.top - y) <= tol)).toBe(true);
  expect(validBottoms.some((y) => Math.abs(rect.top + rect.height - y) <= tol)).toBe(true);
}

describe('@bento/core Swiss Modular Track-Lattice Grid System', () => {
  it('computes exact Muller-Brockmann track widths and cuts across 12x6, 6x4, and 4x3', () => {
    const systems: ReadonlyArray<{ id: Exclude<GridSystemId, 'free'>; cols: number; rows: number }> = [
      { id: 'swiss-12x6', cols: 12, rows: 6 },
      { id: 'deck-6x4', cols: 6, rows: 4 },
      { id: 'matrix-4x3', cols: 4, rows: 3 },
    ];

    for (const sys of systems) {
      const lattice = computeGridLattice(SLIDE_AREA, 10, sys.id);
      expect(lattice).not.toBeNull();
      if (!lattice) continue;

      expect(lattice.cols).toBe(sys.cols);
      expect(lattice.rows).toBe(sys.rows);
      expect(lattice.colBands).toHaveLength(sys.cols);
      expect(lattice.rowBands).toHaveLength(sys.rows);
      expect(lattice.verticalCuts).toHaveLength(sys.cols - 1);
      expect(lattice.horizontalCuts).toHaveLength(sys.rows - 1);

      const expectedColW = (SLIDE_AREA.width - (sys.cols - 1) * 10) / sys.cols;
      const expectedRowH = (SLIDE_AREA.height - (sys.rows - 1) * 10) / sys.rows;
      expect(lattice.colWidth).toBeCloseTo(expectedColW, 4);
      expect(lattice.rowHeight).toBeCloseTo(expectedRowH, 4);

      const lastCol = lattice.colBands[lattice.colBands.length - 1]!;
      expect(round2(lastCol.start + lastCol.size)).toBeCloseTo(
        SLIDE_AREA.left + SLIDE_AREA.width,
        2
      );
    }

    expect(computeGridLattice(SLIDE_AREA, 10, 'free')).toBeNull();
  });

  it('locks every generated card across all 8 intents onto exact global Swiss 12x6 track lines', () => {
    for (const intentDef of LAYOUT_INTENTS) {
      const res = createIntentBentoDocument(SLIDE_AREA, intentDef.id, {
        gridSystem: 'swiss-12x6',
        seed: 48219,
      });
      expect(res.ok).toBe(true);
      if (!res.ok) continue;

      const doc = res.value;
      const lattice = computeGridLattice(doc.anchorRect, doc.params.gutterPt, 'swiss-12x6')!;
      const leaves = resolveTreeLayout(doc.tree, doc.anchorRect, doc.params.gutterPt);

      for (const { rect } of leaves) {
        assertOnLatticeTracks(rect, lattice);
      }
    }
  });

  it('re-snaps cards smoothly when switching grid systems while preserving slotIds and locked 0.00pt invariant', () => {
    const created = createIntentBentoDocument(SLIDE_AREA, 'editorial-story', {
      gridSystem: 'swiss-12x6',
      seed: 48219,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const initialSlots = collectLeaves(created.value.tree).map((l) => l.slotId);
    const switched = setGridSystem(created.value, 'deck-6x4');
    expect(switched.params.gridSystem).toBe('deck-6x4');
    expect(collectLeaves(switched.tree).map((l) => l.slotId)).toEqual(initialSlots);

    const lattice6x4 = computeGridLattice(switched.anchorRect, switched.params.gutterPt, 'deck-6x4')!;
    for (const { rect } of resolveTreeLayout(switched.tree, switched.anchorRect, switched.params.gutterPt)) {
      assertOnLatticeTracks(rect, lattice6x4);
    }

    // Lock first card and switch to matrix-4x3: locked card shifts by strictly 0.00pt
    const lockedSlot = initialSlots[0]!;
    const withLock = toggleLeafLock(switched, lockedSlot);
    const beforeLockedRect = resolveTreeLayout(
      withLock.tree,
      withLock.anchorRect,
      withLock.params.gutterPt
    ).find((r) => r.leaf.slotId === lockedSlot)!.rect;

    const switchedLocked = setGridSystem(withLock, 'matrix-4x3');
    const afterLockedRect = resolveTreeLayout(
      switchedLocked.tree,
      switchedLocked.anchorRect,
      switchedLocked.params.gutterPt
    ).find((r) => r.leaf.slotId === lockedSlot)!.rect;
    expect(afterLockedRect).toEqual(beforeLockedRect);
  });

  it('snaps interactive gutter drags onto global Swiss columns/rows and reports track span metadata', () => {
    const created = createIntentBentoDocument(SLIDE_AREA, 'executive-brief', {
      gridSystem: 'swiss-12x6',
      seed: 48219,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const handles = resolveSplitHandles(
      created.value.tree,
      created.value.anchorRect,
      created.value.params.gutterPt
    );
    const rootHandle = handles[0]!;
    const resized = resizeSplitRatio(created.value, rootHandle.nodeId, 0.34, {
      snapHarmonic: true,
    });

    expect(resized.snappedGridTrack).not.toBeNull();
    if (resized.snappedGridTrack) {
      expect(resized.snappedGridTrack.totalTracks).toBe(
        rootHandle.axis === 'vertical' ? 12 : 6
      );
      expect(resized.snappedGridTrack.firstSpan + resized.snappedGridTrack.secondSpan).toBe(
        resized.snappedGridTrack.totalTracks
      );
    }
  });
});
