import { describe, expect, it } from 'vitest';
import type { BentoDocumentState, RectPt } from '@bento/contract';
import {
  canMergeLeaves,
  collectLeaves,
  computeLayoutDiff,
  computeMinCellDimensions,
  createBentoDocument,
  mergeLeaves,
  mirrorBentoLayout,
  nextDeterministicSeed,
  reflowMissingSlots,
  regenerateWithLocks,
  resizeSplitRatio,
  resolveSplitHandles,
  resolveTreeLayout,
  splitLeaf,
  toggleLeafLock,
} from '../src/index.js';

const SLIDE_CONTENT_RECT: RectPt = { left: 48, top: 108, width: 864, height: 390 };
const TOLERANCE_PT = 0.02;

function getRectBySlot(doc: BentoDocumentState): Map<string, RectPt> {
  const map = new Map<string, RectPt>();
  for (const item of resolveTreeLayout(doc.tree, doc.anchorRect, doc.params.gutterPt)) {
    map.set(item.leaf.slotId, item.rect);
  }
  return map;
}

describe('@bento/core locks, reflow, split/merge, and stable slotId diffing', () => {
  it('keeps single and multi-branch locked cells pixel-identical (0.00pt delta) across 50 randomizations and count mutations', () => {
    const initialRes = createBentoDocument(SLIDE_CONTENT_RECT, {
      count: 6,
      gutterPt: 10,
      heroBias: 0.5,
      seed: 104729,
    });
    expect(initialRes.ok).toBe(true);
    if (!initialRes.ok) return;

    let doc = initialRes.value;
    const leaves = collectLeaves(doc.tree);
    expect(leaves.length).toBe(6);

    // Lock two leaves (first and last in tree to span both branches of the root split)
    const lockedSlotA = leaves[0]!.slotId;
    const lockedSlotB = leaves[leaves.length - 1]!.slotId;
    doc = toggleLeafLock(doc, lockedSlotA);
    doc = toggleLeafLock(doc, lockedSlotB);

    const beforeRects = getRectBySlot(doc);
    const expectedRectA = beforeRects.get(lockedSlotA)!;
    const expectedRectB = beforeRects.get(lockedSlotB)!;

    let seed = doc.params.seed;
    for (let i = 0; i < 50; i++) {
      seed = nextDeterministicSeed(seed);
      const nextCount = 4 + (i % 6); // cycles 4..9
      const mutated = regenerateWithLocks(doc, { seed, count: nextCount });
      expect(mutated.ok).toBe(true);
      if (!mutated.ok) continue;

      doc = mutated.value;
      const afterRects = getRectBySlot(doc);
      const actualA = afterRects.get(lockedSlotA);
      const actualB = afterRects.get(lockedSlotB);

      expect(actualA).toEqual(expectedRectA);
      expect(actualB).toEqual(expectedRectB);

      // Verify exact perimeter coverage still holds
      const allRects = [...afterRects.values()];
      const minLeft = Math.min(...allRects.map((r) => r.left));
      const minTop = Math.min(...allRects.map((r) => r.top));
      const maxRight = Math.max(...allRects.map((r) => r.left + r.width));
      const maxBottom = Math.max(...allRects.map((r) => r.top + r.height));

      expect(Math.abs(minLeft - doc.anchorRect.left)).toBeLessThanOrEqual(TOLERANCE_PT);
      expect(Math.abs(minTop - doc.anchorRect.top)).toBeLessThanOrEqual(TOLERANCE_PT);
      expect(
        Math.abs(maxRight - (doc.anchorRect.left + doc.anchorRect.width))
      ).toBeLessThanOrEqual(TOLERANCE_PT);
      expect(
        Math.abs(maxBottom - (doc.anchorRect.top + doc.anchorRect.height))
      ).toBeLessThanOrEqual(TOLERANCE_PT);
    }
  });

  it('returns ALL_CELLS_LOCKED when attempting to randomize or change count with every leaf locked', () => {
    const created = createBentoDocument(SLIDE_CONTENT_RECT, { count: 4, seed: 777 });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    let doc = created.value;
    for (const leaf of collectLeaves(doc.tree)) {
      doc = toggleLeafLock(doc, leaf.slotId);
    }

    const res = regenerateWithLocks(doc, { seed: 888, count: 6 });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.errorCode).toBe('ALL_CELLS_LOCKED');
    }
  });

  it('heals gaps with 100% container coverage after deleting 1, 2, or 3 arbitrary leaves', () => {
    const created = createBentoDocument(SLIDE_CONTENT_RECT, {
      count: 7,
      gutterPt: 12,
      heroBias: 0.5,
      seed: 48219,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const baseDoc = created.value;
    const allSlots = collectLeaves(baseDoc.tree).map((l) => l.slotId);

    const deletionSets = [
      [allSlots[0]!],
      [allSlots[1]!, allSlots[5]!],
      [allSlots[0]!, allSlots[2]!, allSlots[6]!],
    ];

    for (const toDelete of deletionSets) {
      const deletedSet = new Set(toDelete);
      const surviving = new Set(allSlots.filter((id) => !deletedSet.has(id)));
      const healed = reflowMissingSlots(baseDoc, surviving);

      expect(healed).not.toBeNull();
      if (!healed) continue;

      expect(healed.params.count).toBe(surviving.size);
      expect(healed.revision).toBe(baseDoc.revision + 1);

      const resolved = resolveTreeLayout(healed.tree, healed.anchorRect, healed.params.gutterPt);
      expect(resolved).toHaveLength(surviving.size);

      // Zero overlap
      for (let i = 0; i < resolved.length; i++) {
        for (let j = i + 1; j < resolved.length; j++) {
          const a = resolved[i]!.rect;
          const b = resolved[j]!.rect;
          const xOverlap = Math.max(
            0,
            Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left)
          );
          const yOverlap = Math.max(
            0,
            Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top)
          );
          expect(xOverlap * yOverlap).toBe(0);
        }
      }

      // 100% perimeter coverage
      const minLeft = Math.min(...resolved.map((r) => r.rect.left));
      const minTop = Math.min(...resolved.map((r) => r.rect.top));
      const maxRight = Math.max(...resolved.map((r) => r.rect.left + r.rect.width));
      const maxBottom = Math.max(...resolved.map((r) => r.rect.top + r.rect.height));

      expect(Math.abs(minLeft - baseDoc.anchorRect.left)).toBeLessThanOrEqual(TOLERANCE_PT);
      expect(Math.abs(minTop - baseDoc.anchorRect.top)).toBeLessThanOrEqual(TOLERANCE_PT);
      expect(
        Math.abs(maxRight - (baseDoc.anchorRect.left + baseDoc.anchorRect.width))
      ).toBeLessThanOrEqual(TOLERANCE_PT);
      expect(
        Math.abs(maxBottom - (baseDoc.anchorRect.top + baseDoc.anchorRect.height))
      ).toBeLessThanOrEqual(TOLERANCE_PT);
    }

    // Deleting every slot returns null
    expect(reflowMissingSlots(baseDoc, new Set())).toBeNull();
  });

  it('restores exact parent bounds on split followed by merge, and rejects non-sibling merges', () => {
    const created = createBentoDocument(SLIDE_CONTENT_RECT, {
      count: 4,
      gutterPt: 10,
      seed: 12345,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const doc = created.value;
    const beforeRects = getRectBySlot(doc);
    const targetSlot = collectLeaves(doc.tree)[0]!.slotId;
    const originalRect = beforeRects.get(targetSlot)!;

    // Split vertically (or horizontally if narrow)
    const splitRes = splitLeaf(doc, targetSlot, 'vertical');
    expect(splitRes.ok).toBe(true);
    if (!splitRes.ok) return;

    const afterSplit = splitRes.value;
    expect(afterSplit.params.count).toBe(doc.params.count + 1);
    const newSlot = collectLeaves(afterSplit.tree)
      .map((l) => l.slotId)
      .find((id) => !beforeRects.has(id))!;

    expect(canMergeLeaves(afterSplit.tree, targetSlot, newSlot)).toBe(true);

    // Merge them back
    const mergedRes = mergeLeaves(afterSplit, targetSlot, newSlot);
    expect(mergedRes.ok).toBe(true);
    if (!mergedRes.ok) return;

    const afterMergeRects = getRectBySlot(mergedRes.value);
    expect(afterMergeRects.get(targetSlot)).toEqual(originalRect);
    expect(afterMergeRects.has(newSlot)).toBe(false);

    // Non-sibling merge check
    const allSlots = collectLeaves(afterSplit.tree).map((l) => l.slotId);
    const nonSibling = allSlots.find((id) => id !== targetSlot && id !== newSlot)!;
    expect(canMergeLeaves(afterSplit.tree, targetSlot, nonSibling)).toBe(false);
    const badMerge = mergeLeaves(afterSplit, targetSlot, nonSibling);
    expect(badMerge.ok).toBe(false);
    if (!badMerge.ok) {
      expect(badMerge.errorCode).toBe('NON_SIBLING_MERGE');
    }
  });

  it('rejects splitting a leaf too small for minW/minH with CONTAINER_TOO_SMALL', () => {
    const small: RectPt = { left: 0, top: 0, width: 120, height: 120 };
    const created = createBentoDocument(small, { count: 2, gutterPt: 10, seed: 5 });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    expect(created.value.tree.kind).toBe('split');
    const rootAxis = created.value.tree.kind === 'split' ? created.value.tree.axis : 'vertical';
    const slot = collectLeaves(created.value.tree)[0]!.slotId;
    // Splitting again along rootAxis requires 2*48 + 10 = 106pt, while each child is ~55pt
    const splitRes = splitLeaf(created.value, slot, rootAxis);
    expect(splitRes.ok).toBe(false);
    if (!splitRes.ok) {
      expect(splitRes.errorCode).toBe('CONTAINER_TOO_SMALL');
    }
  });

  it('preserves stable slotIds on Randomize and outputs exact retireSlotIds when count shrinks', () => {
    const created = createBentoDocument(SLIDE_CONTENT_RECT, { count: 6, seed: 101 });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const initialDoc = created.value;
    const initialSlots = new Set(collectLeaves(initialDoc.tree).map((l) => l.slotId));

    // Randomize with same count: zero creates, zero retires, all 6 updated in-place
    const rerolled = regenerateWithLocks(initialDoc, { seed: 202 });
    expect(rerolled.ok).toBe(true);
    if (!rerolled.ok) return;

    const rerollDiff = computeLayoutDiff(initialDoc, rerolled.value, initialSlots, {
      commitUndoEntry: true,
    });
    expect(rerollDiff.create).toHaveLength(0);
    expect(rerollDiff.retireSlotIds).toHaveLength(0);
    expect(rerollDiff.update).toHaveLength(6);

    // Shrink count from 6 -> 4: exactly 2 retired slots, 4 updated, 0 created
    const shrunk = regenerateWithLocks(rerolled.value, { count: 4 });
    expect(shrunk.ok).toBe(true);
    if (!shrunk.ok) return;

    const shrinkDiff = computeLayoutDiff(rerolled.value, shrunk.value, initialSlots, {
      commitUndoEntry: true,
    });
    expect(shrinkDiff.create).toHaveLength(0);
    expect(shrinkDiff.update).toHaveLength(4);
    expect(shrinkDiff.retireSlotIds).toHaveLength(2);
  });

  it('supports interactive split-gutter resizing with harmonic snapping, minW/minH clamping, and lock protection', () => {
    const created = createBentoDocument(SLIDE_CONTENT_RECT, {
      intent: 'executive-brief',
      count: 5,
      gutterPt: 10,
      seed: 48219,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const doc = created.value;
    const handles = resolveSplitHandles(doc.tree, doc.anchorRect, doc.params.gutterPt);
    // 5 leaves -> exactly 4 internal BSP split handles
    expect(handles).toHaveLength(4);

    const rootHandle = handles[0]!;
    expect(rootHandle.locked).toBe(false);

    // 1. Magnetic snap near 0.50 -> snaps cleanly to 0.50
    const snapped = resizeSplitRatio(doc, rootHandle.nodeId, 0.51, { snapHarmonic: true });
    expect(snapped.snappedTo).toBe(0.5);
    expect(snapped.appliedRatio).toBeCloseTo(0.5, 2);

    // 2. Dragging to extreme 0.01 or 0.99 clamps cleanly so every nested leaf stays >= minW / minH
    const { minW, minH } = computeMinCellDimensions(doc.anchorRect);
    for (const extreme of [0.01, 0.99]) {
      const clamped = resizeSplitRatio(doc, rootHandle.nodeId, extreme, { snapHarmonic: false });
      const leaves = resolveTreeLayout(
        clamped.state.tree,
        clamped.state.anchorRect,
        clamped.state.params.gutterPt
      );
      for (const item of leaves) {
        expect(item.rect.width).toBeGreaterThanOrEqual(minW);
        expect(item.rect.height).toBeGreaterThanOrEqual(minH);
      }
      const maxRight = Math.max(...leaves.map((l) => l.rect.left + l.rect.width));
      const maxBottom = Math.max(...leaves.map((l) => l.rect.top + l.rect.height));
      expect(
        Math.abs(maxRight - (doc.anchorRect.left + doc.anchorRect.width))
      ).toBeLessThanOrEqual(TOLERANCE_PT);
      expect(
        Math.abs(maxBottom - (doc.anchorRect.top + doc.anchorRect.height))
      ).toBeLessThanOrEqual(TOLERANCE_PT);
    }

    // 3. Locking a leaf freezes all ancestor split handles (0.00pt shift)
    const firstSlot = collectLeaves(doc.tree)[0]!.slotId;
    const lockedDoc = toggleLeafLock(doc, firstSlot);
    const lockedHandles = resolveSplitHandles(
      lockedDoc.tree,
      lockedDoc.anchorRect,
      lockedDoc.params.gutterPt
    );
    expect(lockedHandles[0]!.locked).toBe(true);
    const blocked = resizeSplitRatio(lockedDoc, lockedHandles[0]!.nodeId, 0.35);
    expect(blocked.state).toBe(lockedDoc);
  });

  it('mirrors layouts horizontally and vertically as exact involutions while protecting locked cards', () => {
    const created = createBentoDocument(SLIDE_CONTENT_RECT, {
      intent: 'editorial-story',
      gridSystem: 'swiss-12x6',
      count: 5,
      gutterPt: 12,
      seed: 48219,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const doc = created.value;
    const beforeRects = getRectBySlot(doc);

    // Flip H moves Hero from left side to right side symmetrically
    const flippedH = mirrorBentoLayout(doc, 'horizontal');
    expect(flippedH.ok).toBe(true);
    if (!flippedH.ok) return;

    const afterHRects = getRectBySlot(flippedH.value);
    for (const [slotId, rBefore] of beforeRects.entries()) {
      const rAfter = afterHRects.get(slotId)!;
      const expectedLeft =
        doc.anchorRect.left + doc.anchorRect.width - (rBefore.left - doc.anchorRect.left) - rBefore.width;
      expect(Math.abs(rAfter.left - expectedLeft)).toBeLessThanOrEqual(0.05);
      expect(Math.abs(rAfter.width - rBefore.width)).toBeLessThanOrEqual(0.05);
    }

    // Flip H a second time restores exact original geometry (involution)
    const restoredH = mirrorBentoLayout(flippedH.value, 'horizontal');
    expect(restoredH.ok).toBe(true);
    if (restoredH.ok) {
      const restoredRects = getRectBySlot(restoredH.value);
      for (const [slotId, rBefore] of beforeRects.entries()) {
        const rRestored = restoredRects.get(slotId)!;
        expect(Math.abs(rRestored.left - rBefore.left)).toBeLessThanOrEqual(0.05);
        expect(Math.abs(rRestored.width - rBefore.width)).toBeLessThanOrEqual(0.05);
      }
    }

    // Flip V moves top cards to bottom symmetrically
    const flippedV = mirrorBentoLayout(doc, 'vertical');
    expect(flippedV.ok).toBe(true);
    if (flippedV.ok) {
      const afterVRects = getRectBySlot(flippedV.value);
      for (const [slotId, rBefore] of beforeRects.entries()) {
        const rAfter = afterVRects.get(slotId)!;
        const expectedTop =
          doc.anchorRect.top + doc.anchorRect.height - (rBefore.top - doc.anchorRect.top) - rBefore.height;
        expect(Math.abs(rAfter.top - expectedTop)).toBeLessThanOrEqual(0.05);
      }
    }

    // Locked card remains strictly at 0.00pt delta during mirror
    const lockedSlot = collectLeaves(doc.tree)[0]!.slotId;
    const lockedDoc = toggleLeafLock(doc, lockedSlot);
    const lockedBefore = getRectBySlot(lockedDoc).get(lockedSlot)!;
    const mirrorLocked = mirrorBentoLayout(lockedDoc, 'horizontal');
    if (mirrorLocked.ok) {
      expect(getRectBySlot(mirrorLocked.value).get(lockedSlot)).toEqual(lockedBefore);
    } else {
      expect(mirrorLocked.errorCode).toBe('ALL_CELLS_LOCKED');
    }
  });
});
