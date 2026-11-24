import type {
  BentoSculptOverlay,
  BspLeafNode,
  BspNode,
  BspSplitNode,
  CellShapeKind,
  CutoutCorner,
  GridSystemId,
  HierarchyMode,
  LayoutIntent,
  RectPt,
  SplitAxis,
  StylePresetId,
} from '@bento/contract';
import {
  canSplitHorizontal,
  canSplitVertical,
  clampSplitRatioForRounding,
  type MinCellDimensions,
  type ResolvedLeaf,
  resolveTreeLayout,
  round2,
  sortReadingOrder,
} from './geometry.js';

export type ContainerRegime = 'wide' | 'landscape' | 'square' | 'portrait';

export interface IntentRecommendedParams {
  count: number;
  gutterPt: number;
  radiusPt: number;
  heroBias: number;
  stylePreset: StylePresetId;
  hierarchyMode: HierarchyMode;
  gridSystem?: GridSystemId;
}

export interface LayoutIntentDefinition {
  id: LayoutIntent;
  label: string;
  shortCaption: string;
  description: string;
  recommendedParams: IntentRecommendedParams;
  targetHeroShareRange: readonly [number, number] | null;
}

export const LAYOUT_INTENTS: readonly LayoutIntentDefinition[] = [
  {
    id: 'executive-brief',
    label: 'Executive',
    shortCaption: 'Thesis + proof',
    description: 'Dominant takeaway paired with a clean stack of supporting proof & metrics.',
    recommendedParams: {
      count: 5,
      gutterPt: 10,
      radiusPt: 14,
      heroBias: 0.65,
      stylePreset: 'soft-modern',
      hierarchyMode: 'hero-accent',
    },
    targetHeroShareRange: [0.34, 0.56],
  },
  {
    id: 'editorial-story',
    label: 'Editorial',
    shortCaption: 'Swiss 2:1 story',
    description: 'Asymmetric Swiss magazine spread balancing lead visual, quote, and context.',
    recommendedParams: {
      count: 5,
      gutterPt: 12,
      radiusPt: 2,
      heroBias: 0.6,
      stylePreset: 'swiss-editorial',
      hierarchyMode: 'uniform',
    },
    targetHeroShareRange: [0.32, 0.52],
  },
  {
    id: 'kpi-dashboard',
    label: 'KPI Grid',
    shortCaption: 'Metrics + chart',
    description: 'Scannable KPI stat strip paired with a wide trend chart and insight card.',
    recommendedParams: {
      count: 6,
      gutterPt: 10,
      radiusPt: 14,
      heroBias: 0.55,
      stylePreset: 'elevated-cards',
      hierarchyMode: 'tonal-ramp',
    },
    targetHeroShareRange: [0.3, 0.5],
  },
  {
    id: 'product-showcase',
    label: 'Showcase',
    shortCaption: 'Centerpiece hub',
    description: 'Apple-style centerpiece hero flanked by balanced capability highlights.',
    recommendedParams: {
      count: 5,
      gutterPt: 12,
      radiusPt: 14,
      heroBias: 0.75,
      stylePreset: 'dark-surface',
      hierarchyMode: 'hero-accent',
    },
    targetHeroShareRange: [0.36, 0.56],
  },
  {
    id: 'comparison',
    label: 'Compare',
    shortCaption: '50/50 twin',
    description: 'Visually fair two-pillar layout for Before/After or Option A vs Option B.',
    recommendedParams: {
      count: 4,
      gutterPt: 12,
      radiusPt: 12,
      heroBias: 0.0,
      stylePreset: 'soft-modern',
      hierarchyMode: 'uniform',
    },
    targetHeroShareRange: null,
  },
  {
    id: 'matrix-grid',
    label: 'Hairline Matrix',
    shortCaption: '0pt staggered',
    description: 'Zero-gutter architectural hairline grid with diagonal wide spotlight rows.',
    recommendedParams: {
      count: 9,
      gutterPt: 0,
      radiusPt: 0,
      heroBias: 0.5,
      stylePreset: 'dark-surface',
      hierarchyMode: 'tonal-ramp',
    },
    targetHeroShareRange: [0.14, 0.34],
  },
  {
    id: 'brand-collage',
    label: 'Brand Collage',
    shortCaption: '3-col masonry',
    description: 'Staggered 3-column editorial & brand identity grid with a central anchor.',
    recommendedParams: {
      count: 7,
      gutterPt: 8,
      radiusPt: 12,
      heroBias: 0.55,
      stylePreset: 'soft-modern',
      hierarchyMode: 'hero-accent',
    },
    targetHeroShareRange: [0.18, 0.38],
  },
  {
    id: 'creative',
    label: 'Creative',
    shortCaption: 'Golden & L-frame',
    description: 'Art-directed golden spiral, L-frame gallery, and offset pinwheel spreads.',
    recommendedParams: {
      count: 6,
      gutterPt: 12,
      radiusPt: 14,
      heroBias: 0.7,
      stylePreset: 'swiss-editorial',
      hierarchyMode: 'hero-accent',
    },
    targetHeroShareRange: [0.34, 0.56],
  },
  {
    id: 'experimental',
    label: 'Experimental',
    shortCaption: 'Avant-garde burst',
    description: 'Rule-breaking scale tension, brutalist spines, fractured De Stijl & corner bursts.',
    recommendedParams: {
      count: 7,
      gutterPt: 6,
      radiusPt: 0,
      heroBias: 0.8,
      stylePreset: 'dark-surface',
      hierarchyMode: 'tonal-ramp',
      gridSystem: 'free',
    },
    targetHeroShareRange: [0.38, 0.68],
  },
  {
    id: 'sculpted',
    label: 'Sculpted',
    shortCaption: 'Circles, pills & arches',
    description: 'Organic bento combining inscribed circles, stadium pills, arches, and diagonal leaves.',
    recommendedParams: {
      count: 5,
      gutterPt: 12,
      radiusPt: 18,
      heroBias: 0.6,
      stylePreset: 'soft-modern',
      hierarchyMode: 'hero-accent',
    },
    targetHeroShareRange: [0.3, 0.54],
  },
  {
    id: 'puzzle',
    label: 'Puzzle',
    shortCaption: 'L-wraps & center hubs',
    description: 'Interlocking L-shaped concave cards and 4-card layouts carved around a floating circle hub.',
    recommendedParams: {
      count: 4,
      gutterPt: 12,
      radiusPt: 16,
      heroBias: 0.6,
      stylePreset: 'elevated-cards',
      hierarchyMode: 'hero-accent',
    },
    targetHeroShareRange: [0.32, 0.62],
  },
  {
    id: 'freeform',
    label: 'Auto / Mix',
    shortCaption: 'Harmonic mix',
    description: 'Open harmonic exploration across the full Hero Bias spectrum.',
    recommendedParams: {
      count: 5,
      gutterPt: 10,
      radiusPt: 12,
      heroBias: 0.5,
      stylePreset: 'soft-modern',
      hierarchyMode: 'hero-accent',
    },
    targetHeroShareRange: [0.28, 0.54],
  },
] as const;

export const DECK_BUILDER_INTENT_ARC: readonly LayoutIntent[] = [
  'executive-brief',
  'kpi-dashboard',
  'product-showcase',
  'editorial-story',
  'comparison',
] as const;

export const HARMONIC_RATIOS: readonly number[] = [
  0.25,
  1 / 3,
  0.4,
  0.5,
  0.6,
  2 / 3,
  0.75,
] as const;

export function getIntentDefinition(intent: LayoutIntent): LayoutIntentDefinition {
  return LAYOUT_INTENTS.find((item) => item.id === intent) ?? LAYOUT_INTENTS[0]!;
}

export function detectContainerRegime(rect: RectPt): ContainerRegime {
  const aspect = rect.width / Math.max(1, rect.height);
  if (aspect >= 2.8) return 'wide';
  if (aspect >= 1.25) return 'landscape';
  if (aspect >= 0.8) return 'square';
  return 'portrait';
}

export function splitRectExact(
  rect: RectPt,
  axis: SplitAxis,
  ratio: number,
  gutterPt: number
): [RectPt, RectPt] {
  const g = round2(Math.max(0, gutterPt));
  if (axis === 'vertical') {
    const availW = Math.max(0, round2(rect.width - g));
    const w1 = round2(availW * ratio);
    const w2 = round2(availW - w1);
    return [
      { left: rect.left, top: rect.top, width: w1, height: rect.height },
      { left: round2(rect.left + w1 + g), top: rect.top, width: w2, height: rect.height },
    ];
  }
  const availH = Math.max(0, round2(rect.height - g));
  const h1 = round2(availH * ratio);
  const h2 = round2(availH - h1);
  return [
    { left: rect.left, top: rect.top, width: rect.width, height: h1 },
    { left: rect.left, top: round2(rect.top + h1 + g), width: rect.width, height: h2 },
  ];
}

/**
 * Picks a valid Swiss harmonic ratio from candidates, clamped strictly for minSide & 0.01pt rounding.
 */
export function pickHarmonicRatio(
  axisLen: number,
  gutterPt: number,
  minSide: number,
  candidates: readonly number[],
  rng: () => number
): number {
  const avail = round2(axisLen - gutterPt);
  const valid = candidates.filter((r) => {
    const first = round2(avail * r);
    const second = round2(avail - first);
    return first >= minSide && second >= minSide;
  });

  const desired =
    valid.length > 0
      ? valid[Math.floor(rng() * valid.length)]!
      : candidates[Math.floor(rng() * candidates.length)] ?? 0.5;

  return clampSplitRatioForRounding(axisLen, gutterPt, minSide, desired);
}

/**
 * Evaluates a candidate split's aspect-ratio comfort to steer away from skinny pillars or pancake strips.
 */
export function scoreSplitAspectComfort(
  rect: RectPt,
  axis: SplitAxis,
  ratio: number,
  gutterPt: number,
  containerAspect: number
): number {
  const [r1, r2] = splitRectExact(rect, axis, ratio, gutterPt);
  const maxComfort = Math.max(3.0, containerAspect * 0.85);
  const minComfort = Math.min(0.45, containerAspect * 0.6);

  const penalty = (r: RectPt): number => {
    const ar = r.width / Math.max(1, r.height);
    if (ar > maxComfort) return (ar - maxComfort) * 3.0;
    if (ar < minComfort) return (minComfort / Math.max(0.05, ar) - 1) * 3.0;
    return 0;
  };

  return -(penalty(r1) + penalty(r2));
}

/**
 * Deterministic "Art Director" aesthetics scorer (Best-of-K candidate selector).
 * Evaluates sliver avoidance, Swiss sightline alignment, hero dominance fit, and supporting balance.
 */
