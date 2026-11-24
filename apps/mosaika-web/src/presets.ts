import type { RectPt } from '@bento/contract';
import { round2 } from '@bento/core';

export interface CanvasPreset {
  id: string;
  label: string;
  group: 'Web' | 'Social' | 'Print';
  width: number;
  height: number;
  defaultPadding: number;
}

export const CANVAS_PRESETS: readonly CanvasPreset[] = [
  { id: 'web-hero', label: 'Web Hero (1440×900)', group: 'Web', width: 1440, height: 900, defaultPadding: 48 },
  { id: 'desktop-hd', label: 'Desktop 16:9 (1280×720)', group: 'Web', width: 1280, height: 720, defaultPadding: 40 },
  { id: 'wallpaper-fhd', label: 'Full HD (1920×1080)', group: 'Web', width: 1920, height: 1080, defaultPadding: 56 },
  { id: 'banner-wide', label: 'Wide Banner (1200×360)', group: 'Web', width: 1200, height: 360, defaultPadding: 24 },
  { id: 'og-social', label: 'OG / LinkedIn / X (1200×630)', group: 'Social', width: 1200, height: 630, defaultPadding: 36 },
  { id: 'ig-square', label: 'Instagram Square (1080×1080)', group: 'Social', width: 1080, height: 1080, defaultPadding: 44 },
  { id: 'ig-portrait', label: 'Instagram Portrait (1080×1350)', group: 'Social', width: 1080, height: 1350, defaultPadding: 44 },
  { id: 'a4-landscape', label: 'A4 Landscape (1123×794)', group: 'Print', width: 1123, height: 794, defaultPadding: 44 },
  { id: 'a4-portrait', label: 'A4 Portrait (794×1123)', group: 'Print', width: 794, height: 1123, defaultPadding: 44 },
  { id: 'poster-3x4', label: 'Editorial Poster (900×1200)', group: 'Print', width: 900, height: 1200, defaultPadding: 44 },
] as const;

export interface BrandAccentSwatch {
  label: string;
  hex: string;
}

export const BRAND_ACCENT_SWATCHES: readonly BrandAccentSwatch[] = [
  { label: 'Obsidian', hex: '#1B1D1E' },
  { label: 'Cobalt', hex: '#2563EB' },
  { label: 'Emerald', hex: '#059669' },
  { label: 'Crimson', hex: '#E11D48' },
  { label: 'Amber', hex: '#D97706' },
  { label: 'Violet', hex: '#7C3AED' },
] as const;

export function computeArtboardContentRect(
  canvasWidth: number,
  canvasHeight: number,
  padding: number
): RectPt {
  const safeW = Math.max(320, Math.min(3840, Math.round(canvasWidth)));
  const safeH = Math.max(240, Math.min(3840, Math.round(canvasHeight)));
  const maxPad = Math.floor(Math.min(safeW, safeH) * 0.2);
  const pad = Math.max(0, Math.min(maxPad, Math.round(padding)));

  return {
    left: pad,
    top: pad,
    width: round2(safeW - pad * 2),
    height: round2(safeH - pad * 2),
  };
}
