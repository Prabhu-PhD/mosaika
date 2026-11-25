export type CardBlockType =
  | 'text'
  | 'kpi'
  | 'checklist'
  | 'chart'
  | 'mockup'
  | 'code'
  | 'quote'
  | 'proof'
  | 'qr';

export type CardSurfaceTreatment = 'solid' | 'sheen' | 'mesh' | 'glass';
export type CardPatternKind = 'none' | 'dots' | 'hatch' | 'rings' | 'waves';
export type ChartVariant = 'sparkline' | 'bars' | 'ring';
export type MockupDeviceKind = 'iphone' | 'browser' | 'macbook';
export type CardWidgetVariant = ChartVariant | MockupDeviceKind;

export const CARD_BLOCK_OPTIONS: ReadonlyArray<{
  id: CardBlockType;
  label: string;
  defaultText: string;
}> = [
  { id: 'text', label: 'Text', defaultText: 'Headline\nSupporting copy for this bento tile.' },
  { id: 'kpi', label: 'KPI Metric', defaultText: '$4.2M\n+24% YoY\nAnnual Recurring Revenue' },
  {
    id: 'checklist',
    label: 'Checklist',
    defaultText: 'Launch Readiness\nEditable .pptx export\nVector SVG & Retina PNG\nZero-backend share link',
  },
  {
    id: 'chart',
    label: 'Live Chart',
    defaultText: 'Weekly Velocity\n+38% MoM\n24, 38, 32, 54, 48, 76, 92',
  },
  {
    id: 'mockup',
    label: 'Device Mockup',
    defaultText: 'Ship Faster\nDrop any screenshot onto this tile to preview inside a crisp frame.',
  },
  {
    id: 'code',
    label: 'Code / CLI',
    defaultText: 'Quick Start\npnpm create mosaika\ncd my-grid && pnpm dev\n// Bounded Swiss grids ready.',
  },
  {
    id: 'quote',
    label: 'Pull Quote',
    defaultText: 'Mosaika turned our chaotic slide decks into cohesive Swiss grids in seconds.\nElena Vance · Design Lead',
  },
  {
    id: 'proof',
    label: 'Social Proof',
    defaultText: '2,400+ Designers\n4.9 / 5\nTrusted by product teams shipping weekly launches',
  },
  {
    id: 'qr',
    label: 'Live QR Code',
    defaultText: 'https://prabhu-phd.github.io/mosaika\nScan to try Mosaika Studio',
  },
] as const;

export const CARD_PATTERN_OPTIONS: ReadonlyArray<{ id: CardPatternKind; label: string }> = [
  { id: 'none', label: 'None' },
  { id: 'dots', label: 'Dots' },
  { id: 'hatch', label: 'Hatch' },
  { id: 'rings', label: 'Rings' },
  { id: 'waves', label: 'Waves' },
] as const;

export interface ParsedKpiBlock {
  value: string;
  delta: string;
  label: string;
}

export interface ParsedChecklistBlock {
  title: string;
  items: string[];
}

export function parseKpiBlock(text: string): ParsedKpiBlock {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    return { value: '99.4%', delta: '+18% YoY', label: 'Key Metric' };
  }
  if (lines.length === 1) {
    return { value: lines[0]!, delta: '', label: '' };
  }
  if (lines.length === 2) {
    return { value: lines[0]!, delta: '', label: lines[1]! };
  }
  return {
    value: lines[0]!,
    delta: lines[1]!,
    label: lines.slice(2).join(' '),
  };
}

export function parseChecklistBlock(text: string): ParsedChecklistBlock {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/^[\s•✓✔☐☑\-*]+/, '').trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    return {
      title: 'Checklist',
      items: ['Vector SVG & Retina PNG', 'Native .pptx slide export', 'Zero-backend share URL'],
    };
  }
  if (lines.length === 1) {
    return { title: lines[0]!, items: [] };
  }
  return {
    title: lines[0]!,
    items: lines.slice(1),
  };
}

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return [27, 29, 30];
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
 * Computes harmonious diagonal sheen / editorial mesh color stops derived from a card's fillHex.
 */
export function computeGradientStops(baseHex: string): {
  startHex: string;
  midHex: string;
  endHex: string;
  glowHex: string;
} {
  const [r, g, b] = hexToRgb(baseHex);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

  if (lum < 0.45) {
    // Dark / vibrant surface: lift top-left slightly, deepen bottom-right, add crisp highlight glow
    return {
      startHex: rgbToHex(r + 34, g + 38, b + 46),
      midHex: baseHex.toUpperCase(),
      endHex: rgbToHex(r * 0.72, g * 0.72, b * 0.78),
      glowHex: rgbToHex(r + 92, g + 104, b + 128),
    };
  }

  // Light paper surface: clean subtle Swiss tonal wash
  return {
    startHex: '#FFFFFF',
    midHex: baseHex.toUpperCase(),
    endHex: rgbToHex(r - 16, g - 14, b - 10),
    glowHex: '#FFFFFF',
  };
}

export function buildCardCssBackground(
  fillHex: string | null,
  treatment: CardSurfaceTreatment | undefined,
  isDarkTheme = false
): string {
  if (treatment === 'glass') {
    return isDarkTheme
      ? 'background: rgba(20, 22, 28, 0.56); backdrop-filter: blur(22px) saturate(145%); -webkit-backdrop-filter: blur(22px) saturate(145%); box-shadow: inset 0 1px 0 rgba(255,255,255,0.16);'
      : 'background: rgba(255, 255, 255, 0.68); backdrop-filter: blur(22px) saturate(145%); -webkit-backdrop-filter: blur(22px) saturate(145%); box-shadow: inset 0 1px 0 rgba(255,255,255,0.85);';
  }
  if (!fillHex) return '';
  if (!treatment || treatment === 'solid') {
    return `background-color: ${fillHex};`;
  }
  const stops = computeGradientStops(fillHex);
  if (treatment === 'sheen') {
    return `background: linear-gradient(135deg, ${stops.startHex} 0%, ${stops.midHex} 52%, ${stops.endHex} 100%);`;
  }
  return `background: radial-gradient(circle at 86% 18%, ${stops.glowHex}55 0%, transparent 52%), linear-gradient(140deg, ${stops.startHex} 0%, ${stops.midHex} 48%, ${stops.endHex} 100%);`;
}