export function scoreLayoutAesthetics(
  resolved: readonly ResolvedLeaf[],
  anchorRect: RectPt,
  intent: LayoutIntent
): number {
  if (resolved.length <= 1) {
    return 0;
  }

  const totalArea = Math.max(1, anchorRect.width * anchorRect.height);
  const containerAR = anchorRect.width / Math.max(1, anchorRect.height);
  const isExperimental = intent === 'experimental';
  const isCreative = intent === 'creative';

  const maxAR = isExperimental
    ? Math.max(5.5, containerAR * 1.8)
    : isCreative
      ? Math.max(3.8, containerAR * 1.15)
      : Math.max(3.1, containerAR * 0.85);
  const minAR = isExperimental
    ? Math.min(0.2, containerAR * 0.28)
    : isCreative
      ? Math.min(0.32, containerAR * 0.45)
      : Math.min(0.42, containerAR * 0.55);

  let score = 100;

  // 1. Sliver Guard: penalize extreme pancake strips or skinny pillars
  for (const item of resolved) {
    const ar = item.rect.width / Math.max(1, item.rect.height);
    if (ar > maxAR) {
      score -= Math.min(30, (ar - maxAR) * (isExperimental ? 5 : 8));
    } else if (ar < minAR) {
      score -= Math.min(30, (minAR / Math.max(0.05, ar) - 1) * (isExperimental ? 6 : 10));
    }
  }

  // 2. Sightline Alignment vs. Fractured De Stijl T-Junction Tension
  const internalX = new Map<number, number>();
  const internalY = new Map<number, number>();
  const outerLeft = Math.round(anchorRect.left);
  const outerRight = Math.round(anchorRect.left + anchorRect.width);
  const outerTop = Math.round(anchorRect.top);
  const outerBottom = Math.round(anchorRect.top + anchorRect.height);

  for (const { rect } of resolved) {
    const xEdges = [Math.round(rect.left), Math.round(rect.left + rect.width)];
    const yEdges = [Math.round(rect.top), Math.round(rect.top + rect.height)];
    for (const x of xEdges) {
      if (Math.abs(x - outerLeft) > 2 && Math.abs(x - outerRight) > 2) {
        internalX.set(x, (internalX.get(x) ?? 0) + 1);
      }
    }
    for (const y of yEdges) {
      if (Math.abs(y - outerTop) > 2 && Math.abs(y - outerBottom) > 2) {
        internalY.set(y, (internalY.get(y) ?? 0) + 1);
      }
    }
  }

  let sharedSightlines = 0;
  for (const count of internalX.values()) {
    if (count >= 3) sharedSightlines += count - 2;
  }
  for (const count of internalY.values()) {
    if (count >= 3) sharedSightlines += count - 2;
  }

  if (isExperimental) {
    // Experimental rewards staggered T-junction edge diversity and penalizes rigid crosshairs
    const uniqueInternalEdges = internalX.size + internalY.size;
    score += Math.min(18, uniqueInternalEdges * 2.0);
    score -= Math.min(12, sharedSightlines * 1.5);
  } else {
    score += Math.min(20, sharedSightlines * (isCreative ? 1.5 : 2.5));
  }

  // 3. Hero Dominance Fit
  const def = getIntentDefinition(intent);
  const hero = resolved.find((r) => r.leaf.role === 'hero');
  if (def.targetHeroShareRange && hero) {
    const [minShare, maxShare] = def.targetHeroShareRange;
    const heroShare = (hero.rect.width * hero.rect.height) / totalArea;
    if (heroShare >= minShare && heroShare <= maxShare) {
      score += 14;
    } else {
      const dist = heroShare < minShare ? minShare - heroShare : heroShare - maxShare;
      score -= Math.min(24, dist * 45);
    }
  }

  // 4. Scale Hierarchy & Supporting Tile Balance
  const allAreas = resolved.map((r) => r.rect.width * r.rect.height);
  const nonHeroAreas = resolved
    .filter((r) => r.leaf.role !== 'hero')
    .map((r) => r.rect.width * r.rect.height);

  if (isExperimental) {
    // Reward dramatic scale contrast (monumental stage + micro-cluster tiles)
    const totalSpread = Math.max(...allAreas) / Math.max(1, Math.min(...allAreas));
    if (totalSpread >= 3.0) {
      score += Math.min(18, (totalSpread - 2.0) * 3.5);
    } else {
      score -= 8;
    }
  } else if (isCreative) {
    // Reward deliberate asymmetric scale contrast without chaotic extremes
    if (nonHeroAreas.length >= 2) {
      const spread = Math.max(...nonHeroAreas) / Math.max(1, Math.min(...nonHeroAreas));
      if (spread >= 1.5 && spread <= 4.5) {
        score += 12;
      } else if (spread > 6.0) {
        score -= Math.min(16, (spread - 6.0) * 3);
      }
    }
  } else if (nonHeroAreas.length >= 2) {
    const maxNonHero = Math.max(...nonHeroAreas);
    const minNonHero = Math.max(1, Math.min(...nonHeroAreas));
    const spread = maxNonHero / minNonHero;
    if (spread <= 2.4) {
      score += 10;
    } else if (spread > 4.0) {
      score -= Math.min(22, (spread - 4.0) * 5);
    }
  }

  return score;
}

export interface IntentBuilderContext {
  rect: RectPt;
  targetCount: number;
  gutterPt: number;
  heroBias: number;
  minDims: MinCellDimensions;
  rng: () => number;
  nextNodeId: () => string;
  nextTempSlotId: () => string;
  allowHero: boolean;
}

function makeLeaf(
  ctx: IntentBuilderContext,
  role: 'standard' | 'hero' = 'standard'
): BspLeafNode {
  return {
    kind: 'leaf',
    nodeId: ctx.nextNodeId(),
    slotId: ctx.nextTempSlotId(),
    role,
    locked: false,
  };
}

/**
 * Builds an evenly spaced N-card strip along a single axis using exact gutter-compensated BSP ratios.
 * Falls back gracefully to orthogonal subdivision or stops early if minW/minH caps splits.
 */
function buildEqualStrip(
  rect: RectPt,
  count: number,
  axis: SplitAxis,
  ctx: IntentBuilderContext
): BspNode {
  if (count <= 1) {
    return makeLeaf(ctx, 'standard');
  }

  const axisLen = axis === 'vertical' ? rect.width : rect.height;
  const minSide = axis === 'vertical' ? ctx.minDims.minW : ctx.minDims.minH;
  const g = ctx.gutterPt;

  // Check if all `count` equal tiles fit along `axis`
  const maxFittingAlongAxis = Math.max(1, Math.floor((axisLen + g) / (minSide + g)));

  if (maxFittingAlongAxis >= count) {
    // Split `m` tiles on first, `count - m` on second (balanced binary split keeps depth shallow)
    const m = Math.ceil(count / 2);
    const tileSize = (axisLen - (count - 1) * g) / count;
    const firstSpan = m * tileSize + (m - 1) * g;
    const avail = round2(axisLen - g);
    const desiredRatio = avail > 0 ? firstSpan / avail : 0.5;
    const safeRatio = clampSplitRatioForRounding(axisLen, g, minSide, desiredRatio);
    const [r1, r2] = splitRectExact(rect, axis, safeRatio, g);

    return {
      kind: 'split',
      nodeId: ctx.nextNodeId(),
      axis,
      ratio: safeRatio,
      first: buildEqualStrip(r1, m, axis, ctx),
      second: buildEqualStrip(r2, count - m, axis, ctx),
    };
  }

  // Otherwise fall back to general harmonic subdivision within `rect`
  return buildHarmonicBalancedSubtree(rect, count, ctx, false);
}

/**
 * Builds a clean, sliver-avoiding harmonic subtree for supporting regions (or Comparison halves).
 */
export function buildHarmonicBalancedSubtree(
  rect: RectPt,
  targetCount: number,
  ctx: IntentBuilderContext,
  markFirstHero: boolean
): BspNode {
  if (targetCount <= 1) {
    return makeLeaf(ctx, markFirstHero && ctx.allowHero ? 'hero' : 'standard');
  }

  const containerAR = ctx.rect.width / Math.max(1, ctx.rect.height);
  const canV = canSplitVertical(rect, ctx.gutterPt, ctx.minDims.minW);
  const canH = canSplitHorizontal(rect, ctx.gutterPt, ctx.minDims.minH);

  if (!canV && !canH) {
    return makeLeaf(ctx, markFirstHero && ctx.allowHero ? 'hero' : 'standard');
  }

  // Choose the split axis that keeps child aspect ratios healthiest
  let axis: SplitAxis;
  if (canV && !canH) {
    axis = 'vertical';
  } else if (!canV && canH) {
    axis = 'horizontal';
  } else {
    const scoreV = scoreSplitAspectComfort(rect, 'vertical', 0.5, ctx.gutterPt, containerAR);
    const scoreH = scoreSplitAspectComfort(rect, 'horizontal', 0.5, ctx.gutterPt, containerAR);
    if (Math.abs(scoreV - scoreH) > 0.25) {
      axis = scoreV >= scoreH ? 'vertical' : 'horizontal';
    } else {
      axis = rect.width >= rect.height ? 'vertical' : 'horizontal';
    }
  }

  // For 2 or 3 cards along a wide/tall strip, equal strip looks ultra-clean
  if (targetCount <= 3 && !markFirstHero) {
    const axisLen = axis === 'vertical' ? rect.width : rect.height;
    const minSide = axis === 'vertical' ? ctx.minDims.minW : ctx.minDims.minH;
    const maxAlong = Math.floor((axisLen + ctx.gutterPt) / (minSide + ctx.gutterPt));
    if (maxAlong >= targetCount) {
      const projectedChildAR =
        axis === 'vertical'
          ? (axisLen / targetCount) / Math.max(1, rect.height)
          : rect.width / Math.max(1, axisLen / targetCount);
      if (projectedChildAR >= 0.45 && projectedChildAR <= 3.0) {
        return buildEqualStrip(rect, targetCount, axis, ctx);
      }
    }
  }

  const firstCount = markFirstHero ? 1 : Math.ceil(targetCount / 2);
  const secondCount = targetCount - firstCount;
  const harmonicPool = markFirstHero
    ? [0.5, 0.6, 2 / 3]
    : firstCount === secondCount
      ? [0.5, 0.5, 0.4, 0.6]
      : [0.5, 0.6, 2 / 3];

  const axisLen = axis === 'vertical' ? rect.width : rect.height;
  const minSide = axis === 'vertical' ? ctx.minDims.minW : ctx.minDims.minH;
  const ratio = pickHarmonicRatio(axisLen, ctx.gutterPt, minSide, harmonicPool, ctx.rng);
  const [r1, r2] = splitRectExact(rect, axis, ratio, ctx.gutterPt);

  return {
    kind: 'split',
    nodeId: ctx.nextNodeId(),
    axis,
    ratio,
    first: buildHarmonicBalancedSubtree(r1, firstCount, ctx, markFirstHero),
    second: buildHarmonicBalancedSubtree(r2, secondCount, ctx, false),
  };
}

