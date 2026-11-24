import { describe, expect, it } from 'vitest';
import type { BspNode, LayoutIntent, RectPt } from '@bento/contract';
import {
  buildCellRenderSpecs,
  computeCornerAdjustment,
  computeMinCellDimensions,
  computeSafeMaxGutter,
  createBentoDocument,
  createIntentBentoDocument,
  formatSeedCode,
  generateMultiSlideItems,
  hydrateStateFromJson,
  LAYOUT_INTENTS,
  MAX_GUTTER_PT,
  parseSeedCode,
  resolveTreeLayout,
  round2,
  updateNonStructuralParams,
} from '../src/index.js';

const ALL_INTENTS: readonly LayoutIntent[] = LAYOUT_INTENTS.map((i) => i.id);

const ASPECT_RATIOS: ReadonlyArray<{ name: string; rect: RectPt }> = [
  { name: '16:9 full', rect: { left: 48, top: 108, width: 864, height: 390 } },
  { name: 'half-slide tall', rect: { left: 48, top: 30, width: 420, height: 480 } },
  { name: 'wide banner', rect: { left: 40, top: 180, width: 880, height: 140 } },
  { name: 'square', rect: { left: 280, top: 70, width: 400, height: 400 } },
  { name: 'tiny 160x120pt', rect: { left: 100, top: 100, width: 160, height: 120 } },
];

const HERO_BIASES = [0, 0.5, 1.0] as const;
const TOLERANCE_PT = 0.02;

function rectIntersectionArea(a: RectPt, b: RectPt): number {
  const aLeft = Math.round(a.left * 100);
  const aTop = Math.round(a.top * 100);
  const aRight = Math.round((a.left + a.width) * 100);
  const aBottom = Math.round((a.top + a.height) * 100);

  const bLeft = Math.round(b.left * 100);
  const bTop = Math.round(b.top * 100);
  const bRight = Math.round((b.left + b.width) * 100);
  const bBottom = Math.round((b.top + b.height) * 100);

  const xOverlap = Math.max(0, Math.min(aRight, bRight) - Math.max(aLeft, bLeft));
  const yOverlap = Math.max(0, Math.min(aBottom, bBottom) - Math.max(aTop, bTop));
  return (xOverlap * yOverlap) / 10000;
}

function assertInternalSplitGutters(
  node: BspNode,
  rect: RectPt,
  gutterPt: number
): void {
  if (node.kind === 'leaf') {
    return;
  }

  if (node.axis === 'vertical') {
    const availW = Math.max(0, round2(rect.width - gutterPt));
    const w1 = round2(availW * node.ratio);
    const w2 = round2(availW - w1);
    const firstRect: RectPt = { left: rect.left, top: rect.top, width: w1, height: rect.height };
    const secondRect: RectPt = {
      left: round2(rect.left + w1 + gutterPt),
      top: rect.top,
      width: w2,
      height: rect.height,
    };

    const firstLeaves = resolveTreeLayout(node.first, firstRect, gutterPt);
    const secondLeaves = resolveTreeLayout(node.second, secondRect, gutterPt);

    const maxFirstRight = Math.max(...firstLeaves.map((l) => l.rect.left + l.rect.width));
    const minSecondLeft = Math.min(...secondLeaves.map((l) => l.rect.left));
    const gap = round2(minSecondLeft - maxFirstRight);
    expect(Math.abs(gap - gutterPt)).toBeLessThanOrEqual(TOLERANCE_PT);

    assertInternalSplitGutters(node.first, firstRect, gutterPt);
    assertInternalSplitGutters(node.second, secondRect, gutterPt);
  } else {
    const availH = Math.max(0, round2(rect.height - gutterPt));
    const h1 = round2(availH * node.ratio);
    const h2 = round2(availH - h1);
    const firstRect: RectPt = { left: rect.left, top: rect.top, width: rect.width, height: h1 };
    const secondRect: RectPt = {
      left: rect.left,
      top: round2(rect.top + h1 + gutterPt),
      width: rect.width,
      height: h2,
    };

    const firstLeaves = resolveTreeLayout(node.first, firstRect, gutterPt);
    const secondLeaves = resolveTreeLayout(node.second, secondRect, gutterPt);

    const maxFirstBottom = Math.max(...firstLeaves.map((l) => l.rect.top + l.rect.height));
    const minSecondTop = Math.min(...secondLeaves.map((l) => l.rect.top));
    const gap = round2(minSecondTop - maxFirstBottom);
    expect(Math.abs(gap - gutterPt)).toBeLessThanOrEqual(TOLERANCE_PT);

    assertInternalSplitGutters(node.first, firstRect, gutterPt);
    assertInternalSplitGutters(node.second, secondRect, gutterPt);
  }
}

