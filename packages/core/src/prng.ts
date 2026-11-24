import type { RectPt } from '@bento/contract';

export const SEED_MIN = 1;
export const SEED_MAX = 999999;
export const SEED_CODE_REGEX = /^B(\d{1,2})-(\d{1,6})$/i;

/**
 * Deterministic 32-bit PRNG (Mulberry32).
 * Math.random() is strictly forbidden inside @bento/core.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function normalizeSeed(seed: number): number {
  const floored = Math.floor(Math.abs(seed));
  if (!Number.isFinite(floored) || floored < SEED_MIN) {
    return SEED_MIN;
  }
  return ((floored - SEED_MIN) % (SEED_MAX - SEED_MIN + 1)) + SEED_MIN;
}

export function formatSeedCode(count: number, seed: number): string {
  const safeCount = Math.max(1, Math.min(16, Math.round(count)));
  const safeSeed = normalizeSeed(seed);
  return `B${safeCount}-${safeSeed}`;
}

export function parseSeedCode(code: string): { count: number; seed: number } | null {
  const trimmed = code.trim();
  const match = SEED_CODE_REGEX.exec(trimmed);
  if (!match || !match[1] || !match[2]) {
    return null;
  }
  const count = Number.parseInt(match[1], 10);
  const seed = Number.parseInt(match[2], 10);
  if (!Number.isFinite(count) || !Number.isFinite(seed)) {
    return null;
  }
  if (count < 1 || count > 16 || seed < SEED_MIN || seed > SEED_MAX) {
    return null;
  }
  return { count, seed };
}

/**
 * Deterministically derives the next seed from the current seed using Mulberry32.
 */
export function nextDeterministicSeed(currentSeed: number): number {
  const normalized = normalizeSeed(currentSeed);
  const rng = mulberry32(normalized ^ 0x9e3779b9);
  const candidate = Math.floor(rng() * (SEED_MAX - SEED_MIN + 1)) + SEED_MIN;
  if (candidate === normalized) {
    return normalized === SEED_MAX ? SEED_MIN : normalized + 1;
  }
  return candidate;
}

/**
 * Deterministically creates a compact bentoId (e.g. "bnt_7k2m9x") without Date.now() or Math.random().
 */
export function createDeterministicBentoId(seed: number, anchorRect: RectPt, salt = 0): string {
  let hash = normalizeSeed(seed) ^ ((salt * 2654435761) >>> 0);
  const parts = [
    Math.round(anchorRect.left * 100),
    Math.round(anchorRect.top * 100),
    Math.round(anchorRect.width * 100),
    Math.round(anchorRect.height * 100),
  ];
  for (const part of parts) {
    hash = Math.imul(hash ^ (part >>> 0), 0x45d9f3b) >>> 0;
  }
  const rng = mulberry32(hash || 1);
  const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz';
  let suffix = '';
  for (let i = 0; i < 6; i++) {
    const idx = Math.floor(rng() * alphabet.length);
    suffix += alphabet.charAt(idx);
  }
  return `bnt_${suffix}`;
}