function buildSplitWithHero(
  rect: RectPt,
  axis: SplitAxis,
  heroOnFirst: boolean,
  heroRatios: readonly number[],
  supportingCount: number,
  ctx: IntentBuilderContext,
  supportingBuilder?: (subRect: RectPt, count: number) => BspNode
): BspNode | null {
  const canSplit =
    axis === 'vertical'
      ? canSplitVertical(rect, ctx.gutterPt, ctx.minDims.minW)
      : canSplitHorizontal(rect, ctx.gutterPt, ctx.minDims.minH);

  if (!canSplit) {
    return null;
  }

  const axisLen = axis === 'vertical' ? rect.width : rect.height;
  const minSide = axis === 'vertical' ? ctx.minDims.minW : ctx.minDims.minH;
  const heroShare = pickHarmonicRatio(axisLen, ctx.gutterPt, minSide, heroRatios, ctx.rng);
  const ratio = heroOnFirst
    ? heroShare
    : clampSplitRatioForRounding(axisLen, ctx.gutterPt, minSide, 1 - heroShare);

  const [r1, r2] = splitRectExact(rect, axis, ratio, ctx.gutterPt);
  const heroNode = makeLeaf(ctx, ctx.allowHero ? 'hero' : 'standard');
  const buildSupp =
    supportingBuilder ??
    ((sub: RectPt, cnt: number) => buildHarmonicBalancedSubtree(sub, cnt, ctx, false));

  const split: BspSplitNode = {
    kind: 'split',
    nodeId: ctx.nextNodeId(),
    axis,
    ratio,
    first: heroOnFirst ? heroNode : buildSupp(r1, supportingCount),
    second: heroOnFirst ? buildSupp(r2, supportingCount) : heroNode,
  };
  return split;
}

/**
 * Builds a single 3-cell row snapped to an exact 4-column track grid (u = (W - 3g) / 4)
 * so [1u | 1u | 2u+g], [1u | 2u+g | 1u], and [2u+g | 1u | 1u] align to 0.00pt across rows.
 */
function buildStaggered4TrackRow(
  rowRect: RectPt,
  widePos: 'left' | 'center' | 'right',
  markWideHero: boolean,
  ctx: IntentBuilderContext
): BspNode {
  const g = ctx.gutterPt;
  const minW = ctx.minDims.minW;
  const u = (rowRect.width - 3 * g) / 4;

  // Fallback gracefully if container is too narrow for 4-track staggered widths
  if (u < minW || !canSplitVertical(rowRect, g, minW)) {
    return buildEqualStrip(rowRect, 3, 'vertical', ctx);
  }

  const availRoot = round2(rowRect.width - g);
  const heroRole: 'hero' | 'standard' = markWideHero && ctx.allowHero ? 'hero' : 'standard';

  if (widePos === 'right') {
    const rootRatio = clampSplitRatioForRounding(rowRect.width, g, minW, 0.5);
    const [leftHalf] = splitRectExact(rowRect, 'vertical', rootRatio, g);
    const leftNode: BspNode = canSplitVertical(leftHalf, g, minW)
      ? {
          kind: 'split',
          nodeId: ctx.nextNodeId(),
          axis: 'vertical',
          ratio: clampSplitRatioForRounding(leftHalf.width, g, minW, 0.5),
          first: makeLeaf(ctx, 'standard'),
          second: makeLeaf(ctx, 'standard'),
        }
      : makeLeaf(ctx, 'standard');

    return {
      kind: 'split',
      nodeId: ctx.nextNodeId(),
      axis: 'vertical',
      ratio: rootRatio,
      first: leftNode,
      second: makeLeaf(ctx, heroRole),
    };
  }

  if (widePos === 'left') {
    const rootRatio = clampSplitRatioForRounding(rowRect.width, g, minW, 0.5);
    const [, rightHalf] = splitRectExact(rowRect, 'vertical', rootRatio, g);
    const rightNode: BspNode = canSplitVertical(rightHalf, g, minW)
      ? {
          kind: 'split',
          nodeId: ctx.nextNodeId(),
          axis: 'vertical',
          ratio: clampSplitRatioForRounding(rightHalf.width, g, minW, 0.5),
          first: makeLeaf(ctx, 'standard'),
          second: makeLeaf(ctx, 'standard'),
        }
      : makeLeaf(ctx, 'standard');

    return {
      kind: 'split',
      nodeId: ctx.nextNodeId(),
      axis: 'vertical',
      ratio: rootRatio,
      first: makeLeaf(ctx, heroRole),
      second: rightNode,
    };
  }

  // widePos === 'center': exact [1u | 2u+g (HERO) | 1u]
  const rootRatio = clampSplitRatioForRounding(
    rowRect.width,
    g,
    minW,
    u / Math.max(1, availRoot)
  );
  const [, rightThreeQuarters] = splitRectExact(rowRect, 'vertical', rootRatio, g);
  const rightNode: BspNode = canSplitVertical(rightThreeQuarters, g, minW)
    ? {
        kind: 'split',
        nodeId: ctx.nextNodeId(),
        axis: 'vertical',
        ratio: clampSplitRatioForRounding(
          rightThreeQuarters.width,
          g,
          minW,
          (2 * u + g) / Math.max(1, round2(rightThreeQuarters.width - g))
        ),
        first: makeLeaf(ctx, heroRole),
        second: makeLeaf(ctx, 'standard'),
      }
    : makeLeaf(ctx, heroRole);

  return {
    kind: 'split',
    nodeId: ctx.nextNodeId(),
    axis: 'vertical',
    ratio: rootRatio,
    first: makeLeaf(ctx, 'standard'),
    second: rightNode,
  };
}

/**
 * Builds a single staggered column with intentional ratio offsets so adjacent columns
 * never form monotonous horizontal seams (ChromaDB / PRISM / technexus masonry look).
 */
function buildStaggeredColumn(
  colRect: RectPt,
  count: number,
  staggerRatios: readonly number[],
  heroIndex: number,
  ctx: IntentBuilderContext
): BspNode {
  const g = ctx.gutterPt;
  const minH = ctx.minDims.minH;

  if (count <= 1 || !canSplitHorizontal(colRect, g, minH)) {
    return makeLeaf(ctx, heroIndex === 0 && ctx.allowHero ? 'hero' : 'standard');
  }

  if (count === 2) {
    const ratio = pickHarmonicRatio(colRect.height, g, minH, staggerRatios, ctx.rng);
    return {
      kind: 'split',
      nodeId: ctx.nextNodeId(),
      axis: 'horizontal',
      ratio,
      first: makeLeaf(ctx, heroIndex === 0 && ctx.allowHero ? 'hero' : 'standard'),
      second: makeLeaf(ctx, heroIndex === 1 && ctx.allowHero ? 'hero' : 'standard'),
    };
  }

  // 3+ stacked tiles in one column: split first tile off with staggered ratio, then subdivide remainder
  const firstRatio = pickHarmonicRatio(
    colRect.height,
    g,
    minH,
    [1 / 3, 0.4, 0.3],
    ctx.rng
  );
  const [, restRect] = splitRectExact(colRect, 'horizontal', firstRatio, g);
  return {
    kind: 'split',
    nodeId: ctx.nextNodeId(),
    axis: 'horizontal',
    ratio: firstRatio,
    first: makeLeaf(ctx, heroIndex === 0 && ctx.allowHero ? 'hero' : 'standard'),
    second: buildStaggeredColumn(
      restRect,
      count - 1,
      [0.5, 0.6, 0.4],
      heroIndex - 1,
      ctx
    ),
  };
}

/**
 * Generates an intent-specific BSP tree adapted to container aspect regime.
 * Returns null if the intent prefers fallback to the harmonic freeform engine.
 */
