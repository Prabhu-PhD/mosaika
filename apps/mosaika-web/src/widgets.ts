import qrcode from 'qrcode-generator';
import type {
  CardPatternKind,
  ChartVariant,
  MockupDeviceKind,
} from './cardBlocks.js';

export interface ParsedChartBlock {
  title: string;
  delta: string;
  values: number[];
}

export interface ParsedCodeBlock {
  title: string;
  lines: string[];
}

export interface ParsedQuoteBlock {
  quote: string;
  author: string;
}

export interface ParsedProofBlock {
  headline: string;
  rating: string;
  caption: string;
  initials: string[];
}

export interface ParsedQrBlock {
  url: string;
  caption: string;
}

export function parseChartBlock(text: string): ParsedChartBlock {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const defaultVals = [24, 38, 32, 54, 48, 76, 92];
  if (lines.length === 0) {
    return { title: 'Weekly Velocity', delta: '+38% MoM', values: defaultVals };
  }

  // Find the last line containing 2+ comma/space-separated numbers
  let valuesLineIdx = -1;
  let parsedValues: number[] = [];
  for (let i = lines.length - 1; i >= 0; i--) {
    const nums = lines[i]!
      .split(/[,\s]+/)
      .map((s) => Number.parseFloat(s.replace(/[^0-9.-]/g, '')))
      .filter((n) => Number.isFinite(n));
    if (nums.length >= 2 || (nums.length === 1 && lines.length >= 2 && i === lines.length - 1 && /^\d/.test(lines[i]!))) {
      valuesLineIdx = i;
      parsedValues = nums;
      break;
    }
  }

  const metaLines = lines.filter((_, idx) => idx !== valuesLineIdx);
  return {
    title: metaLines[0] ?? 'Metrics',
    delta: metaLines[1] ?? '',
    values: parsedValues.length > 0 ? parsedValues.slice(0, 16) : defaultVals,
  };
}

export function parseCodeBlock(text: string): ParsedCodeBlock {
  const lines = text.split(/\r?\n/);
  const nonEmpty = lines.filter((l) => l.trim().length > 0);
  if (nonEmpty.length === 0) {
    return { title: 'terminal', lines: ['npx mosaika init'] };
  }
  if (nonEmpty.length === 1) {
    return { title: 'terminal', lines: nonEmpty };
  }
  return {
    title: nonEmpty[0]!.trim(),
    lines: nonEmpty.slice(1),
  };
}

export function parseQuoteBlock(text: string): ParsedQuoteBlock {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    return {
      quote: 'Design systems feel effortless when constraints do the heavy lifting.',
      author: 'Studio Note',
    };
  }
  if (lines.length === 1) {
    return { quote: lines[0]!, author: '' };
  }
  return {
    quote: lines.slice(0, -1).join(' '),
    author: lines[lines.length - 1]!,
  };
}

export function parseProofBlock(text: string): ParsedProofBlock {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  return {
    headline: lines[0] ?? '2,400+ Designers',
    rating: lines[1] ?? '4.9 / 5',
    caption: lines.slice(2).join(' ') || 'Trusted by modern product teams',
    initials: ['EV', 'MK', 'AR', 'SL', '+'],
  };
}

export function parseQrBlock(text: string): ParsedQrBlock {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  return {
    url: lines[0] ?? 'https://prabhu-phd.github.io/mosaika',
    caption: lines.slice(1).join(' ') || 'Scan to open',
  };
}

export function resolveChartVariant(variant: string | undefined): ChartVariant {
  if (variant === 'bars' || variant === 'ring' || variant === 'sparkline') return variant;
  return 'sparkline';
}

export function resolveMockupDevice(variant: string | undefined): MockupDeviceKind {
  if (variant === 'browser' || variant === 'macbook' || variant === 'iphone') return variant;
  return 'iphone';
}

/**
 * Generates a real, camera-scannable QR matrix using Error Correction Level M.
 */
export function buildQrMatrix(payload: string): boolean[][] {
  const safeText = (payload.trim() || 'https://prabhu-phd.github.io/mosaika').slice(0, 240);
  try {
    const qr = qrcode(0, 'M');
    qr.addData(safeText);
    qr.make();
    const count = qr.getModuleCount();
    const matrix: boolean[][] = [];
    for (let r = 0; r < count; r++) {
      const row: boolean[] = [];
      for (let c = 0; c < count; c++) {
        row.push(qr.isDark(r, c));
      }
      matrix.push(row);
    }
    return matrix;
  } catch {
    // Ultra-safe deterministic fallback pattern if input exceeds QR capacity
    return [
      [true, true, true, false, true, true, true],
      [true, false, true, false, true, false, true],
      [true, true, true, true, true, true, true],
      [false, false, true, false, true, false, false],
      [true, true, true, false, true, true, true],
      [true, false, true, true, false, false, true],
      [true, true, true, false, true, true, true],
    ];
  }
}

/**
 * Builds pure SVG `<pattern>` markup for procedural card background textures (#9).
 */
export function buildCardPatternDefString(
  id: string,
  pattern: CardPatternKind,
  inkHex: string
): string | null {
  if (pattern === 'none') return null;
  const col = inkHex || '#18181B';
  switch (pattern) {
    case 'dots':
      return `<pattern id="${id}" width="16" height="16" patternUnits="userSpaceOnUse"><circle cx="8" cy="8" r="1.2" fill="${col}" fill-opacity="0.14"/></pattern>`;
    case 'hatch':
      return `<pattern id="${id}" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="12" stroke="${col}" stroke-opacity="0.10" stroke-width="1.2"/></pattern>`;
    case 'rings':
      return `<pattern id="${id}" width="56" height="56" patternUnits="userSpaceOnUse"><circle cx="28" cy="28" r="10" fill="none" stroke="${col}" stroke-opacity="0.09" stroke-width="1"/><circle cx="28" cy="28" r="22" fill="none" stroke="${col}" stroke-opacity="0.07" stroke-width="1"/></pattern>`;
    case 'waves':
      return `<pattern id="${id}" width="40" height="20" patternUnits="userSpaceOnUse"><path d="M 0 10 Q 10 2 20 10 T 40 10" fill="none" stroke="${col}" stroke-opacity="0.10" stroke-width="1.2"/></pattern>`;
    default:
      return null;
  }
}

/**
 * Computes normalized SVG sparkline line + filled area paths inside (0..w, 0..h).
 */
export function computeSparklineGeometry(
  values: readonly number[],
  width: number,
  height: number
): { linePath: string; areaPath: string; points: Array<{ x: number; y: number }> } {
  const safe = values.length >= 2 ? values : [values[0] ?? 50, values[0] ?? 50];
  const min = Math.min(...safe);
  const max = Math.max(...safe);
  const span = Math.max(1, max - min);
  const padY = Math.max(6, height * 0.12);
  const usableH = Math.max(4, height - padY * 2);

  const points = safe.map((v, i) => ({
    x: +((i / (safe.length - 1)) * width).toFixed(2),
    y: +(padY + usableH - ((v - min) / span) * usableH).toFixed(2),
  }));

  const linePath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
    .join(' ');
  const areaPath = `${linePath} L ${width.toFixed(2)} ${height.toFixed(2)} L 0 ${height.toFixed(2)} Z`;

  return { linePath, areaPath, points };
}
