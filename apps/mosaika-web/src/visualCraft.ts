import { getAutoContrastTextColor } from '@bento/core';

export type ArtboardBackdropId = 'paper' | 'aurora' | 'dusk' | 'dots' | 'photo';
export type CornerStyle = 'rounded' | 'squircle';
export type FontPairingId = 'swiss' | 'editorial' | 'tech' | 'display';
export type HoverInteractionMode = 'none' | 'lift' | 'tilt' | 'spotlight';
export type CardTextAlign = 'tl' | 'bl' | 'center' | 'split';
export type CardIconId =
  | 'none'
  | 'sparkles'
  | 'zap'
  | 'layers'
  | 'trending'
  | 'shield'
  | 'globe'
  | 'cpu'
  | 'check'
  | 'rocket'
  | 'star'
  | 'command';

export interface FontPairingSpec {
  id: FontPairingId;
  label: string;
  caption: string;
  headingFamily: string;
  bodyFamily: string;
  headingWeight: number;
  letterSpacing: string;
}

export const FONT_PAIRINGS: readonly FontPairingSpec[] = [
  {
    id: 'swiss',
    label: 'Swiss',
    caption: 'Inter Neo-Grotesk',
    headingFamily: "'Inter', -apple-system, 'Segoe UI', sans-serif",
    bodyFamily: "'Inter', -apple-system, 'Segoe UI', sans-serif",
    headingWeight: 650,
    letterSpacing: '-0.025em',
  },
  {
    id: 'editorial',
    label: 'Editorial',
    caption: 'Instrument Serif + Inter',
    headingFamily: "'Instrument Serif', Georgia, serif",
    bodyFamily: "'Inter', -apple-system, sans-serif",
    headingWeight: 400,
    letterSpacing: '-0.01em',
  },
  {
    id: 'tech',
    label: 'Tech',
    caption: 'Space Grotesk + Mono',
    headingFamily: "'Space Grotesk', -apple-system, sans-serif",
    bodyFamily: "'JetBrains Mono', ui-monospace, monospace",
    headingWeight: 600,
    letterSpacing: '-0.03em',
  },
  {
    id: 'display',
    label: 'Display',
    caption: 'Bricolage + Jakarta',
    headingFamily: "'Bricolage Grotesque', -apple-system, sans-serif",
    bodyFamily: "'Plus Jakarta Sans', -apple-system, sans-serif",
    headingWeight: 700,
    letterSpacing: '-0.03em',
  },
] as const;

export function getFontPairing(id: FontPairingId | undefined): FontPairingSpec {
  return FONT_PAIRINGS.find((p) => p.id === id) ?? FONT_PAIRINGS[0]!;
}

export const BACKDROP_OPTIONS: ReadonlyArray<{ id: ArtboardBackdropId; label: string }> = [
  { id: 'paper', label: 'Paper' },
  { id: 'aurora', label: 'Aurora' },
  { id: 'dusk', label: 'Dusk' },
  { id: 'dots', label: 'Dots' },
  { id: 'photo', label: 'Photo' },
];

export const HOVER_INTERACTION_OPTIONS: ReadonlyArray<{
  id: HoverInteractionMode;
  label: string;
}> = [
  { id: 'none', label: 'Off' },
  { id: 'lift', label: 'Lift' },
  { id: 'tilt', label: 'Tilt' },
  { id: 'spotlight', label: 'Glow' },
];

export const CARD_ICON_OPTIONS: ReadonlyArray<{ id: CardIconId; label: string }> = [
  { id: 'none', label: 'None' },
  { id: 'sparkles', label: 'Sparkles' },
  { id: 'zap', label: 'Bolt' },
  { id: 'layers', label: 'Layers' },
  { id: 'trending', label: 'Trend' },
  { id: 'shield', label: 'Shield' },
  { id: 'globe', label: 'Globe' },
  { id: 'cpu', label: 'Chip' },
  { id: 'check', label: 'Check' },
  { id: 'rocket', label: 'Rocket' },
  { id: 'star', label: 'Star' },
  { id: 'command', label: 'Cmd' },
];

/**
 * Generates an Apple-style continuous squircle (superellipse) SVG path in local coordinates (0..w, 0..h).
 * Uses extended smooth shoulders (~1.34× radius) and softened Bezier handles for true iOS/Linear curvature.
 */