export function buildIntentTree(
  intent: LayoutIntent,
  ctx: IntentBuilderContext
): BspNode | null {
  if (intent === 'freeform' || ctx.targetCount <= 1) {
    return null;
  }

  const regime = detectContainerRegime(ctx.rect);
  const n = ctx.targetCount;
  const g = ctx.gutterPt;

  if (n === 2) {
    const preferV = regime !== 'portrait';
    const axis: SplitAxis | null =
      preferV && canSplitVertical(ctx.rect, g, ctx.minDims.minW)
        ? 'vertical'
        : canSplitHorizontal(ctx.rect, g, ctx.minDims.minH)
          ? 'horizontal'
          : canSplitVertical(ctx.rect, g, ctx.minDims.minW)
            ? 'vertical'
            : null;
    if (!axis) return makeLeaf(ctx, 'standard');

    const ratios = intent === 'comparison' ? [0.5] : [0.5, 0.6, 2 / 3];
    const axisLen = axis === 'vertical' ? ctx.rect.width : ctx.rect.height;
    const minSide = axis === 'vertical' ? ctx.minDims.minW : ctx.minDims.minH;
    const ratio = pickHarmonicRatio(axisLen, g, minSide, ratios, ctx.rng);
    return {
      kind: 'split',
      nodeId: ctx.nextNodeId(),
      axis,
      ratio,
      first: makeLeaf(ctx, intent !== 'comparison' && ctx.allowHero ? 'hero' : 'standard'),
      second: makeLeaf(ctx, 'standard'),
    };
  }

  switch (intent) {
    case 'executive-brief': {
      // On landscape with 4..6 cards, alternate between GLP Coaching 2-over-3 staggered rows
      // ([2/3 Hero | 1/3] over [1/3 | 1/3 | 1/3] with shared 2/3 sightline!) and classic Hero Left
      const useGlpStaggered =
        regime === 'landscape' &&
        n >= 4 &&
        n <= 6 &&
        canSplitHorizontal(ctx.rect, g, ctx.minDims.minH) &&
        canSplitVertical(ctx.rect, g, ctx.minDims.minW) &&
        ctx.rng() < 0.48;

      if (useGlpStaggered) {
        const topRatio = pickHarmonicRatio(
          ctx.rect.height,
          g,
          ctx.minDims.minH,
          [0.5, 0.5, 0.55],
          ctx.rng
        );
        const [topRow, bottomRow] = splitRectExact(ctx.rect, 'horizontal', topRatio, g);
        const bottomCols = n === 4 ? 2 : 3;
        const topCols = n - bottomCols;

        // Match the exact 2/3 sightline of the 3-col bottom row when topCols === 2 & bottomCols === 3
        let topNode: BspNode;
        if (topCols === 2 && bottomCols === 3) {
          const tileW = (topRow.width - 2 * g) / 3;
          const twoThirdsRatio = clampSplitRatioForRounding(
            topRow.width,
            g,
            ctx.minDims.minW,
            (2 * tileW + g) / Math.max(1, round2(topRow.width - g))
          );
          topNode = {
            kind: 'split',
            nodeId: ctx.nextNodeId(),
            axis: 'vertical',
            ratio: twoThirdsRatio,
            first: makeLeaf(ctx, ctx.allowHero ? 'hero' : 'standard'),
            second: makeLeaf(ctx, 'standard'),
          };
        } else if (topCols === 2) {
          const r = pickHarmonicRatio(topRow.width, g, ctx.minDims.minW, [2 / 3, 0.6], ctx.rng);
          topNode = {
            kind: 'split',
            nodeId: ctx.nextNodeId(),
            axis: 'vertical',
            ratio: r,
            first: makeLeaf(ctx, ctx.allowHero ? 'hero' : 'standard'),
            second: makeLeaf(ctx, 'standard'),
          };
        } else {
          topNode = buildEqualStrip(topRow, topCols, 'vertical', ctx);
        }

        return {
          kind: 'split',
          nodeId: ctx.nextNodeId(),
          axis: 'horizontal',
          ratio: topRatio,
          first: topNode,
          second: buildEqualStrip(bottomRow, bottomCols, 'vertical', ctx),
        };
      }

      // Hero Left (landscape/wide) or Hero Top (portrait/square), mirrored 22% of seeds
      const primaryAxis: SplitAxis =
        regime === 'portrait' ? 'horizontal' : 'vertical';
      const fallbackAxis: SplitAxis =
        primaryAxis === 'vertical' ? 'horizontal' : 'vertical';
      const heroOnFirst = ctx.rng() < 0.78;
      const heroRatios =
        ctx.heroBias >= 0.65
          ? [0.5, 0.6, 2 / 3]
          : ctx.heroBias >= 0.35
            ? [0.5, 0.6]
            : [0.4, 0.5];

      return (
        buildSplitWithHero(ctx.rect, primaryAxis, heroOnFirst, heroRatios, n - 1, ctx) ??
        buildSplitWithHero(ctx.rect, fallbackAxis, heroOnFirst, heroRatios, n - 1, ctx)
      );
    }

    case 'editorial-story': {
      // Swiss 2:1 Asymmetric Columns (landscape/wide) or 3:2 Hero Top + asymmetric footer (portrait/square)
      if (regime === 'landscape' || regime === 'wide') {
        if (canSplitVertical(ctx.rect, g, ctx.minDims.minW)) {
          const leftOnFirst = ctx.rng() < 0.75;
          const majorRatios = [2 / 3, 0.6];
          const majorShare = pickHarmonicRatio(ctx.rect.width, g, ctx.minDims.minW, majorRatios, ctx.rng);
          const ratio = leftOnFirst
            ? majorShare
            : clampSplitRatioForRounding(ctx.rect.width, g, ctx.minDims.minW, 1 - majorShare);
          const [r1, r2] = splitRectExact(ctx.rect, 'vertical', ratio, g);
          const majorRect = leftOnFirst ? r1 : r2;
          const railRect = leftOnFirst ? r2 : r1;

          // Distribute cards: rail gets 1..3 stacked editorial notes, major gets hero + optional proof row
          const railCount = Math.min(3, Math.max(1, Math.floor(n * 0.4)));
          const majorCount = Math.max(1, n - railCount);

          let majorNode: BspNode;
          if (majorCount === 1 || !canSplitHorizontal(majorRect, g, ctx.minDims.minH)) {
            majorNode = makeLeaf(ctx, ctx.allowHero ? 'hero' : 'standard');
          } else {
            const topHeroRatio = pickHarmonicRatio(
              majorRect.height,
              g,
              ctx.minDims.minH,
              [0.6, 2 / 3],
              ctx.rng
            );
            const [, bottomRect] = splitRectExact(majorRect, 'horizontal', topHeroRatio, g);
            majorNode = {
              kind: 'split',
              nodeId: ctx.nextNodeId(),
              axis: 'horizontal',
              ratio: topHeroRatio,
              first: makeLeaf(ctx, ctx.allowHero ? 'hero' : 'standard'),
              second: buildEqualStrip(bottomRect, majorCount - 1, 'vertical', ctx),
            };
          }

          const railNode = buildEqualStrip(railRect, railCount, 'horizontal', ctx);
          return {
            kind: 'split',
            nodeId: ctx.nextNodeId(),
            axis: 'vertical',
            ratio,
            first: leftOnFirst ? majorNode : railNode,
            second: leftOnFirst ? railNode : majorNode,
          };
        }
      }

      // Portrait / square fallback: 3:2 lead visual top + asymmetric footer
      return buildSplitWithHero(ctx.rect, 'horizontal', true, [0.6, 0.5], n - 1, ctx);
    }

    case 'kpi-dashboard': {
      // Wide banner: KPI column on left (1/3), wide Trend Hero + insight on right (2/3)
      if (regime === 'wide' && canSplitVertical(ctx.rect, g, ctx.minDims.minW)) {
        const kpiCount = Math.min(3, Math.max(2, Math.floor(n * 0.5)));
        const rightCount = Math.max(1, n - kpiCount);
        const ratio = pickHarmonicRatio(ctx.rect.width, g, ctx.minDims.minW, [1 / 3, 0.4], ctx.rng);
        const [leftRect, rightRect] = splitRectExact(ctx.rect, 'vertical', ratio, g);
        return {
          kind: 'split',
          nodeId: ctx.nextNodeId(),
          axis: 'vertical',
          ratio,
          first: buildEqualStrip(leftRect, kpiCount, 'horizontal', ctx),
          second:
            rightCount === 1
              ? makeLeaf(ctx, ctx.allowHero ? 'hero' : 'standard')
              : buildSplitWithHero(rightRect, 'vertical', true, [2 / 3, 0.6], rightCount - 1, ctx) ??
                makeLeaf(ctx, ctx.allowHero ? 'hero' : 'standard'),
        };
      }

      // Landscape / square / portrait: Paragon-style Twin Micro-KPIs (25% of seeds on 4..5 cards)
      // or Classic Top KPI Strip + Bottom Hero Analytics
      if (
        regime === 'landscape' &&
        (n === 4 || n === 5) &&
        canSplitVertical(ctx.rect, g, ctx.minDims.minW) &&
        canSplitHorizontal(ctx.rect, g, ctx.minDims.minH) &&
        ctx.rng() < 0.3
      ) {
        const rootRatio = pickHarmonicRatio(ctx.rect.width, g, ctx.minDims.minW, [0.5, 0.55], ctx.rng);
        const [, rightHalf] = splitRectExact(ctx.rect, 'vertical', rootRatio, g);
        const topStatsRatio = pickHarmonicRatio(
          rightHalf.height,
          g,
          ctx.minDims.minH,
          [0.4, 0.45],
          ctx.rng
        );
        const [topRight, bottomRight] = splitRectExact(rightHalf, 'horizontal', topStatsRatio, g);
        const bottomRightCount = n - 3;
        return {
          kind: 'split',
          nodeId: ctx.nextNodeId(),
          axis: 'vertical',
          ratio: rootRatio,
          first: makeLeaf(ctx, ctx.allowHero ? 'hero' : 'standard'),
          second: {
            kind: 'split',
            nodeId: ctx.nextNodeId(),
            axis: 'horizontal',
            ratio: topStatsRatio,
            first: buildEqualStrip(topRight, 2, 'vertical', ctx),
            second:
              bottomRightCount <= 1
                ? makeLeaf(ctx, 'standard')
                : buildEqualStrip(bottomRight, bottomRightCount, 'vertical', ctx),
          },
        };
      }

      if (canSplitHorizontal(ctx.rect, g, ctx.minDims.minH)) {
        const kpiOnTop = ctx.rng() < 0.8;
        const maxKpiCols = Math.max(
          2,
          Math.min(4, Math.floor((ctx.rect.width + g) / (ctx.minDims.minW + g)))
        );
        const kpiCount = Math.min(maxKpiCols, Math.max(2, Math.floor(n * 0.58)));
        const analyticsCount = Math.max(1, n - kpiCount);

        const kpiRatios = regime === 'portrait' ? [0.4, 0.5] : [1 / 3, 0.4];
        const kpiShare = pickHarmonicRatio(ctx.rect.height, g, ctx.minDims.minH, kpiRatios, ctx.rng);
        const ratio = kpiOnTop
          ? kpiShare
          : clampSplitRatioForRounding(ctx.rect.height, g, ctx.minDims.minH, 1 - kpiShare);
        const [r1, r2] = splitRectExact(ctx.rect, 'horizontal', ratio, g);
        const kpiRect = kpiOnTop ? r1 : r2;
        const analyticsRect = kpiOnTop ? r2 : r1;

        const kpiNode =
          regime === 'portrait' && kpiCount >= 4
            ? buildHarmonicBalancedSubtree(kpiRect, kpiCount, ctx, false)
            : buildEqualStrip(kpiRect, kpiCount, 'vertical', ctx);

        const analyticsNode =
          analyticsCount === 1
            ? makeLeaf(ctx, ctx.allowHero ? 'hero' : 'standard')
            : buildSplitWithHero(
                analyticsRect,
                'vertical',
                ctx.rng() < 0.75,
                [2 / 3, 0.6, 0.5],
                analyticsCount - 1,
                ctx
              ) ?? buildHarmonicBalancedSubtree(analyticsRect, analyticsCount, ctx, true);

        return {
          kind: 'split',
          nodeId: ctx.nextNodeId(),
          axis: 'horizontal',
          ratio,
          first: kpiOnTop ? kpiNode : analyticsNode,
          second: kpiOnTop ? analyticsNode : kpiNode,
        };
      }

      return null;
    }

    case 'product-showcase': {
      // Apple-style 3-column Centerpiece Hub (1/4 left | 1/2 Hero Center | 1/4 right) on widescreen when n >= 5
      const minHubWidth = 4 * ctx.minDims.minW + 2 * g;
      const preferCenterpiece =
        (regime === 'landscape' || regime === 'wide') &&
        n >= 5 &&
        ctx.rect.width >= minHubWidth &&
        ctx.rng() < 0.7;

      if (preferCenterpiece) {
        const unitW = (ctx.rect.width - 2 * g) / 4;
        const availRoot = round2(ctx.rect.width - g);
        const rootRatio = clampSplitRatioForRounding(
          ctx.rect.width,
          g,
          ctx.minDims.minW,
          unitW / Math.max(1, availRoot)
        );
        const [leftCol, restRect] = splitRectExact(ctx.rect, 'vertical', rootRatio, g);

        if (canSplitVertical(restRect, g, ctx.minDims.minW)) {
          const innerRatio = clampSplitRatioForRounding(
            restRect.width,
            g,
            ctx.minDims.minW,
            2 / 3
          );
          const [, rightCol] = splitRectExact(restRect, 'vertical', innerRatio, g);

          const remaining = n - 1;
          const leftCount = Math.ceil(remaining / 2);
          const rightCount = remaining - leftCount;

          return {
            kind: 'split',
            nodeId: ctx.nextNodeId(),
            axis: 'vertical',
            ratio: rootRatio,
            first: buildEqualStrip(leftCol, leftCount, 'horizontal', ctx),
            second: {
              kind: 'split',
              nodeId: ctx.nextNodeId(),
              axis: 'vertical',
              ratio: innerRatio,
              first: makeLeaf(ctx, ctx.allowHero ? 'hero' : 'standard'),
              second: buildEqualStrip(rightCol, rightCount, 'horizontal', ctx),
            },
          };
        }
      }

      // Spotlight Top (or Hero Left on wide banners)
      const spotAxis: SplitAxis = regime === 'wide' ? 'vertical' : 'horizontal';
      const fallbackAxis: SplitAxis = spotAxis === 'horizontal' ? 'vertical' : 'horizontal';
      return (
        buildSplitWithHero(
          ctx.rect,
          spotAxis,
          true,
          [0.5, 0.6],
          n - 1,
          ctx,
          (sub, cnt) =>
            cnt <= 4 && spotAxis === 'horizontal'
              ? buildEqualStrip(sub, cnt, 'vertical', ctx)
              : buildHarmonicBalancedSubtree(sub, cnt, ctx, false)
        ) ?? buildSplitWithHero(ctx.rect, fallbackAxis, true, [0.5, 0.6], n - 1, ctx)
      );
    }

    case 'comparison': {
      // Visually fair 50/50 Twin Pillars
      const splitAxis: SplitAxis | null =
        regime === 'portrait' && canSplitHorizontal(ctx.rect, g, ctx.minDims.minH)
          ? 'horizontal'
          : canSplitVertical(ctx.rect, g, ctx.minDims.minW)
            ? 'vertical'
            : canSplitHorizontal(ctx.rect, g, ctx.minDims.minH)
              ? 'horizontal'
              : null;

      if (!splitAxis) {
        return makeLeaf(ctx, 'standard');
      }

      const axisLen = splitAxis === 'vertical' ? ctx.rect.width : ctx.rect.height;
      const minSide = splitAxis === 'vertical' ? ctx.minDims.minW : ctx.minDims.minH;
      const ratio = clampSplitRatioForRounding(axisLen, g, minSide, 0.5);
      const [sideA, sideB] = splitRectExact(ctx.rect, splitAxis, ratio, g);

      const countA = Math.ceil(n / 2);
      const countB = n - countA;
      const innerCtx = { ...ctx, allowHero: false };

      return {
        kind: 'split',
        nodeId: ctx.nextNodeId(),
        axis: splitAxis,
        ratio,
        first: buildHarmonicBalancedSubtree(sideA, countA, innerCtx, false),
        second: buildHarmonicBalancedSubtree(sideB, countB, innerCtx, false),
      };
    }

    case 'matrix-grid': {
      // Exact 3-row staggered diagonal hairline matrix (from user screenshot!):
      // Row 0: [1/4 | 1/4 | 1/2], Row 1: [1/4 | 1/2 HERO | 1/4], Row 2: [1/2 | 1/4 | 1/4]
      const maxRows = Math.max(1, Math.floor((ctx.rect.height + g) / (ctx.minDims.minH + g)));
      const mirrorDiagonal = ctx.rng() < 0.25;

      if (n >= 7 && maxRows >= 3 && canSplitHorizontal(ctx.rect, g, ctx.minDims.minH)) {
        const rowH = (ctx.rect.height - 2 * g) / 3;
        const availH = round2(ctx.rect.height - g);
        const topSplitRatio = clampSplitRatioForRounding(
          ctx.rect.height,
          g,
          ctx.minDims.minH,
          rowH / Math.max(1, availH)
        );
        const [row0Rect, lowerTwoRows] = splitRectExact(ctx.rect, 'horizontal', topSplitRatio, g);

        if (canSplitHorizontal(lowerTwoRows, g, ctx.minDims.minH)) {
          const midSplitRatio = clampSplitRatioForRounding(
            lowerTwoRows.height,
            g,
            ctx.minDims.minH,
            0.5
          );
          const [row1Rect, row2Rect] = splitRectExact(lowerTwoRows, 'horizontal', midSplitRatio, g);

          const c0 = n >= 8 ? 3 : 2;
          const c1 = 3;
          const c2 = Math.max(1, n - c0 - c1);

          const buildMatrixRow = (
            rRect: RectPt,
            cells: number,
            widePos: 'left' | 'center' | 'right',
            isHeroRow: boolean
          ): BspNode => {
            if (cells === 3) {
              return buildStaggered4TrackRow(rRect, widePos, isHeroRow, ctx);
            }
            if (cells === 2 && canSplitVertical(rRect, g, ctx.minDims.minW)) {
              const r =
                widePos === 'left'
                  ? clampSplitRatioForRounding(rRect.width, g, ctx.minDims.minW, 2 / 3)
                  : clampSplitRatioForRounding(rRect.width, g, ctx.minDims.minW, 1 / 3);
              return {
                kind: 'split',
                nodeId: ctx.nextNodeId(),
                axis: 'vertical',
                ratio: r,
                first: makeLeaf(ctx, isHeroRow && widePos === 'left' && ctx.allowHero ? 'hero' : 'standard'),
                second: makeLeaf(ctx, isHeroRow && widePos !== 'left' && ctx.allowHero ? 'hero' : 'standard'),
              };
            }
            return buildEqualStrip(rRect, cells, 'vertical', ctx);
          };

          const topPos: 'left' | 'right' = mirrorDiagonal ? 'left' : 'right';
          const bottomPos: 'left' | 'right' = mirrorDiagonal ? 'right' : 'left';

          return {
            kind: 'split',
            nodeId: ctx.nextNodeId(),
            axis: 'horizontal',
            ratio: topSplitRatio,
            first: buildMatrixRow(row0Rect, c0, topPos, false),
            second: {
              kind: 'split',
              nodeId: ctx.nextNodeId(),
              axis: 'horizontal',
              ratio: midSplitRatio,
              first: buildMatrixRow(row1Rect, c1, 'center', true),
              second: buildMatrixRow(row2Rect, c2, bottomPos, false),
            },
          };
        }
      }

      // 2-row staggered matrix for count 4..6 (or shorter containers)
      if (n >= 4 && maxRows >= 2 && canSplitHorizontal(ctx.rect, g, ctx.minDims.minH)) {
        const splitR = clampSplitRatioForRounding(ctx.rect.height, g, ctx.minDims.minH, 0.5);
        const [topRow, botRow] = splitRectExact(ctx.rect, 'horizontal', splitR, g);
        const topC = Math.ceil(n / 2);
        const botC = n - topC;

        const topNode =
          topC === 3
            ? buildStaggered4TrackRow(topRow, mirrorDiagonal ? 'left' : 'right', false, ctx)
            : canSplitVertical(topRow, g, ctx.minDims.minW)
              ? {
                  kind: 'split' as const,
                  nodeId: ctx.nextNodeId(),
                  axis: 'vertical' as const,
                  ratio: clampSplitRatioForRounding(
                    topRow.width,
                    g,
                    ctx.minDims.minW,
                    mirrorDiagonal ? 2 / 3 : 1 / 3
                  ),
                  first: makeLeaf(ctx, 'standard'),
                  second: makeLeaf(ctx, 'standard'),
                }
              : makeLeaf(ctx, 'standard');

        const botNode =
          botC === 3
            ? buildStaggered4TrackRow(botRow, mirrorDiagonal ? 'right' : 'left', true, ctx)
            : canSplitVertical(botRow, g, ctx.minDims.minW)
              ? {
                  kind: 'split' as const,
                  nodeId: ctx.nextNodeId(),
                  axis: 'vertical' as const,
                  ratio: clampSplitRatioForRounding(
                    botRow.width,
                    g,
                    ctx.minDims.minW,
                    mirrorDiagonal ? 1 / 3 : 2 / 3
                  ),
                  first: makeLeaf(ctx, !mirrorDiagonal && ctx.allowHero ? 'hero' : 'standard'),
                  second: makeLeaf(ctx, mirrorDiagonal && ctx.allowHero ? 'hero' : 'standard'),
                }
              : makeLeaf(ctx, ctx.allowHero ? 'hero' : 'standard');

        return {
          kind: 'split',
          nodeId: ctx.nextNodeId(),
          axis: 'horizontal',
          ratio: splitR,
          first: topNode,
          second: botNode,
        };
      }

      return buildEqualStrip(ctx.rect, n, regime === 'portrait' ? 'horizontal' : 'vertical', ctx);
    }

    case 'brand-collage': {
      // Staggered 3-Column Masonry (ChromaDB / PRISM / technexus / Sync)
      const maxCols = Math.max(1, Math.floor((ctx.rect.width + g) / (ctx.minDims.minW + g)));
      if (maxCols >= 3 && n >= 4 && canSplitVertical(ctx.rect, g, ctx.minDims.minW)) {
        const colW = (ctx.rect.width - 2 * g) / 3;
        const availW = round2(ctx.rect.width - g);
        const firstSplitRatio = clampSplitRatioForRounding(
          ctx.rect.width,
          g,
          ctx.minDims.minW,
          colW / Math.max(1, availW)
        );
        const [col0Rect, restColsRect] = splitRectExact(ctx.rect, 'vertical', firstSplitRatio, g);

        if (canSplitVertical(restColsRect, g, ctx.minDims.minW)) {
          const secondSplitRatio = clampSplitRatioForRounding(
            restColsRect.width,
            g,
            ctx.minDims.minW,
            0.5
          );
          const [col1Rect, col2Rect] = splitRectExact(
            restColsRect,
            'vertical',
            secondSplitRatio,
            g
          );

          // Distribute across 3 columns cleanly (e.g., 7 -> [2, 3, 2], 5 -> [2, 1, 2], 6 -> [2, 2, 2])
          let c0: number;
          let c1: number;
          let c2: number;
          if (n === 5) {
            c0 = 2;
            c1 = 1;
            c2 = 2;
          } else {
            const base = Math.floor(n / 3);
            const rem = n % 3;
            c1 = base + (rem >= 1 ? 1 : 0);
            c0 = base + (rem >= 2 ? 1 : 0);
            c2 = base;
          }

          // Center column gets the Hero breather tile (middle tile when c1 === 3, top when c1 <= 2)
          const centerHeroIdx = c1 >= 3 ? 1 : 0;

          return {
            kind: 'split',
            nodeId: ctx.nextNodeId(),
            axis: 'vertical',
            ratio: firstSplitRatio,
            first: buildStaggeredColumn(col0Rect, c0, [0.6, 2 / 3], -1, ctx),
            second: {
              kind: 'split',
              nodeId: ctx.nextNodeId(),
              axis: 'vertical',
              ratio: secondSplitRatio,
              first: buildStaggeredColumn(col1Rect, c1, [0.4, 1 / 3], centerHeroIdx, ctx),
              second: buildStaggeredColumn(col2Rect, c2, [0.4, 0.35], -1, ctx),
            },
          };
        }
      }

      return buildHarmonicBalancedSubtree(ctx.rect, n, ctx, true);
    }

    case 'creative': {
      // 4 art-directed studio grammars cycled deterministically by seed:
      // 0 = Golden Spiral Cascade, 1 = L-Frame Gallery Mat, 2 = Panoramic Ribbon + Folio, 3 = Offset Pinwheel
      const GOLDEN = 0.618;
      const variant = Math.floor(ctx.rng() * 4);

      const buildGoldenSpiral = (
        rect: RectPt,
        remaining: number,
        axis: SplitAxis,
        step: number,
        clockwise: boolean
      ): BspNode => {
        if (remaining <= 1) {
          return makeLeaf(ctx, step === 0 && ctx.allowHero ? 'hero' : 'standard');
        }
        const canCurr =
          axis === 'vertical'
            ? canSplitVertical(rect, g, ctx.minDims.minW)
            : canSplitHorizontal(rect, g, ctx.minDims.minH);
        const altAxis: SplitAxis = axis === 'vertical' ? 'horizontal' : 'vertical';
        const canAlt =
          altAxis === 'vertical'
            ? canSplitVertical(rect, g, ctx.minDims.minW)
            : canSplitHorizontal(rect, g, ctx.minDims.minH);

        const chosenAxis = canCurr ? axis : canAlt ? altAxis : null;
        if (!chosenAxis) {
          return makeLeaf(ctx, step === 0 && ctx.allowHero ? 'hero' : 'standard');
        }

        const axisLen = chosenAxis === 'vertical' ? rect.width : rect.height;
        const minSide = chosenAxis === 'vertical' ? ctx.minDims.minW : ctx.minDims.minH;
        // Alternate peel side every 2 steps to spiral cleanly inward
        const peelFirst = clockwise ? step % 4 < 2 : step % 4 >= 2;
        const targetMajor = step === 0 ? Math.min(0.68, Math.max(0.55, 0.56 + ctx.heroBias * 0.12)) : GOLDEN;
        const desiredRatio = peelFirst ? targetMajor : 1 - targetMajor;
        const ratio = clampSplitRatioForRounding(axisLen, g, minSide, desiredRatio);
        const [r1, r2] = splitRectExact(rect, chosenAxis, ratio, g);
        const nextAxis: SplitAxis = chosenAxis === 'vertical' ? 'horizontal' : 'vertical';

        const peeledLeaf = makeLeaf(ctx, step === 0 && ctx.allowHero ? 'hero' : 'standard');
        if (peelFirst) {
          return {
            kind: 'split',
            nodeId: ctx.nextNodeId(),
            axis: chosenAxis,
            ratio,
            first: peeledLeaf,
            second: buildGoldenSpiral(r2, remaining - 1, nextAxis, step + 1, clockwise),
          };
        }
        return {
          kind: 'split',
          nodeId: ctx.nextNodeId(),
          axis: chosenAxis,
          ratio,
          first: buildGoldenSpiral(r1, remaining - 1, nextAxis, step + 1, clockwise),
          second: peeledLeaf,
        };
      };

      if (variant === 0) {
        const startAxis: SplitAxis = regime === 'portrait' ? 'horizontal' : 'vertical';
        return buildGoldenSpiral(ctx.rect, n, startAxis, 0, ctx.rng() < 0.5);
      }

      if (variant === 1 && n >= 4 && canSplitVertical(ctx.rect, g, ctx.minDims.minW)) {
        // L-Frame Gallery Mat: narrow editorial spine on one edge + generous gallery hero + bottom caption bar
        const spineOnLeft = ctx.rng() < 0.65;
        const spineShare = 0.24 + ctx.rng() * 0.06;
        const ratio = clampSplitRatioForRounding(
          ctx.rect.width,
          g,
          ctx.minDims.minW,
          spineOnLeft ? spineShare : 1 - spineShare
        );
        const [leftR, rightR] = splitRectExact(ctx.rect, 'vertical', ratio, g);
        const spineRect = spineOnLeft ? leftR : rightR;
        const stageRect = spineOnLeft ? rightR : leftR;

        const spineCount = n >= 6 ? 2 : 1;
        const stageTotal = n - spineCount;

        const spineNode = buildStaggeredColumn(spineRect, spineCount, [0.62, 0.38], -1, ctx);
        let stageNode: BspNode;
        if (stageTotal >= 2 && canSplitHorizontal(stageRect, g, ctx.minDims.minH)) {
          const heroOnTop = ctx.rng() < 0.72;
          const heroH = Math.min(0.74, Math.max(0.58, 0.6 + ctx.heroBias * 0.14));
          const stageRatio = clampSplitRatioForRounding(
            stageRect.height,
            g,
            ctx.minDims.minH,
            heroOnTop ? heroH : 1 - heroH
          );
          const [topR, botR] = splitRectExact(stageRect, 'horizontal', stageRatio, g);
          const heroLeaf = makeLeaf(ctx, ctx.allowHero ? 'hero' : 'standard');
          const stripRect = heroOnTop ? botR : topR;
          const stripNode = buildEqualStrip(stripRect, stageTotal - 1, 'vertical', ctx);
          stageNode = {
            kind: 'split',
            nodeId: ctx.nextNodeId(),
            axis: 'horizontal',
            ratio: stageRatio,
            first: heroOnTop ? heroLeaf : stripNode,
            second: heroOnTop ? stripNode : heroLeaf,
          };
        } else {
          stageNode = buildHarmonicBalancedSubtree(stageRect, stageTotal, ctx, true);
        }

        return {
          kind: 'split',
          nodeId: ctx.nextNodeId(),
          axis: 'vertical',
          ratio,
          first: spineOnLeft ? spineNode : stageNode,
          second: spineOnLeft ? stageNode : spineNode,
        };
      }

      if (variant === 2 && n >= 4 && canSplitHorizontal(ctx.rect, g, ctx.minDims.minH)) {
        // Panoramic Ribbon + Asymmetric Golden Folio
        const ribbonOnTop = ctx.rng() < 0.65;
        const ribbonShare = 0.22 + ctx.rng() * 0.05;
        const hRatio = clampSplitRatioForRounding(
          ctx.rect.height,
          g,
          ctx.minDims.minH,
          ribbonOnTop ? ribbonShare : 1 - ribbonShare
        );
        const [topR, botR] = splitRectExact(ctx.rect, 'horizontal', hRatio, g);
        const ribbonRect = ribbonOnTop ? topR : botR;
        const bodyRect = ribbonOnTop ? botR : topR;

        const ribbonCount = n >= 6 ? 2 : 1;
        const bodyCount = n - ribbonCount;
        const ribbonNode =
          ribbonCount === 2 && canSplitVertical(ribbonRect, g, ctx.minDims.minW)
            ? (() => {
                const rr = clampSplitRatioForRounding(
                  ribbonRect.width,
                  g,
                  ctx.minDims.minW,
                  ctx.rng() < 0.5 ? 0.68 : 0.32
                );
                return {
                  kind: 'split' as const,
                  nodeId: ctx.nextNodeId(),
                  axis: 'vertical' as const,
                  ratio: rr,
                  first: makeLeaf(ctx, 'standard'),
                  second: makeLeaf(ctx, 'standard'),
                };
              })()
            : makeLeaf(ctx, 'standard');

        let bodyNode: BspNode;
        if (bodyCount >= 2 && canSplitVertical(bodyRect, g, ctx.minDims.minW)) {
          const heroLeft = ctx.rng() < 0.6;
          const vRatio = clampSplitRatioForRounding(
            bodyRect.width,
            g,
            ctx.minDims.minW,
            heroLeft ? GOLDEN : 1 - GOLDEN
          );
          const [bLeft, bRight] = splitRectExact(bodyRect, 'vertical', vRatio, g);
          const heroLeaf = makeLeaf(ctx, ctx.allowHero ? 'hero' : 'standard');
          const notesRect = heroLeft ? bRight : bLeft;
          const notesNode = buildStaggeredColumn(notesRect, bodyCount - 1, [0.58, 0.42], -1, ctx);
          bodyNode = {
            kind: 'split',
            nodeId: ctx.nextNodeId(),
            axis: 'vertical',
            ratio: vRatio,
            first: heroLeft ? heroLeaf : notesNode,
            second: heroLeft ? notesNode : heroLeaf,
          };
        } else {
          bodyNode = buildHarmonicBalancedSubtree(bodyRect, bodyCount, ctx, true);
        }

        return {
          kind: 'split',
          nodeId: ctx.nextNodeId(),
          axis: 'horizontal',
          ratio: hRatio,
          first: ribbonOnTop ? ribbonNode : bodyNode,
          second: ribbonOnTop ? bodyNode : ribbonNode,
        };
      }

      // Variant 3 (and fallback): Offset Pinwheel Mosaic with opposing golden column splits
      if (n >= 4 && canSplitVertical(ctx.rect, g, ctx.minDims.minW)) {
        const leftMajor = ctx.rng() < 0.5;
        const vRatio = clampSplitRatioForRounding(
          ctx.rect.width,
          g,
          ctx.minDims.minW,
          leftMajor ? 0.58 : 0.42
        );
        const [leftR, rightR] = splitRectExact(ctx.rect, 'vertical', vRatio, g);
        const leftCount = Math.max(2, Math.floor(n / 2));
        const rightCount = n - leftCount;
        const heroOnLeft = leftMajor;

        return {
          kind: 'split',
          nodeId: ctx.nextNodeId(),
          axis: 'vertical',
          ratio: vRatio,
          first: buildStaggeredColumn(leftR, leftCount, [0.64, 0.6], heroOnLeft ? 0 : -1, ctx),
          second: buildStaggeredColumn(
            rightR,
            rightCount,
            [0.36, 0.4],
            !heroOnLeft ? Math.max(0, rightCount - 1) : -1,
            ctx
          ),
        };
      }

      return buildGoldenSpiral(ctx.rect, n, regime === 'portrait' ? 'horizontal' : 'vertical', 0, true);
    }

    case 'experimental': {
      // 4 avant-garde grammars cycled deterministically by seed:
      // 0 = Monument + Micro-Cluster, 1 = Brutalist Spine & Jagged Stages,
      // 2 = Fractured De Stijl (T-junctions), 3 = Fractal Corner Burst
      const TENSION_RATIOS = [0.22, 0.29, 0.382, 0.618, 0.71, 0.78] as const;
      const variant = Math.floor(ctx.rng() * 4);

      const buildKineticFracture = (
        rect: RectPt,
        remaining: number,
        lastAxis: SplitAxis | null,
        lastRatio: number,
        allowHeroInside: boolean
      ): BspNode => {
        if (remaining <= 1) {
          return makeLeaf(ctx, allowHeroInside && ctx.allowHero ? 'hero' : 'standard');
        }
        const canV = canSplitVertical(rect, g, ctx.minDims.minW);
        const canH = canSplitHorizontal(rect, g, ctx.minDims.minH);
        if (!canV && !canH) {
          return makeLeaf(ctx, allowHeroInside && ctx.allowHero ? 'hero' : 'standard');
        }

        // Strongly alternate axis to maximize staggered T-junctions instead of grid crosshairs
        let axis: SplitAxis;
        if (canV && !canH) {
          axis = 'vertical';
        } else if (!canV && canH) {
          axis = 'horizontal';
        } else if (lastAxis === 'vertical') {
          axis = ctx.rng() < 0.78 ? 'horizontal' : 'vertical';
        } else if (lastAxis === 'horizontal') {
          axis = ctx.rng() < 0.78 ? 'vertical' : 'horizontal';
        } else {
          axis = rect.width >= rect.height ? 'vertical' : 'horizontal';
        }

        const axisLen = axis === 'vertical' ? rect.width : rect.height;
        const minSide = axis === 'vertical' ? ctx.minDims.minW : ctx.minDims.minH;

        // Pick a tension ratio deliberately offset from `lastRatio`
        const offsetCandidates = TENSION_RATIOS.filter((r) => Math.abs(r - lastRatio) >= 0.14);
        const pool = offsetCandidates.length > 0 ? offsetCandidates : TENSION_RATIOS;
        const desired = pool[Math.floor(ctx.rng() * pool.length)]!;
        const ratio = clampSplitRatioForRounding(axisLen, g, minSide, desired);
        const [r1, r2] = splitRectExact(rect, axis, ratio, g);

        // Bias leaf counts asymmetrically so one side stays monumental and the other clusters
        const majorOnFirst = ratio >= 0.5;
        let c1: number;
        let c2: number;
        if (remaining === 2) {
          c1 = 1;
          c2 = 1;
        } else if (allowHeroInside) {
          // Reserve the larger half as a single monumental hero leaf
          c1 = majorOnFirst ? 1 : remaining - 1;
          c2 = remaining - c1;
        } else {
          const smallCount = Math.max(1, Math.min(remaining - 1, Math.floor(remaining * (ctx.rng() < 0.5 ? 0.35 : 0.65))));
          c1 = smallCount;
          c2 = remaining - c1;
        }

        return {
          kind: 'split',
          nodeId: ctx.nextNodeId(),
          axis,
          ratio,
          first: buildKineticFracture(r1, c1, axis, ratio, allowHeroInside && c1 === 1 && majorOnFirst),
          second: buildKineticFracture(r2, c2, axis, ratio, allowHeroInside && c2 === 1 && !majorOnFirst),
        };
      };

      if (variant === 0) {
        // Monument + Micro-Cluster: one massive stage colliding with a dense swarm of compact tiles
        const axis: SplitAxis =
          regime === 'portrait'
            ? canSplitHorizontal(ctx.rect, g, ctx.minDims.minH)
              ? 'horizontal'
              : 'vertical'
            : canSplitVertical(ctx.rect, g, ctx.minDims.minW)
              ? 'vertical'
              : 'horizontal';
        const canSplit =
          axis === 'vertical'
            ? canSplitVertical(ctx.rect, g, ctx.minDims.minW)
            : canSplitHorizontal(ctx.rect, g, ctx.minDims.minH);

        if (canSplit && n >= 3) {
          const axisLen = axis === 'vertical' ? ctx.rect.width : ctx.rect.height;
          const minSide = axis === 'vertical' ? ctx.minDims.minW : ctx.minDims.minH;
          const monumentFirst = ctx.rng() < 0.6;
          const monumentShare = Math.min(0.68, Math.max(0.56, 0.56 + ctx.heroBias * 0.12));
          const ratio = clampSplitRatioForRounding(
            axisLen,
            g,
            minSide,
            monumentFirst ? monumentShare : 1 - monumentShare
          );
          const [r1, r2] = splitRectExact(ctx.rect, axis, ratio, g);
          const monumentLeaf = makeLeaf(ctx, ctx.allowHero ? 'hero' : 'standard');
          const clusterRect = monumentFirst ? r2 : r1;
          const clusterNode = buildKineticFracture(clusterRect, n - 1, axis, ratio, false);

          return {
            kind: 'split',
            nodeId: ctx.nextNodeId(),
            axis,
            ratio,
            first: monumentFirst ? monumentLeaf : clusterNode,
            second: monumentFirst ? clusterNode : monumentLeaf,
          };
        }
      }

      if (variant === 1 && n >= 4 && canSplitVertical(ctx.rect, g, ctx.minDims.minW)) {
        // Brutalist Spine & Jagged Stages: razor-thin poster index strip + fractured asymmetric main body
        const spineLeft = ctx.rng() < 0.55;
        const spineShare = 0.18 + ctx.rng() * 0.05;
        const ratio = clampSplitRatioForRounding(
          ctx.rect.width,
          g,
          ctx.minDims.minW,
          spineLeft ? spineShare : 1 - spineShare
        );
        const [r1, r2] = splitRectExact(ctx.rect, 'vertical', ratio, g);
        const spineRect = spineLeft ? r1 : r2;
        const bodyRect = spineLeft ? r2 : r1;
        const spineCount = n >= 7 && canSplitHorizontal(spineRect, g, ctx.minDims.minH) ? 2 : 1;
        const spineNode =
          spineCount === 2
            ? {
                kind: 'split' as const,
                nodeId: ctx.nextNodeId(),
                axis: 'horizontal' as const,
                ratio: clampSplitRatioForRounding(spineRect.height, g, ctx.minDims.minH, 0.72),
                first: makeLeaf(ctx, 'standard'),
                second: makeLeaf(ctx, 'standard'),
              }
            : makeLeaf(ctx, 'standard');
        const bodyNode = buildKineticFracture(bodyRect, n - spineCount, 'vertical', ratio, true);

        return {
          kind: 'split',
          nodeId: ctx.nextNodeId(),
          axis: 'vertical',
          ratio,
          first: spineLeft ? spineNode : bodyNode,
          second: spineLeft ? bodyNode : spineNode,
        };
      }

      if (variant === 3 && n >= 4 && canSplitVertical(ctx.rect, g, ctx.minDims.minW)) {
        // Fractal Corner Burst: quiet monumental field + one corner recursively bursting into micro-tiles
        const burstOnRight = ctx.rng() < 0.6;
        const burstOnBottom = ctx.rng() < 0.55;
        const vRatio = clampSplitRatioForRounding(
          ctx.rect.width,
          g,
          ctx.minDims.minW,
          burstOnRight ? 0.62 : 0.38
        );
        const [leftR, rightR] = splitRectExact(ctx.rect, 'vertical', vRatio, g);
        const quietRect = burstOnRight ? leftR : rightR;
        const activeRect = burstOnRight ? rightR : leftR;

        // Quiet side holds 1 monumental hero (or 2 if n >= 8)
        const quietCount = n >= 8 && canSplitHorizontal(quietRect, g, ctx.minDims.minH) ? 2 : 1;
        const quietNode =
          quietCount === 2
            ? {
                kind: 'split' as const,
                nodeId: ctx.nextNodeId(),
                axis: 'horizontal' as const,
                ratio: clampSplitRatioForRounding(
                  quietRect.height,
                  g,
                  ctx.minDims.minH,
                  burstOnBottom ? 0.76 : 0.24
                ),
                first: makeLeaf(ctx, burstOnBottom && ctx.allowHero ? 'hero' : 'standard'),
                second: makeLeaf(ctx, !burstOnBottom && ctx.allowHero ? 'hero' : 'standard'),
              }
            : makeLeaf(ctx, ctx.allowHero ? 'hero' : 'standard');

        const activeCount = n - quietCount;
        let activeNode: BspNode;
        if (activeCount >= 3 && canSplitHorizontal(activeRect, g, ctx.minDims.minH)) {
          const hRatio = clampSplitRatioForRounding(
            activeRect.height,
            g,
            ctx.minDims.minH,
            burstOnBottom ? 0.42 : 0.58
          );
          const [topR, botR] = splitRectExact(activeRect, 'horizontal', hRatio, g);
          const anchorTile = makeLeaf(ctx, 'standard');
          const cornerRect = burstOnBottom ? botR : topR;
          const burstNode = buildKineticFracture(cornerRect, activeCount - 1, 'horizontal', hRatio, false);
          activeNode = {
            kind: 'split',
            nodeId: ctx.nextNodeId(),
            axis: 'horizontal',
            ratio: hRatio,
            first: burstOnBottom ? anchorTile : burstNode,
            second: burstOnBottom ? burstNode : anchorTile,
          };
        } else {
          activeNode = buildKineticFracture(activeRect, activeCount, 'vertical', vRatio, false);
        }

        return {
          kind: 'split',
          nodeId: ctx.nextNodeId(),
          axis: 'vertical',
          ratio: vRatio,
          first: burstOnRight ? quietNode : activeNode,
          second: burstOnRight ? activeNode : quietNode,
        };
      }

      // Variant 2 (Fractured De Stijl) & general fallback
      return buildKineticFracture(ctx.rect, n, null, 0.5, true);
    }

    case 'sculpted': {
      // Organic Bento mixing circles, stadium pills, arches, diagonal leaves, and chamfered anchors
      const baseTree = buildHarmonicBalancedSubtree(ctx.rect, n, ctx, true);
      const resolved = sortReadingOrder(resolveTreeLayout(baseTree, ctx.rect, g));
      const shapeByNodeId = new Map<string, CellShapeKind>();
      const paletteMode = Math.floor(ctx.rng() * 3); // 0 = Circle+Pill, 1 = Arch+Leaf, 2 = Chamfer+Circle

      resolved.forEach(({ leaf, rect }, idx) => {
        const ar = rect.width / Math.max(1, rect.height);
        if (paletteMode === 0) {
          if (ar >= 0.72 && ar <= 1.42) {
            shapeByNodeId.set(leaf.nodeId, 'circle');
          } else if (ar >= 2.1 || ar <= 0.52) {
            shapeByNodeId.set(leaf.nodeId, 'pill');
          } else if (leaf.role === 'hero') {
            shapeByNodeId.set(leaf.nodeId, 'arch');
          } else {
            shapeByNodeId.set(leaf.nodeId, idx % 2 === 0 ? 'pill' : 'rect');
          }
        } else if (paletteMode === 1) {
          if (leaf.role === 'hero') {
            shapeByNodeId.set(leaf.nodeId, 'leaf');
          } else if (ar >= 0.75 && ar <= 1.35) {
            shapeByNodeId.set(leaf.nodeId, idx % 2 === 0 ? 'circle' : 'arch');
          } else {
            shapeByNodeId.set(leaf.nodeId, idx % 2 === 0 ? 'leaf' : 'pill');
          }
        } else {
          if (leaf.role === 'hero') {
            shapeByNodeId.set(leaf.nodeId, 'chamfer');
          } else if (ar >= 0.75 && ar <= 1.38) {
            shapeByNodeId.set(leaf.nodeId, 'circle');
          } else {
            shapeByNodeId.set(leaf.nodeId, idx % 2 === 0 ? 'chamfer' : 'pill');
          }
        }
      });

      const applyShapes = (node: BspNode): BspNode => {
        if (node.kind === 'leaf') {
          const sk = shapeByNodeId.get(node.nodeId);
          return sk && sk !== 'rect' ? { ...node, shapeKind: sk } : node;
        }
        return {
          ...node,
          first: applyShapes(node.first),
          second: applyShapes(node.second),
        };
      };
      return applyShapes(baseTree);
    }

    case 'puzzle': {
      // Interlocking architectural Bentos paired with `resolveIntentSculptOverlay`:
      // Even variant: 4-quadrant exact center-junction grid for circular hub cutout
      // Odd variant: Dominant hero stage + companion stack for concave L-shape corner wrap
      const isCenterHub = ctx.rng() < 0.5 && n >= 4;
      if (isCenterHub && canSplitVertical(ctx.rect, g, ctx.minDims.minW) && canSplitHorizontal(ctx.rect, g, ctx.minDims.minH)) {
        const vRatio = clampSplitRatioForRounding(ctx.rect.width, g, ctx.minDims.minW, 0.5);
        const [leftR, rightR] = splitRectExact(ctx.rect, 'vertical', vRatio, g);
        const hRatioL = clampSplitRatioForRounding(leftR.height, g, ctx.minDims.minH, 0.5);
        const hRatioR = clampSplitRatioForRounding(rightR.height, g, ctx.minDims.minH, 0.5);
        const [tlR, blR] = splitRectExact(leftR, 'horizontal', hRatioL, g);
        const [trR, brR] = splitRectExact(rightR, 'horizontal', hRatioR, g);

        // Distribute any extra cards beyond 4 into outer quadrants while preserving the clean center 4-corner junction
        const extra = n - 4;
        const tlCount = 1 + (extra >= 1 ? 1 : 0);
        const brCount = 1 + (extra >= 2 ? 1 : 0);
        const trCount = 1 + (extra >= 3 ? 1 : 0);
        const blCount = 1 + Math.max(0, extra - 3);

        return {
          kind: 'split',
          nodeId: ctx.nextNodeId(),
          axis: 'vertical',
          ratio: vRatio,
          first: {
            kind: 'split',
            nodeId: ctx.nextNodeId(),
            axis: 'horizontal',
            ratio: hRatioL,
            first: tlCount > 1 ? buildEqualStrip(tlR, tlCount, 'horizontal', ctx) : makeLeaf(ctx, 'standard'),
            second: blCount > 1 ? buildEqualStrip(blR, blCount, 'horizontal', ctx) : makeLeaf(ctx, 'standard'),
          },
          second: {
            kind: 'split',
            nodeId: ctx.nextNodeId(),
            axis: 'horizontal',
            ratio: hRatioR,
            first: trCount > 1 ? buildEqualStrip(trR, trCount, 'horizontal', ctx) : makeLeaf(ctx, 'standard'),
            second: brCount > 1 ? buildEqualStrip(brR, brCount, 'horizontal', ctx) : makeLeaf(ctx, 'standard'),
          },
        };
      }

      // L-Wrap Stage: strong hero stage (58-70%) + clean supporting stack so L-cutout has generous breathing room
      if (n >= 2 && canSplitVertical(ctx.rect, g, ctx.minDims.minW)) {
        const heroOnLeft = ctx.rng() < 0.65;
        const heroShare = Math.min(0.7, Math.max(0.56, 0.56 + ctx.heroBias * 0.14));
        const ratio = clampSplitRatioForRounding(
          ctx.rect.width,
          g,
          ctx.minDims.minW,
          heroOnLeft ? heroShare : 1 - heroShare
        );
        const [leftR, rightR] = splitRectExact(ctx.rect, 'vertical', ratio, g);
        const heroLeaf = makeLeaf(ctx, ctx.allowHero ? 'hero' : 'standard');
        const sideRect = heroOnLeft ? rightR : leftR;
        const sideNode = buildStaggeredColumn(sideRect, n - 1, [0.55, 0.45], -1, ctx);
        return {
          kind: 'split',
          nodeId: ctx.nextNodeId(),
          axis: 'vertical',
          ratio,
          first: heroOnLeft ? heroLeaf : sideNode,
          second: heroOnLeft ? sideNode : heroLeaf,
        };
      }

      return buildHarmonicBalancedSubtree(ctx.rect, n, ctx, true);
    }
  }
}

