import { describe, expect, it } from 'vitest';
import type { ExistingShapeSummary, RectPt } from '@bento/contract';
import {
  buildCellRenderSpecs,
  buildEntranceAnimationSpec,
  buildMosaikafyPayload,
  computeMosaikafyAnchorRect,
  createIntentBentoDocument,
  createSavedBlueprint,
  instantiateSavedBlueprint,
  rankShapesForMosaikafy,
} from '../src/index.js';

const SLIDE_16X9: RectPt = { left: 0, top: 0, width: 960, height: 540 };

describe('@bento/core Phase 3 Power Features', () => {
  it('ranks visually prominent shape first for Hero and remaining shapes in reading order', () => {
    const shapes: ExistingShapeSummary[] = [
      { shapeId: 's_bottom_right', rect: { left: 600, top: 300, width: 200, height: 120 }, textLength: 12 },
      { shapeId: 's_top_left', rect: { left: 60, top: 90, width: 200, height: 120 }, textLength: 10 },
      { shapeId: 's_big_hero', rect: { left: 300, top: 180, width: 420, height: 260 }, textLength: 85 },
      { shapeId: 's_top_right', rect: { left: 600, top: 95, width: 200, height: 120 }, textLength: 14 },
    ];

    const ranked = rankShapesForMosaikafy(shapes);
    expect(ranked.map((s) => s.shapeId)).toEqual([
      's_big_hero',
      's_top_left',
      's_top_right',
      's_bottom_right',
    ]);
  });

  it('expands cramped stacked shapes to slide Auto-Fit bounds when Mosaika-fying', () => {
    const cramped: ExistingShapeSummary[] = [
      { shapeId: 'a', rect: { left: 40, top: 40, width: 120, height: 80 }, textLength: 20 },
      { shapeId: 'b', rect: { left: 60, top: 55, width: 120, height: 80 }, textLength: 10 },
    ];

    const rect = computeMosaikafyAnchorRect(cramped, SLIDE_16X9);
    expect(rect.width).toBeGreaterThan(700);
    expect(rect.height).toBeGreaterThan(300);

    const built = buildMosaikafyPayload(cramped, SLIDE_16X9, 'executive-brief', {
      supportsShadows: true,
      supportsCustomGeometry: true,
      isDarkTheme: false,
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.value.payload.assignments).toHaveLength(2);
    expect(built.value.payload.assignments[0]!.sourceShapeId).toBe('a');
  });

  it('builds deterministic Hero-first staggered entrance animation specs', () => {
    const created = createIntentBentoDocument(
      { left: 48, top: 102, width: 864, height: 390 },
      'kpi-dashboard',
      { count: 5, seed: 48219 }
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const spec = buildEntranceAnimationSpec(created.value, 'rise-stagger');
    expect(spec.preset).toBe('rise-stagger');
    expect(spec.durationSec).toBe(0.5);
    expect(spec.staggerSec).toBe(0.1);
    expect(spec.orderedSlotIds).toHaveLength(5);

    const specs = buildCellRenderSpecs(created.value);
    const heroSlot = specs.find((c) => c.role === 'hero')?.slotId;
    if (heroSlot) {
      expect(spec.orderedSlotIds[0]).toBe(heroSlot);
    }

    const cleared = buildEntranceAnimationSpec(created.value, 'none');
    expect(cleared.durationSec).toBe(0);
    expect(cleared.staggerSec).toBe(0);
  });

  it('saves and instantiates personal Library blueprints across arbitrary aspect ratios', () => {
    const orig = createIntentBentoDocument(
      { left: 48, top: 102, width: 864, height: 390 },
      'editorial-story',
      { count: 6, seed: 91234, stylePreset: 'swiss-editorial', hierarchyMode: 'tonal-ramp' }
    );
    expect(orig.ok).toBe(true);
    if (!orig.ok) return;

    const bp = createSavedBlueprint(
      'My Executive Story',
      orig.value,
      'usr_test_1',
      '2026-11-24T17:00:00.000Z'
    );
    expect(bp.name).toBe('My Executive Story');
    expect(bp.cellCount).toBe(6);

    // Instantiate onto a square Instagram artboard (1080x1080)
    const squareRect: RectPt = { left: 44, top: 44, width: 992, height: 992 };
    const instantiated = instantiateSavedBlueprint(bp, squareRect, null);
    expect(instantiated.anchorRect).toEqual(squareRect);

    const cells = buildCellRenderSpecs(instantiated);
    expect(cells).toHaveLength(6);
    for (const c of cells) {
      expect(c.rect.left).toBeGreaterThanOrEqual(43.9);
      expect(c.rect.left + c.rect.width).toBeLessThanOrEqual(1036.1);
      expect(c.rect.top + c.rect.height).toBeLessThanOrEqual(1036.1);
    }

    // Swapping onto an existing document preserves its bentoId & active stylePreset
    const active = createIntentBentoDocument(squareRect, 'executive-brief', {
      count: 4,
      stylePreset: 'dark-surface',
      hierarchyMode: 'hero-accent',
    });
    expect(active.ok).toBe(true);
    if (!active.ok) return;

    const swapped = instantiateSavedBlueprint(bp, squareRect, active.value);
    expect(swapped.bentoId).toBe(active.value.bentoId);
    expect(swapped.revision).toBe(active.value.revision + 1);
    expect(swapped.params.stylePreset).toBe('dark-surface');
    expect(swapped.params.hierarchyMode).toBe('hero-accent');
  });
});