export function buildSquirclePath(width: number, height: number, radius: number): string {
  const w = Math.max(2, width);
  const h = Math.max(2, height);
  const maxR = Math.min(w, h) / 2;
  const r = Math.max(0, Math.min(maxR, radius));
  if (r < 0.5) {
    return `M 0 0 H ${w.toFixed(2)} V ${h.toFixed(2)} H 0 Z`;
  }

  // Smooth corner shoulder extends further along straight edge than a circular arc
  const s = Math.min(maxR, r * 1.32);
  const c1 = s * 0.52;
  const c2 = r * 0.14;
  const f = (n: number) => n.toFixed(2);

  return [
    `M ${f(s)} 0`,
    `L ${f(w - s)} 0`,
    `C ${f(w - c1)} 0 ${f(w - c2)} ${f(c2)} ${f(w)} ${f(s)}`,
    `L ${f(w)} ${f(h - s)}`,
    `C ${f(w)} ${f(h - c1)} ${f(w - c2)} ${f(h - c2)} ${f(w - s)} ${f(h)}`,
    `L ${f(s)} ${f(h)}`,
    `C ${f(c1)} ${f(h)} ${f(c2)} ${f(h - c2)} 0 ${f(h - s)}`,
    `L 0 ${f(s)}`,
    `C 0 ${f(c1)} ${f(c2)} ${f(c2)} ${f(s)} 0`,
    'Z',
  ].join(' ');
}

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return [37, 99, 235];
  return [
    Number.parseInt(clean.slice(0, 2), 16),
    Number.parseInt(clean.slice(2, 4), 16),
    Number.parseInt(clean.slice(4, 6), 16),
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  return (
    '#' +
    [clampByte(r), clampByte(g), clampByte(b)]
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  );
}

/**
 * Derives a soft, harmonious Aurora / Dusk artboard backdrop palette from the user's Brand Accent + theme.
 */
export function computeBackdropPalette(
  accentHex: string,
  isDarkTheme: boolean
): {
  baseBg: string;
  blobA: string;
  blobB: string;
  blobC: string;
  dotColor: string;
} {
  const [r, g, b] = hexToRgb(accentHex);

  if (isDarkTheme) {
    return {
      baseBg: '#090A0D',
      blobA: rgbToHex(r * 0.85, g * 0.85, b * 0.95),
      blobB: rgbToHex(b * 0.65 + 40, r * 0.45 + 30, g * 0.8 + 80),
      blobC: rgbToHex(r * 0.35 + 25, g * 0.55 + 35, b * 0.75 + 60),
      dotColor: 'rgba(255,255,255,0.14)',
    };
  }

  return {
    baseBg: '#F6F7FA',
    blobA: rgbToHex(r * 0.65 + 90, g * 0.65 + 90, b * 0.65 + 90),
    blobB: rgbToHex(b * 0.45 + 145, r * 0.35 + 150, g * 0.5 + 145),
    blobC: rgbToHex(r * 0.3 + 175, g * 0.45 + 170, b * 0.35 + 185),
    dotColor: 'rgba(15,23,42,0.13)',
  };
}

/**
 * Pure RGB quantization helper (usable in both browser Canvas extraction and Vitest!).
 * Picks the richest, highest-chroma brand color from RGBA pixel bytes and returns
 * a WCAG-checked brand accent hex + optimal contrast text color.
 */
export function extractDominantBrandColorFromRgba(
  rgba: Uint8ClampedArray | number[]
): { accentHex: string; textOnAccentHex: string } {
  const buckets = new Map<string, { score: number; rSum: number; gSum: number; bSum: number; count: number }>();

  for (let i = 0; i + 3 < rgba.length; i += 4) {
    const r = rgba[i]!;
    const g = rgba[i + 1]!;
    const b = rgba[i + 2]!;
    const a = rgba[i + 3]!;
    if (a < 140) continue;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const sat = max === 0 ? 0 : (max - min) / max;
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

    // Skip near-white backgrounds and near-black outlines unless nothing else exists
    if (lum > 0.94 || lum < 0.06) continue;

    // Quantize to 16-step buckets for crisp clustering
    const key = `${r >> 4}_${g >> 4}_${b >> 4}`;
    const weight = 0.25 + sat * sat * 4.5 + (1 - Math.abs(lum - 0.5)) * 0.8;
    const prev = buckets.get(key);
    if (prev) {
      prev.score += weight;
      prev.rSum += r;
      prev.gSum += g;
      prev.bSum += b;
      prev.count += 1;
    } else {
      buckets.set(key, { score: weight, rSum: r, gSum: g, bSum: b, count: 1 });
    }
  }

  let best: { score: number; rSum: number; gSum: number; bSum: number; count: number } | null = null;
  for (const bucket of buckets.values()) {
    if (!best || bucket.score > best.score) {
      best = bucket;
    }
  }

  const accentHex = best
    ? rgbToHex(best.rSum / best.count, best.gSum / best.count, best.bSum / best.count)
    : '#1B1D1E';

  return {
    accentHex,
    textOnAccentHex: getAutoContrastTextColor(accentHex, false),
  };
}

/**
 * Browser helper: downsamples an uploaded PNG/SVG/JPG logo into an offscreen 48×48 canvas
 * and extracts its dominant brand accent hex automatically.
 */
export async function extractBrandFromImageFile(
  file: File
): Promise<{ accentHex: string; textOnAccentHex: string } | null> {
  if (!file.type.startsWith('image/')) return null;
  const dataUrl = await new Promise<string | null>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
  if (!dataUrl) return null;

  const img = await new Promise<HTMLImageElement | null>((resolve) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => resolve(null);
    el.src = dataUrl;
  });
  if (!img) return null;

  const size = 48;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, size, size);
  const { data } = ctx.getImageData(0, 0, size, size);
  return extractDominantBrandColorFromRgba(data);
}
