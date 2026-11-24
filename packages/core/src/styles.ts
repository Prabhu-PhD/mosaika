import type {
  BentoDocumentState,
  CellShadowSpec,
  CellStyleSpec,
  HierarchyMode,
  StyleApplyPayload,
  StylePresetId,
} from '@bento/contract';
import { resolveVisualCells } from './shapes.js';

export interface StylePresetDefinition {
  id: StylePresetId;
  label: string;
  description: string;
  defaultRadiusPt: number;
  swatchFillHex: string;
  swatchBorderHex: string;
  swatchAccentHex: string;
  swatchDashed?: boolean;
  swatchDark?: boolean;
}

export const STYLE_PRESETS: readonly StylePresetDefinition[] = [
  {
    id: 'soft-modern',
    label: 'Soft Modern',
    description: 'Soft tinted card surface with hairline border',
    defaultRadiusPt: 16,
    swatchFillHex: '#F4F5F7',
    swatchBorderHex: '#D1D5DB',
    swatchAccentHex: '#2563EB',
  },
  {
    id: 'swiss-editorial',
    label: 'Swiss Editorial',
    description: 'Crisp architectural cards with sharp 2pt corners',
    defaultRadiusPt: 2,
    swatchFillHex: '#FFFFFF',
    swatchBorderHex: '#9CA3AF',
    swatchAccentHex: '#2563EB',
  },
  {
    id: 'elevated-cards',
    label: 'Elevated Cards',
    description: 'Pure white floating cards with soft depth shadow',
    defaultRadiusPt: 14,
    swatchFillHex: '#FFFFFF',
    swatchBorderHex: '#E2E8F0',
    swatchAccentHex: '#2563EB',
  },
  {
    id: 'dark-surface',
    label: 'Dark Surface',
    description: 'High-contrast charcoal cards for dark slides',
    defaultRadiusPt: 14,
    swatchFillHex: '#18181B',
    swatchBorderHex: '#3F3F46',
    swatchAccentHex: '#3B82F6',
    swatchDark: true,
  },
  {
    id: 'tonal-flat',
    label: 'Tonal Flat',
    description: 'Borderless soft accent tint surfaces',
    defaultRadiusPt: 12,
    swatchFillHex: '#EEF2FF',
    swatchBorderHex: '#EEF2FF',
    swatchAccentHex: '#2563EB',
  },
  {
    id: 'wireframe',
    label: 'Wireframe',
    description: 'Transparent dashed blueprint layout guides',
    defaultRadiusPt: 8,
    swatchFillHex: 'transparent',
    swatchBorderHex: '#64748B',
    swatchAccentHex: '#2563EB',
    swatchDashed: true,
  },
] as const;

export const DEFAULT_TEXTFRAME_STYLE = {
  marginLeftPt: 16,
  marginRightPt: 16,
  marginTopPt: 14,
  marginBottomPt: 14,
  verticalAnchor: 'top' as const,
  horizontalAlign: 'left' as const,
  wordWrap: true,
  autoSize: 'none' as const,
} as const;

export const DARK_INK_HEX = '#111827';
export const LIGHT_INK_HEX = '#FFFFFF';
export const HERO_ACCENT_HEX = '#2563EB';

function parseHexColor(hex: string): { r: number; g: number; b: number } | null {
  const cleaned = hex.trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(cleaned)) {
    return null;
  }
  return {
    r: Number.parseInt(cleaned.slice(0, 2), 16),
    g: Number.parseInt(cleaned.slice(2, 4), 16),
    b: Number.parseInt(cleaned.slice(4, 6), 16),
  };
}

function toHexChannel(n: number): string {
  return Math.max(0, Math.min(255, Math.round(n)))
    .toString(16)
    .padStart(2, '0')
    .toUpperCase();
}

/**
 * Applies a subtle PowerPoint-style tint/shade shift (-1..+1) to a fallback hex color.
 * Negative values darken toward #000000; positive values lighten toward #FFFFFF.
 */
export function applyHexTintAndShade(hex: string, tintAndShade: number): string {
  const rgb = parseHexColor(hex);
  if (!rgb) {
    return hex;
  }
  const factor = Math.max(-1, Math.min(1, tintAndShade));
  const adjust = (channel: number): number =>
    factor < 0 ? channel * (1 + factor) : channel + (255 - channel) * factor;

  return `#${toHexChannel(adjust(rgb.r))}${toHexChannel(adjust(rgb.g))}${toHexChannel(adjust(rgb.b))}`;
}

