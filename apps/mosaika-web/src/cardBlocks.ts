export type CardBlockType = 'text' | 'kpi' | 'checklist';
export type CardSurfaceTreatment = 'solid' | 'sheen' | 'mesh';

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
  treatment: CardSurfaceTreatment | undefined
): string {
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