describe('@bento/core geometric invariants (1,000 seeds x 5 aspect ratios)', () => {
  for (const aspect of ASPECT_RATIOS) {
    it(`holds all geometric invariants across 1,000 seeds for ${aspect.name}`, () => {
      const { minW, minH } = computeMinCellDimensions(aspect.rect);

      for (let seed = 1; seed <= 1000; seed++) {
        const intent = ALL_INTENTS[seed % ALL_INTENTS.length]!;
        const targetCount = 2 + (seed % 11); // 2..12
        const gutterPt = (seed * 7) % 33; // 0..32
        const heroBias = HERO_BIASES[seed % HERO_BIASES.length]!;
        const radiusPt = (seed * 3) % 33; // 0..32

        const result = createBentoDocument(aspect.rect, {
          intent,
          count: targetCount,
          gutterPt,
          heroBias,
          radiusPt,
          seed,
        });

        expect(result.ok).toBe(true);
        if (!result.ok) {
          continue;
        }

        const doc = result.value;
        const resolved = resolveTreeLayout(doc.tree, doc.anchorRect, doc.params.gutterPt);

        // When minW/minH legitimately caps splits (e.g. tiny 160x120), leafCount <= targetCount
        expect(resolved.length).toBeGreaterThanOrEqual(1);
        expect(resolved.length).toBeLessThanOrEqual(targetCount);
        expect(doc.params.count).toBe(resolved.length);

        // Invariant 1: Zero overlap for all distinct leaf pairs
        for (let i = 0; i < resolved.length; i++) {
          for (let j = i + 1; j < resolved.length; j++) {
            const area = rectIntersectionArea(resolved[i]!.rect, resolved[j]!.rect);
            expect(area).toBe(0);
          }
        }

        // Invariant 2: Exact perimeter fit within 0.02pt tolerance
        const minLeft = Math.min(...resolved.map((r) => r.rect.left));
        const minTop = Math.min(...resolved.map((r) => r.rect.top));
        const maxRight = Math.max(...resolved.map((r) => r.rect.left + r.rect.width));
        const maxBottom = Math.max(...resolved.map((r) => r.rect.top + r.rect.height));

        expect(Math.abs(minLeft - doc.anchorRect.left)).toBeLessThanOrEqual(TOLERANCE_PT);
        expect(Math.abs(minTop - doc.anchorRect.top)).toBeLessThanOrEqual(TOLERANCE_PT);
        expect(
          Math.abs(maxRight - (doc.anchorRect.left + doc.anchorRect.width))
        ).toBeLessThanOrEqual(TOLERANCE_PT);
        expect(
          Math.abs(maxBottom - (doc.anchorRect.top + doc.anchorRect.height))
        ).toBeLessThanOrEqual(TOLERANCE_PT);

        // Invariant 3: Exact internal gutter within 0.02pt tolerance
        assertInternalSplitGutters(doc.tree, doc.anchorRect, doc.params.gutterPt);

        // Invariant 4 & 5: Minimum dimension floor & valid corner adjustment [0..0.5]
        for (const item of resolved) {
          expect(item.rect.width).toBeGreaterThanOrEqual(minW);
          expect(item.rect.height).toBeGreaterThanOrEqual(minH);

          const adj = computeCornerAdjustment(radiusPt, item.rect);
          expect(adj).toBeGreaterThanOrEqual(0);
          expect(adj).toBeLessThanOrEqual(0.5);
        }
      }
    });
  }

  it('enforces computeSafeMaxGutter so dragging gutter up never breaches minW/minH or 0pt', () => {
    for (const aspect of ASPECT_RATIOS) {
      const { minW, minH } = computeMinCellDimensions(aspect.rect);
      for (let seed = 1; seed <= 50; seed++) {
        const res = createBentoDocument(aspect.rect, {
          count: 10,
          gutterPt: 0,
          heroBias: 0.5,
          seed,
        });
        expect(res.ok).toBe(true);
        if (!res.ok) continue;

        const doc = res.value;
        const safeMax = computeSafeMaxGutter(doc.tree, doc.anchorRect);
        expect(safeMax).toBeGreaterThanOrEqual(0);
        expect(safeMax).toBeLessThanOrEqual(MAX_GUTTER_PT);

        // Applying safeMax must keep all leaves >= minW / minH
        const safeLeaves = resolveTreeLayout(doc.tree, doc.anchorRect, safeMax);
        for (const leaf of safeLeaves) {
          expect(leaf.rect.width).toBeGreaterThanOrEqual(minW);
          expect(leaf.rect.height).toBeGreaterThanOrEqual(minH);
        }

        // Updating gutter above safeMax via updateNonStructuralParams clamps safely
        const updated = updateNonStructuralParams(doc, { gutterPt: MAX_GUTTER_PT });
        expect(updated.params.gutterPt).toBe(safeMax);

        // If safeMax < MAX_GUTTER_PT, safeMax + 1 must actually breach minW or minH
        if (safeMax < MAX_GUTTER_PT) {
          const nextLeaves = resolveTreeLayout(doc.tree, doc.anchorRect, safeMax + 1);
          const breached = nextLeaves.some(
            (l) => l.rect.width < minW || l.rect.height < minH
          );
          expect(breached).toBe(true);
        }
      }
    }
  });

  it('clamps undersized containers (< minW or < minH) to 1 cell with CONTAINER_TOO_SMALL warning', () => {
    const tiny: RectPt = { left: 10, top: 10, width: 32, height: 30 };
    const result = createBentoDocument(tiny, { count: 5, gutterPt: 10, seed: 42 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.warning).toBe('CONTAINER_TOO_SMALL');
    expect(result.value.params.count).toBe(1);
    const leaves = resolveTreeLayout(result.value.tree, result.value.anchorRect, 10);
    expect(leaves).toHaveLength(1);
    expect(leaves[0]!.rect).toEqual(tiny);
  });

  it('is 100% deterministic for identical inputs and round-trips Seed Code grammar', () => {
    const rect: RectPt = { left: 48, top: 108, width: 864, height: 390 };
    const a = createBentoDocument(rect, { count: 6, gutterPt: 12, heroBias: 0.75, seed: 48219 });
    const b = createBentoDocument(rect, { count: 6, gutterPt: 12, heroBias: 0.75, seed: 48219 });
    expect(a).toEqual(b);

    if (a.ok) {
      const specsA = buildCellRenderSpecs(a.value);
      const specsB = buildCellRenderSpecs(b.ok ? b.value : a.value);
      expect(specsA).toEqual(specsB);
    }

    const formatted = formatSeedCode(5, 48219);
    expect(formatted).toBe('B5-48219');
    expect(parseSeedCode('b5-48219')).toEqual({ count: 5, seed: 48219 });
    expect(parseSeedCode('B12-999999')).toEqual({ count: 12, seed: 999999 });
    expect(parseSeedCode('invalid')).toBeNull();
    expect(parseSeedCode('B0-123')).toBeNull();
    expect(parseSeedCode('B17-123')).toBeNull();
  });

  it('produces structurally faithful intent layouts, semantic hints, and story-arc multi-slides', () => {
    const landscape: RectPt = { left: 48, top: 108, width: 864, height: 390 };
    const portrait: RectPt = { left: 48, top: 30, width: 320, height: 480 };

    // 1. Compare intent creates visually fair 50/50 split on both landscape (V) and portrait (H)
    const cmpLand = createIntentBentoDocument(landscape, 'comparison', { seed: 42 });
    expect(cmpLand.ok).toBe(true);
    if (cmpLand.ok) {
      expect(cmpLand.value.tree.kind).toBe('split');
      if (cmpLand.value.tree.kind === 'split') {
        expect(cmpLand.value.tree.axis).toBe('vertical');
        expect(cmpLand.value.tree.ratio).toBeCloseTo(0.5, 2);
      }
      const specs = buildCellRenderSpecs(cmpLand.value);
      expect(specs.some((s) => s.contentHint?.startsWith('Option A'))).toBe(true);
      expect(specs.some((s) => s.contentHint?.startsWith('Option B'))).toBe(true);
    }

    const cmpPort = createIntentBentoDocument(portrait, 'comparison', { seed: 42 });
    expect(cmpPort.ok).toBe(true);
    if (cmpPort.ok && cmpPort.value.tree.kind === 'split') {
      expect(cmpPort.value.tree.axis).toBe('horizontal');
      expect(cmpPort.value.tree.ratio).toBeCloseTo(0.5, 2);
    }

    // 2. Every intent assigns non-empty semantic contentHints to all cards
    for (const intent of ALL_INTENTS) {
      const res = createIntentBentoDocument(landscape, intent, { seed: 48219 });
      expect(res.ok).toBe(true);
      if (!res.ok) continue;
      const specs = buildCellRenderSpecs(res.value);
      expect(specs.length).toBeGreaterThanOrEqual(2);
      for (const spec of specs) {
        expect(spec.contentHint && spec.contentHint.length > 0).toBe(true);
      }
    }

    // 3. Deck Builder multi-slide generates a multi-intent narrative arc
    const base = createIntentBentoDocument(landscape, 'executive-brief', { seed: 48219 });
    expect(base.ok).toBe(true);
    if (base.ok) {
      const slides = generateMultiSlideItems(base.value, {
        mode: 'deck-builder',
        slideCount: 4,
        morphNamingEnabled: true,
        supportsAutoMorph: true,
        styleOptions: { supportsShadows: true },
      });
      expect(slides).toHaveLength(4);
      const slideIntents = slides.map(
        (s) => hydrateStateFromJson(s.cells[0]!.tags.BENTO_STATE!)?.params.intent
      );
      expect(slideIntents).toEqual([
        'executive-brief',
        'kpi-dashboard',
        'product-showcase',
        'editorial-story',
      ]);
    }

    // 4. Hairline Matrix (0pt gutter, 0pt radius, 9-card diagonal staggered 4-track rows with 0.00pt sightline alignment)
    const matrix = createIntentBentoDocument(landscape, 'matrix-grid', { seed: 48219 });
    expect(matrix.ok).toBe(true);
    if (matrix.ok) {
      expect(matrix.value.params.count).toBe(9);
      expect(matrix.value.params.gutterPt).toBe(0);
      expect(matrix.value.params.radiusPt).toBe(0);
      const resolved = resolveTreeLayout(
        matrix.value.tree,
        matrix.value.anchorRect,
        matrix.value.params.gutterPt
      );
      expect(resolved).toHaveLength(9);
      // Every vertical internal edge snaps strictly to quarter tracks (left + 1/4, 1/2, 3/4)
      const q1 = round2(landscape.left + landscape.width * 0.25);
      const q2 = round2(landscape.left + landscape.width * 0.5);
      const q3 = round2(landscape.left + landscape.width * 0.75);
      const allowedX = [landscape.left, q1, q2, q3, round2(landscape.left + landscape.width)];
      for (const { rect } of resolved) {
        const leftMatches = allowedX.some((x) => Math.abs(rect.left - x) <= TOLERANCE_PT);
        const rightMatches = allowedX.some(
          (x) => Math.abs(rect.left + rect.width - x) <= TOLERANCE_PT
        );
        expect(leftMatches).toBe(true);
        expect(rightMatches).toBe(true);
      }
    }

    // 5. Brand Collage (staggered 3-column masonry with 7 cards)
    const collage = createIntentBentoDocument(landscape, 'brand-collage', { seed: 48219 });
    expect(collage.ok).toBe(true);
    if (collage.ok) {
      expect(collage.value.params.count).toBe(7);
      const resolved = resolveTreeLayout(
        collage.value.tree,
        collage.value.anchorRect,
        collage.value.params.gutterPt
      );
      expect(resolved).toHaveLength(7);
      const uniqueLefts = new Set(resolved.map((r) => Math.round(r.rect.left)));
      expect(uniqueLefts.size).toBe(3);
    }

    // 6. Creative intent produces art-directed studio compositions with hero + non-uniform scale contrast
    const creative = createIntentBentoDocument(landscape, 'creative', { seed: 48219 });
    expect(creative.ok).toBe(true);
    if (creative.ok) {
      expect(creative.value.params.intent).toBe('creative');
      expect(creative.value.params.count).toBe(6);
      const resolved = resolveTreeLayout(
        creative.value.tree,
        creative.value.anchorRect,
        creative.value.params.gutterPt
      );
      expect(resolved).toHaveLength(6);
      expect(resolved.some((r) => r.leaf.role === 'hero')).toBe(true);
    }

    // 7. Experimental intent defaults to Free grid and produces dramatic scale tension (>= 2.5x area contrast)
    const exp = createIntentBentoDocument(landscape, 'experimental', { seed: 48219 });
    expect(exp.ok).toBe(true);
    if (exp.ok) {
      expect(exp.value.params.intent).toBe('experimental');
      expect(exp.value.params.gridSystem).toBe('free');
      expect(exp.value.params.count).toBe(7);
      const resolved = resolveTreeLayout(
        exp.value.tree,
        exp.value.anchorRect,
        exp.value.params.gutterPt
      );
      expect(resolved).toHaveLength(7);
      const areas = resolved.map((r) => r.rect.width * r.rect.height);
      const areaSpread = Math.max(...areas) / Math.max(1, Math.min(...areas));
      expect(areaSpread).toBeGreaterThanOrEqual(2.5);
    }
  });
});