/**
 * WCAG 2.1 Relative Luminance Formula (PRD Section 5.1).
 */
export function computeRelativeLuminance(hex: string): number {
  const rgb = parseHexColor(hex);
  if (!rgb) {
    return 1;
  }
  const linearize = (channel255: number): number => {
    const c = channel255 / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const rLin = linearize(rgb.r);
  const gLin = linearize(rgb.g);
  const bLin = linearize(rgb.b);
  return 0.2126 * rLin + 0.7152 * gLin + 0.0722 * bLin;
}

/**
 * WCAG 2.1 Auto-Contrast Ink Selection (PRD Section 5.1).
 * L > 0.179 -> Dark Ink (#111827), otherwise Light Ink (#FFFFFF).
 */
export function getAutoContrastTextColor(
  fillHex: string | null,
  isDarkSlideBackground = false
): string {
  if (fillHex === null) {
    return isDarkSlideBackground ? LIGHT_INK_HEX : DARK_INK_HEX;
  }
  const luminance = computeRelativeLuminance(fillHex);
  return luminance > 0.179 ? DARK_INK_HEX : LIGHT_INK_HEX;
}

export function getPresetDefaultRadius(presetId: StylePresetId): number {
  const preset = STYLE_PRESETS.find((p) => p.id === presetId);
  return preset ? preset.defaultRadiusPt : 12;
}

interface BaseSurfaceSpec {
  fillHex: string | null;
  themeFillSlot?: 'Background1' | 'Text1' | 'Accent1';
  themeTintAndShade?: number;
  borderColorHex: string | null;
  borderWeightPt: number;
  borderTransparency: number;
  borderDashed: boolean;
  shadow: CellShadowSpec | null;
}

function resolveBasePresetSpec(
  presetId: StylePresetId,
  supportsShadows: boolean,
  isDarkTheme: boolean
): BaseSurfaceSpec {
  switch (presetId) {
    case 'soft-modern':
      return {
        fillHex: isDarkTheme ? '#27272A' : '#F4F5F7',
        themeFillSlot: 'Background1',
        themeTintAndShade: isDarkTheme ? 0.08 : -0.04,
        borderColorHex: isDarkTheme ? '#FFFFFF' : '#111827',
        borderWeightPt: 0.75,
        borderTransparency: 0.88,
        borderDashed: false,
        shadow: null,
      };
    case 'swiss-editorial':
      return {
        fillHex: isDarkTheme ? '#18181B' : '#FFFFFF',
        themeFillSlot: 'Background1',
        themeTintAndShade: 0.0,
        borderColorHex: isDarkTheme ? '#FFFFFF' : '#111827',
        borderWeightPt: 1.0,
        borderTransparency: 0.78,
        borderDashed: false,
        shadow: null,
      };
    case 'elevated-cards':
      if (supportsShadows) {
        return {
          fillHex: isDarkTheme ? '#1F2937' : '#FFFFFF',
          themeFillSlot: 'Background1',
          themeTintAndShade: 0.0,
          borderColorHex: isDarkTheme ? '#FFFFFF' : '#111827',
          borderWeightPt: 0.5,
          borderTransparency: 0.92,
          borderDashed: false,
          shadow: {
            blurPt: 18,
            offsetXPt: 0,
            offsetYPt: 6,
            transparency: 0.9,
            colorHex: '#0F172A',
          },
        };
      }
      return {
        fillHex: isDarkTheme ? '#1F2937' : '#FFFFFF',
        themeFillSlot: 'Background1',
        themeTintAndShade: 0.0,
        borderColorHex: isDarkTheme ? '#334155' : '#E2E8F0',
        borderWeightPt: 0.75,
        borderTransparency: 0.0,
        borderDashed: false,
        shadow: null,
      };
    case 'dark-surface':
      return {
        fillHex: '#18181B',
        themeFillSlot: 'Text1',
        themeTintAndShade: 0.06,
        borderColorHex: '#FFFFFF',
        borderWeightPt: 1.0,
        borderTransparency: 0.86,
        borderDashed: false,
        shadow: null,
      };
    case 'tonal-flat':
      return {
        fillHex: isDarkTheme ? '#1E293B' : '#EEF2FF',
        themeFillSlot: 'Accent1',
        themeTintAndShade: 0.85,
        borderColorHex: null,
        borderWeightPt: 0,
        borderTransparency: 1,
        borderDashed: false,
        shadow: null,
      };
    case 'wireframe':
      return {
        fillHex: null,
        borderColorHex: '#64748B',
        borderWeightPt: 1.0,
        borderTransparency: 0.35,
        borderDashed: true,
        shadow: null,
      };
  }
}

const LIGHT_TONAL_RAMP_STEPS = [-0.02, -0.06, -0.1] as const;
const DARK_TONAL_RAMP_STEPS = [0.04, 0.09, 0.14] as const;

export interface ComputeStyleOptions {
  supportsShadows: boolean;
  isDarkTheme?: boolean;
  commitUndoEntry: boolean;
  presetOverride?: StylePresetId;
  hierarchyOverride?: HierarchyMode;
}

/**
 * Generates the complete StyleApplyPayload for all cells in a BentoDocumentState.
 */
export function computeStylePayload(
  state: BentoDocumentState,
  options: ComputeStyleOptions
): StyleApplyPayload {
  const presetId = options.presetOverride ?? state.params.stylePreset;
  const hierarchyMode = options.hierarchyOverride ?? state.params.hierarchyMode;
  const isDarkTheme = options.isDarkTheme ?? false;

  const base = resolveBasePresetSpec(presetId, options.supportsShadows, isDarkTheme);
  const visualCells = resolveVisualCells(state);

  let tonalIndex = 0;
  const cells: CellStyleSpec[] = visualCells.map((leaf) => {
    // Hero Accent mode (PRD Section 5.3)
    if (hierarchyMode === 'hero-accent' && leaf.role === 'hero') {
      if (presetId === 'wireframe') {
        return {
          slotId: leaf.slotId,
          fillHex: null,
          borderColorHex: HERO_ACCENT_HEX,
          borderWeightPt: 1.5,
          borderTransparency: 0.15,
          borderDashed: true,
          textColorHex: getAutoContrastTextColor(null, isDarkTheme),
          shadow: null,
        };
      }
      return {
        slotId: leaf.slotId,
        fillHex: HERO_ACCENT_HEX,
        themeFillSlot: 'Accent1',
        themeTintAndShade: 0.0,
        borderColorHex: null,
        borderWeightPt: 0,
        borderTransparency: 1,
        borderDashed: false,
        textColorHex: getAutoContrastTextColor(HERO_ACCENT_HEX, isDarkTheme),
        shadow: base.shadow,
      };
    }

    // Tonal Ramp mode (PRD Section 5.3)
    if (hierarchyMode === 'tonal-ramp' && leaf.role !== 'hero') {
      const steps =
        isDarkTheme || presetId === 'dark-surface'
          ? DARK_TONAL_RAMP_STEPS
          : LIGHT_TONAL_RAMP_STEPS;
      const stepDelta = steps[tonalIndex % steps.length]!;
      tonalIndex += 1;

      const rampedFillHex =
        base.fillHex !== null ? applyHexTintAndShade(base.fillHex, stepDelta) : null;
      const baseTint = base.themeTintAndShade ?? 0;
      const rampedTint = Math.max(-1, Math.min(1, Math.round((baseTint + stepDelta) * 100) / 100));

      return {
        slotId: leaf.slotId,
        fillHex: rampedFillHex,
        ...(base.themeFillSlot !== undefined ? { themeFillSlot: base.themeFillSlot } : {}),
        ...(base.themeFillSlot !== undefined ? { themeTintAndShade: rampedTint } : {}),
        borderColorHex: base.borderColorHex,
        borderWeightPt: base.borderWeightPt,
        borderTransparency: base.borderTransparency,
        borderDashed: base.borderDashed,
        textColorHex: getAutoContrastTextColor(rampedFillHex, isDarkTheme),
        shadow: base.shadow,
      };
    }

    // Uniform or hero cell under tonal-ramp/uniform
    return {
      slotId: leaf.slotId,
      fillHex: base.fillHex,
      ...(base.themeFillSlot !== undefined ? { themeFillSlot: base.themeFillSlot } : {}),
      ...(base.themeTintAndShade !== undefined
        ? { themeTintAndShade: base.themeTintAndShade }
        : {}),
      borderColorHex: base.borderColorHex,
      borderWeightPt: base.borderWeightPt,
      borderTransparency: base.borderTransparency,
      borderDashed: base.borderDashed,
      textColorHex: getAutoContrastTextColor(base.fillHex, isDarkTheme),
      shadow: base.shadow,
    };
  });

  return {
    presetId,
    hierarchyMode,
    cells,
    commitUndoEntry: options.commitUndoEntry,
  };
}
