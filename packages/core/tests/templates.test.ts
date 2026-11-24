import { describe, expect, it } from 'vitest';
import type { RectPt } from '@bento/contract';
import {
  applyTemplateToDocument,
  BENTO_TEMPLATES,
  collectLeaves,
  createDocumentFromTemplate,
  filterTemplatesByIntent,
  getTemplateById,
  getTemplatesByIntent,
  LAYOUT_INTENTS,
  previewTemplateLayout,
  resolveTreeLayout,
  TEMPLATES_PER_INTENT,
} from '../src/index.js';

const TEST_RECTS: ReadonlyArray<RectPt> = [
  { left: 48, top: 108, width: 864, height: 390 },
  { left: 48, top: 30, width: 420, height: 480 },
  { left: 40, top: 180, width: 880, height: 140 },
  { left: 280, top: 70, width: 400, height: 400 },
  { left: 100, top: 100, width: 160, height: 120 },
];

describe('@bento/core curated bento library templates (12 per intent = 120)', () => {
  it('defines 12 unique curated layouts per intent across all 10 intents (120 total)', () => {
    expect(TEMPLATES_PER_INTENT).toBe(12);
    expect(BENTO_TEMPLATES.length).toBe(LAYOUT_INTENTS.length * 12);

    const ids = new Set(BENTO_TEMPLATES.map((t) => t.id));
    expect(ids.size).toBe(BENTO_TEMPLATES.length);

    for (const def of LAYOUT_INTENTS) {
      const items = getTemplatesByIntent(def.id);
      expect(items).toHaveLength(12);

      // Verify strong visual uniqueness within each intent (at least 10 distinct visual fingerprints)
      const fingerprints = new Set<string>();
      for (const tpl of items) {
        const preview = previewTemplateLayout(tpl);
        const w = Math.max(1, preview.anchorRect.width);
        const h = Math.max(1, preview.anchorRect.height);
        const fp = preview.cells
          .map((cell) => {
            const l = Math.round(((cell.rect.left - preview.anchorRect.left) / w) * 50);
            const t = Math.round(((cell.rect.top - preview.anchorRect.top) / h) * 50);
            const rw = Math.round((cell.rect.width / w) * 50);
            const rh = Math.round((cell.rect.height / h) * 50);
            const kind = cell.svgPath && cell.shapeKind === 'rect' ? 'C' : cell.shapeKind[0];
            return `${l},${t},${rw},${rh},${cell.role === 'hero' ? 'H' : 'S'},${kind}`;
          })
          .join('|');
        fingerprints.add(fp);
      }
      expect(fingerprints.size).toBeGreaterThanOrEqual(10);
    }

    expect(filterTemplatesByIntent('creative')).toHaveLength(12);
    expect(filterTemplatesByIntent('experimental')).toHaveLength(12);
  });

  it('builds all 120 templates cleanly across all 5 aspect ratios with zero overlap', () => {
    for (const template of BENTO_TEMPLATES) {
      for (const rect of TEST_RECTS) {
        const res = createDocumentFromTemplate(rect, template);
        expect(res.ok).toBe(true);
        if (!res.ok) continue;

        const resolved = resolveTreeLayout(
          res.value.tree,
          res.value.anchorRect,
          res.value.params.gutterPt
        );
        expect(resolved.length).toBeGreaterThanOrEqual(1);

        for (let i = 0; i < resolved.length; i++) {
          for (let j = i + 1; j < resolved.length; j++) {
            const a = resolved[i]!.rect;
            const b = resolved[j]!.rect;
            const xOverlap =
              Math.min(Math.round((a.left + a.width) * 100), Math.round((b.left + b.width) * 100)) -
              Math.max(Math.round(a.left * 100), Math.round(b.left * 100));
            const yOverlap =
              Math.min(Math.round((a.top + a.height) * 100), Math.round((b.top + b.height) * 100)) -
              Math.max(Math.round(a.top * 100), Math.round(b.top * 100));
            expect(Math.max(0, xOverlap) * Math.max(0, yOverlap)).toBe(0);
          }
        }
      }
    }
  });

  it('swaps templates non-destructively while preserving bentoId and surviving slotIds', () => {
    const landscape: RectPt = { left: 48, top: 108, width: 864, height: 390 };
    const t4 = getTemplateById('executive-brief-02')!;
    const t7 = getTemplateById('brand-collage-06')!;

    const initial = createDocumentFromTemplate(landscape, t4);
    expect(initial.ok).toBe(true);
    if (!initial.ok) return;

    const initialSlots = collectLeaves(initial.value.tree).map((l) => l.slotId);
    expect(initialSlots).toHaveLength(4);

    const swapped = applyTemplateToDocument(initial.value, t7, { preserveStyle: true });
    expect(swapped.ok).toBe(true);
    if (!swapped.ok) return;

    expect(swapped.value.bentoId).toBe(initial.value.bentoId);
    expect(swapped.value.revision).toBe(initial.value.revision + 1);
    expect(swapped.value.params.stylePreset).toBe(initial.value.params.stylePreset);
    expect(swapped.value.params.hierarchyMode).toBe(initial.value.params.hierarchyMode);

    const nextSlots = collectLeaves(swapped.value.tree).map((l) => l.slotId);
    expect(nextSlots).toHaveLength(7);
    for (const slotId of initialSlots) {
      expect(nextSlots).toContain(slotId);
    }
  });
});
