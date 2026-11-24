import { describe, expect, it } from 'vitest';
import type { HierarchyMode, RectPt, StylePresetId } from '@bento/contract';
import {
  computeRelativeLuminance,
  computeStylePayload,
  createBentoDocument,
  DARK_INK_HEX,
  generateMultiSlideItems,
  getAutoContrastTextColor,
  HERO_ACCENT_HEX,
  LIGHT_INK_HEX,
  STYLE_PRESETS,
} from '../src/index.js';

const RECT: RectPt = { left: 48, top: 108, width: 864, height: 390 };

const ALL_PRESETS: readonly StylePresetId[] = [
  'soft-modern',
  'swiss-editorial',
  'elevated-cards',
  'dark-surface',
  'tonal-flat',
  'wireframe',
];

const ALL_HIERARCHIES: readonly HierarchyMode[] = ['uniform', 'hero-accent', 'tonal-ramp'];

describe('@bento/core style tokens, WCAG contrast, and multi-slide morph naming', () => {
  it('computes WCAG 2.1 relative luminance and flips auto-contrast text ink accurately', () => {
    expect(computeRelativeLuminance('#FFFFFF')).toBeCloseTo(1.0, 4);
    expect(computeRelativeLuminance('#000000')).toBeCloseTo(0.0, 4);

    expect(getAutoContrastTextColor('#FFFFFF')).toBe(DARK_INK_HEX);
    expect(getAutoContrastTextColor('#F4F5F7')).toBe(DARK_INK_HEX);
    expect(getAutoContrastTextColor('#EEF2FF')).toBe(DARK_INK_HEX);

    expect(getAutoContrastTextColor('#000000')).toBe(LIGHT_INK_HEX);
    expect(getAutoContrastTextColor('#18181B')).toBe(LIGHT_INK_HEX);
    expect(getAutoContrastTextColor('#2563EB')).toBe(LIGHT_INK_HEX);

    // Transparent wireframe cards adapt to slide background
    expect(getAutoContrastTextColor(null, false)).toBe(DARK_INK_HEX);
    expect(getAutoContrastTextColor(null, true)).toBe(LIGHT_INK_HEX);
  });

  it('produces valid tokens across all 6 presets, 3 hierarchy modes, and shadow capabilities', () => {
    expect(STYLE_PRESETS).toHaveLength(6);

    const created = createBentoDocument(RECT, { count: 5, heroBias: 0.7, seed: 48219 });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const doc = created.value;

    for (const presetId of ALL_PRESETS) {
      for (const hierarchyMode of ALL_HIERARCHIES) {
        for (const supportsShadows of [true, false]) {
          const payload = computeStylePayload(doc, {
            supportsShadows,
            commitUndoEntry: true,
            presetOverride: presetId,
            hierarchyOverride: hierarchyMode,
          });

          expect(payload.presetId).toBe(presetId);
          expect(payload.hierarchyMode).toBe(hierarchyMode);
          expect(payload.cells).toHaveLength(5);

          for (const cell of payload.cells) {
            expect([DARK_INK_HEX, LIGHT_INK_HEX]).toContain(cell.textColorHex);
            expect(cell.borderTransparency).toBeGreaterThanOrEqual(0);
            expect(cell.borderTransparency).toBeLessThanOrEqual(1);

            if (!supportsShadows) {
              expect(cell.shadow).toBeNull();
            }
          }

          // Specific checks for elevated-cards fallback vs native shadow
          if (presetId === 'elevated-cards' && hierarchyMode === 'uniform') {
            if (supportsShadows) {
              expect(payload.cells[0]!.shadow).toEqual({
                blurPt: 18,
                offsetXPt: 0,
                offsetYPt: 6,
                transparency: 0.9,
                colorHex: '#0F172A',
              });
              expect(payload.cells[0]!.borderWeightPt).toBe(0.5);
            } else {
              expect(payload.cells[0]!.shadow).toBeNull();
              expect(payload.cells[0]!.borderColorHex).toBe('#E2E8F0');
              expect(payload.cells[0]!.borderWeightPt).toBe(0.75);
            }
          }

          // Hero Accent puts Accent1 / #2563EB + Light Ink on hero cell (slot_01)
          if (hierarchyMode === 'hero-accent' && presetId !== 'wireframe') {
            expect(payload.cells[0]!.fillHex).toBe(HERO_ACCENT_HEX);
            expect(payload.cells[0]!.textColorHex).toBe(LIGHT_INK_HEX);
          }

          // Wireframe uses transparent fill and dashed border
          if (presetId === 'wireframe') {
            expect(payload.cells[0]!.fillHex).toBeNull();
            expect(payload.cells[0]!.borderDashed).toBe(true);
          }
        }
      }
    }
  });

  it('keeps !!bento_NN naming enabled regardless of supportsAutoMorph and gates only applyMorphTransition', () => {
    const created = createBentoDocument(RECT, { count: 4, seed: 48219 });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const withNativeMorph = generateMultiSlideItems(created.value, {
      mode: 'exploration',
      slideCount: 4,
      morphNamingEnabled: true,
      supportsAutoMorph: true,
      styleOptions: { supportsShadows: true },
    });

    const withoutNativeMorph = generateMultiSlideItems(created.value, {
      mode: 'deck-builder',
      slideCount: 4,
      morphNamingEnabled: true,
      supportsAutoMorph: false,
      styleOptions: { supportsShadows: false },
    });

    expect(withNativeMorph).toHaveLength(4);
    expect(withoutNativeMorph).toHaveLength(4);

    for (const item of withNativeMorph) {
      expect(item.applyMorphTransition).toBe(true);
      expect(item.cells[0]!.shapeName).toBe('!!bento_01');
    }

    for (const item of withoutNativeMorph) {
      expect(item.applyMorphTransition).toBe(false);
      // !! naming remains active even when supportsAutoMorph === false
      expect(item.cells[0]!.shapeName).toBe('!!bento_01');
    }
  });
});