/**
 * Deterministically derives the sculptural cutout overlay for the 'puzzle' intent
 * (matching whether the tree has a clean 4-quadrant center hub or an L-wrap hero stage).
 */
export function resolveIntentSculptOverlay(
  intent: LayoutIntent,
  seed: number,
  tree: BspNode,
  anchorRect: RectPt,
  gutterPt: number
): BentoSculptOverlay | undefined {
  if (intent !== 'puzzle') {
    return undefined;
  }
  const leaves = resolveTreeLayout(tree, anchorRect, gutterPt);
  const cx = anchorRect.left + anchorRect.width / 2;
  const cy = anchorRect.top + anchorRect.height / 2;

  // Detect whether 4 leaf corners meet near the center of anchorRect (center-hub layout)
  const nearCenterThreshold = Math.max(24, gutterPt * 2 + 12);
  let cornersNearCenter = 0;
  for (const { rect } of leaves) {
    const pts = [
      [rect.left, rect.top],
      [rect.left + rect.width, rect.top],
      [rect.left, rect.top + rect.height],
      [rect.left + rect.width, rect.top + rect.height],
    ];
    if (pts.some(([px, py]) => Math.hypot(px! - cx, py! - cy) <= nearCenterThreshold)) {
      cornersNearCenter += 1;
    }
  }

  if (cornersNearCenter >= 4) {
    const radiusRatio = 0.18 + ((seed % 5) * 0.012);
    return {
      kind: 'center-hub',
      radiusRatio,
      hubHint: 'Core Hub',
    };
  }

  const corners: readonly CutoutCorner[] = ['br', 'tr', 'bl', 'tl'];
  const insetShapes: readonly CellShapeKind[] = ['rect', 'pill', 'circle', 'rect'];
  const corner = corners[seed % corners.length]!;
  const insetShape = insetShapes[Math.floor(seed / 7) % insetShapes.length]!;
  return {
    kind: 'l-wrap',
    corner,
    insetWidthRatio: 0.36 + ((seed % 3) * 0.04),
    insetHeightRatio: 0.38 + (((seed >> 2) % 3) * 0.04),
    insetShape,
    insetHint: 'Key Stat',
  };
}

/**
 * Deterministically assigns semantic ghost placeholder hints to leaves based on intent & reading order.
 */
export function assignContentHints(
  tree: BspNode,
  anchorRect: RectPt,
  gutterPt: number,
  intent: LayoutIntent
): BspNode {
  const sorted = sortReadingOrder(resolveTreeLayout(tree, anchorRect, gutterPt));
  const hintByNodeId = new Map<string, string>();

  const midX = anchorRect.left + anchorRect.width / 2;
  const midY = anchorRect.top + anchorRect.height / 2;
  const regime = detectContainerRegime(anchorRect);

  const execLabels = [
    'Key Metric',
    'Strategic Driver',
    'Supporting Proof',
    'Next Step',
    'Risk & Mitigation',
    'Owner & Timeline',
  ];
  const editorialLabels = [
    'Pull Quote',
    'Key Stat',
    'Context',
    'Takeaway',
    'Detail Note',
    'Caption',
  ];
  const showcaseLabels = [
    'Spec Highlight',
    'Performance',
    'Design Detail',
    'Reliability',
    'Integration',
    'Capability',
  ];
  const matrixLabels = [
    'Composability',
    'Margin Engine',
    'Liquidity',
    'Visual Accent',
    'Oracle Feed',
    'Collateral',
    'Execution',
    'Architecture',
  ];
  const collageLabels = [
    'Type Specimen',
    'Product Mockup',
    'Color Palette',
    'Photography',
    'Feature Badge',
    'Tagline Card',
    'Detail Crop',
  ];
  const creativeLabels = [
    'Pull Quote',
    'Mood / Texture',
    'Editorial Note',
    'Visual Detail',
    'Credit / Caption',
    'Palette Accent',
    'Studio Frame',
  ];
  const experimentalLabels = [
    'Index Spine',
    'Signal Tag',
    'Kinetic Detail',
    'Counterpoint',
    'Fragment',
    'Data Stamp',
    'Artifact',
  ];
  const sculptedLabels = [
    'Badge / Icon',
    'Highlight Pill',
    'Visual Frame',
    'Metric Circle',
    'Key Callout',
    'Accent Detail',
  ];
  const puzzleLabels = [
    'Pillar 01',
    'Pillar 02',
    'Pillar 03',
    'Pillar 04',
    'Supporting Note',
    'Detail',
  ];

  let supportIdx = 0;
  let kpiIdx = 1;
  let insightIdx = 0;
  let sideAIdx = 0;
  let sideBIdx = 0;

  for (const { leaf, rect } of sorted) {
    if (intent === 'comparison') {
      const center = regime === 'portrait' ? rect.top + rect.height / 2 : rect.left + rect.width / 2;
      const pivot = regime === 'portrait' ? midY : midX;
      if (center <= pivot) {
        hintByNodeId.set(
          leaf.nodeId,
          sideAIdx === 0 ? 'Option A — Lead' : `Option A — Point ${sideAIdx}`
        );
        sideAIdx += 1;
      } else {
        hintByNodeId.set(
          leaf.nodeId,
          sideBIdx === 0 ? 'Option B — Lead' : `Option B — Point ${sideBIdx}`
        );
        sideBIdx += 1;
      }
      continue;
    }

    if (leaf.role === 'hero') {
      switch (intent) {
        case 'executive-brief':
          hintByNodeId.set(leaf.nodeId, 'Core Takeaway');
          break;
        case 'editorial-story':
          hintByNodeId.set(leaf.nodeId, 'Lead Visual / Story');
          break;
        case 'kpi-dashboard':
          hintByNodeId.set(leaf.nodeId, 'Primary Trend Visual');
          break;
        case 'product-showcase':
          hintByNodeId.set(leaf.nodeId, 'Hero Feature');
          break;
        case 'matrix-grid':
          hintByNodeId.set(leaf.nodeId, '20X Core Metric');
          break;
        case 'brand-collage':
          hintByNodeId.set(leaf.nodeId, 'Brand Centerpiece');
          break;
        case 'creative':
          hintByNodeId.set(leaf.nodeId, 'Artboard / Lead Visual');
          break;
        case 'experimental':
          hintByNodeId.set(leaf.nodeId, 'Monumental Statement');
          break;
        case 'sculpted':
          hintByNodeId.set(leaf.nodeId, 'Sculpted Feature');
          break;
        case 'puzzle':
          hintByNodeId.set(leaf.nodeId, 'L-Wrap Stage');
          break;
        default:
          hintByNodeId.set(leaf.nodeId, 'Hero Focus');
          break;
      }
      continue;
    }

    if (intent === 'kpi-dashboard') {
      const areaShare = (rect.width * rect.height) / Math.max(1, anchorRect.width * anchorRect.height);
      if (areaShare <= 0.22 && kpiIdx <= 4) {
        hintByNodeId.set(leaf.nodeId, `KPI ${kpiIdx++}`);
      } else {
        const insightLabels = ['Key Insight', 'Breakdown', 'Forecast', 'Summary'];
        hintByNodeId.set(leaf.nodeId, insightLabels[insightIdx % insightLabels.length]!);
        insightIdx += 1;
      }
      continue;
    }

    if (intent === 'executive-brief') {
      hintByNodeId.set(leaf.nodeId, execLabels[supportIdx % execLabels.length]!);
    } else if (intent === 'editorial-story') {
      hintByNodeId.set(leaf.nodeId, editorialLabels[supportIdx % editorialLabels.length]!);
    } else if (intent === 'product-showcase') {
      hintByNodeId.set(leaf.nodeId, showcaseLabels[supportIdx % showcaseLabels.length]!);
    } else if (intent === 'matrix-grid') {
      hintByNodeId.set(leaf.nodeId, matrixLabels[supportIdx % matrixLabels.length]!);
    } else if (intent === 'brand-collage') {
      hintByNodeId.set(leaf.nodeId, collageLabels[supportIdx % collageLabels.length]!);
    } else if (intent === 'creative') {
      hintByNodeId.set(leaf.nodeId, creativeLabels[supportIdx % creativeLabels.length]!);
    } else if (intent === 'experimental') {
      hintByNodeId.set(leaf.nodeId, experimentalLabels[supportIdx % experimentalLabels.length]!);
    } else if (intent === 'sculpted') {
      hintByNodeId.set(leaf.nodeId, sculptedLabels[supportIdx % sculptedLabels.length]!);
    } else if (intent === 'puzzle') {
      hintByNodeId.set(leaf.nodeId, puzzleLabels[supportIdx % puzzleLabels.length]!);
    } else {
      hintByNodeId.set(leaf.nodeId, `Supporting Card ${supportIdx + 1}`);
    }
    supportIdx += 1;
  }

  function apply(node: BspNode): BspNode {
    if (node.kind === 'leaf') {
      const hint = hintByNodeId.get(node.nodeId);
      if (!hint || hint === node.contentHint) {
        return node;
      }
      return { ...node, contentHint: hint };
    }
    const first = apply(node.first);
    const second = apply(node.second);
    if (first === node.first && second === node.second) {
      return node;
    }
    return { ...node, first, second };
  }

  return apply(tree);
}
