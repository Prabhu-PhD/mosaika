import {
  BENTO_ERROR_MESSAGES,
  BENTO_SCHEMA_VERSION,
  type BentoDocumentState,
  type BentoParams,
  type BentoResult,
  type BspLeafNode,
  type BspNode,
  type BspSplitNode,
  type CellRole,
  type CellShapeKind,
  type GridSystemId,
  type LayoutIntent,
  type RectPt,
  type SplitAxis,
} from '@bento/contract';
import {
  canSplitHorizontal,
  canSplitVertical,
  clampSplitRatioForRounding,
  computeMaxCount,
  computeMinCellDimensions,
  computeSafeMaxGutter,
  computeSubtreeMinSpan,
  MAX_BOX_COUNT,
  MAX_GUTTER_PT,
  MAX_RADIUS_PT,
  type MinCellDimensions,
  normalizeRect,
  resolveAllNodeRects,
  resolveSplitHandles,
  resolveTreeLayout,
  round2,
  round4,
  sortReadingOrder,
} from './geometry.js';
import {
  computeGridLattice,
  type GridTrackSnapResult,
  snapRatioToGridLattice,
  snapTreeToGridLattice,
} from './grid.js';
import {
  assignContentHints,
  buildIntentTree,
  getIntentDefinition,
  HARMONIC_RATIOS,
  pickHarmonicRatio,
  resolveIntentSculptOverlay,
  scoreLayoutAesthetics,
  scoreSplitAspectComfort,
} from './intents.js';
import { createDeterministicBentoId, mulberry32, normalizeSeed } from './prng.js';
import { mirrorSculptOverlay } from './shapes.js';

export const DEFAULT_BENTO_PARAMS: BentoParams = {
  intent: 'executive-brief',
  gridSystem: 'swiss-12x6',
  count: 5,
  gutterPt: 10,
  radiusPt: 12,
  heroBias: 0.5,
  seed: 48219,
  stylePreset: 'soft-modern',
  hierarchyMode: 'hero-accent',
  morphEnabled: false,
};

const AESTHETIC_CANDIDATE_COUNT = 3;

export function formatSlotId(seq: number): string {
  return `slot_${String(seq).padStart(2, '0')}`;
}

export function collectLeaves(node: BspNode): BspLeafNode[] {
  if (node.kind === 'leaf') {
    return [node];
  }
  return [...collectLeaves(node.first), ...collectLeaves(node.second)];
}

export function countLeaves(node: BspNode): number {
  if (node.kind === 'leaf') {
    return 1;
  }
  return countLeaves(node.first) + countLeaves(node.second);
}

export function hasLockedDescendant(node: BspNode): boolean {
  if (node.kind === 'leaf') {
    return node.locked;
  }
  return hasLockedDescendant(node.first) || hasLockedDescendant(node.second);
}

function countLockedLeaves(node: BspNode): number {
  if (node.kind === 'leaf') {
    return node.locked ? 1 : 0;
  }
  return countLockedLeaves(node.first) + countLockedLeaves(node.second);
}

function findMaxNodeNumber(node: BspNode): number {
  const match = /^n_(\d+)$/.exec(node.nodeId);
  const current = match && match[1] ? Number.parseInt(match[1], 10) : 0;
  if (node.kind === 'leaf') {
    return current;
  }
  return Math.max(current, findMaxNodeNumber(node.first), findMaxNodeNumber(node.second));
}

function replaceLeafInTree(
  tree: BspNode,
  targetNodeId: string,
  replacement: BspNode
): BspNode {
  if (tree.nodeId === targetNodeId) {
    return replacement;
  }
  if (tree.kind === 'leaf') {
    return tree;
  }
  const nextFirst = replaceLeafInTree(tree.first, targetNodeId, replacement);
  const nextSecond = replaceLeafInTree(tree.second, targetNodeId, replacement);
  if (nextFirst === tree.first && nextSecond === tree.second) {
    return tree;
  }
  return {
    ...tree,
    first: nextFirst,
    second: nextSecond,
  };
}

function pickSplitAxis(
  rect: RectPt,
  gutterPt: number,
  minDims: MinCellDimensions,
  rng: () => number,
  heroBias: number,
  isHeroAnchor: boolean,
  containerAspect: number
): SplitAxis | null {
  const canV = canSplitVertical(rect, gutterPt, minDims.minW);
  const canH = canSplitHorizontal(rect, gutterPt, minDims.minH);
  if (!canV && !canH) {
    return null;
  }
  if (canV && !canH) {
    return 'vertical';
  }
  if (!canV && canH) {
    return 'horizontal';
  }

  // Aspect-Ratio Sliver Guard: strongly prefer the axis whose split stays in the Golden Comfort Band
  const comfortV = scoreSplitAspectComfort(rect, 'vertical', 0.5, gutterPt, containerAspect);
  const comfortH = scoreSplitAspectComfort(rect, 'horizontal', 0.5, gutterPt, containerAspect);
  if (comfortV - comfortH > 0.75) {
    return 'vertical';
  }
  if (comfortH - comfortV > 0.75) {
    return 'horizontal';
  }

  if (heroBias === 0 && !isHeroAnchor) {
    return rect.width >= rect.height ? 'vertical' : 'horizontal';
  }

  const aspect = rect.width / Math.max(1, rect.height);
  if (isHeroAnchor) {
    if (aspect >= 1.2) {
      return rng() < 0.75 ? 'vertical' : 'horizontal';
    }
    if (aspect <= 1 / 1.2) {
      return rng() < 0.75 ? 'horizontal' : 'vertical';
    }
    return rng() < 0.5 ? 'vertical' : 'horizontal';
  }

  if (aspect >= 1.35) {
    return rng() < 0.85 ? 'vertical' : 'horizontal';
  }
  if (aspect <= 1 / 1.35) {
    return rng() < 0.85 ? 'horizontal' : 'vertical';
  }
  const verticalProb = rect.width / (rect.width + rect.height);
  return rng() < verticalProb ? 'vertical' : 'horizontal';
}

interface SubtreeGenOptions {
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

function generateHarmonicFreeformSubtree(opts: SubtreeGenOptions): BspNode {
  const {
    rect,
    targetCount,
    gutterPt,
    heroBias,
    minDims,
    rng,
    nextNodeId,
    nextTempSlotId,
    allowHero,
  } = opts;

  const clampedTarget = Math.max(1, Math.min(MAX_BOX_COUNT, Math.round(targetCount)));
  const containerAspect = rect.width / Math.max(1, rect.height);

  let root: BspNode = {
    kind: 'leaf',
    nodeId: nextNodeId(),
    slotId: nextTempSlotId(),
    role: 'standard',
    locked: false,
  };

  if (clampedTarget <= 1) {
    return root;
  }

  let currentLeaves = 1;

  // Step 2: Harmonic Hero Anchor Step
  if (allowHero && clampedTarget >= 3 && heroBias > 0.15) {
    const axis = pickSplitAxis(rect, gutterPt, minDims, rng, heroBias, true, containerAspect);
    if (axis !== null) {
      const heroCandidates = heroBias >= 0.65 ? [0.5, 0.6, 2 / 3] : [0.5, 0.6];
      const axisLen = axis === 'vertical' ? rect.width : rect.height;
      const minSide = axis === 'vertical' ? minDims.minW : minDims.minH;

      const heroShare = pickHarmonicRatio(axisLen, gutterPt, minSide, heroCandidates, rng);
      const heroOnFirst = rng() < 0.68;
      const safeRatio = heroOnFirst
        ? heroShare
        : clampSplitRatioForRounding(axisLen, gutterPt, minSide, 1 - heroShare);

      const firstLeaf: BspLeafNode = {
        kind: 'leaf',
        nodeId: nextNodeId(),
        slotId: nextTempSlotId(),
        role: heroOnFirst ? 'hero' : 'standard',
        locked: false,
      };
      const secondLeaf: BspLeafNode = {
        kind: 'leaf',
        nodeId: nextNodeId(),
        slotId: nextTempSlotId(),
        role: heroOnFirst ? 'standard' : 'hero',
        locked: false,
      };

      root = {
        kind: 'split',
        nodeId: nextNodeId(),
        axis,
        ratio: safeRatio,
        first: firstLeaf,
        second: secondLeaf,
      };
      currentLeaves = 2;
    }
  }

  // Step 3: Harmonic Iterative Subdivision with Sliver Guard
  while (currentLeaves < clampedTarget) {
    const resolved = resolveTreeLayout(root, rect, gutterPt);
    const splittable = resolved.filter(
      (item) =>
        !item.leaf.locked &&
        (canSplitVertical(item.rect, gutterPt, minDims.minW) ||
          canSplitHorizontal(item.rect, gutterPt, minDims.minH))
    );

    if (splittable.length === 0) {
      break;
    }

    let candidates = splittable.filter((item) => item.leaf.role !== 'hero');
    if (candidates.length === 0) {
      if (heroBias >= 0.5) {
        break;
      }
      candidates = splittable;
    }

    let chosen = candidates[0]!;
    if (heroBias === 0) {
      let bestScore = -1;
      for (const item of candidates) {
        const area = item.rect.width * item.rect.height;
        const score = area * (0.95 + rng() * 0.1);
        if (score > bestScore) {
          bestScore = score;
          chosen = item;
        }
      }
    } else {
      const exponent = 1 + 0.5 * heroBias;
      const weights = candidates.map((item) =>
        Math.pow(Math.max(1, item.rect.width * item.rect.height), exponent)
      );
      const totalWeight = weights.reduce((acc, w) => acc + w, 0);
      let cursor = rng() * totalWeight;
      chosen = candidates[candidates.length - 1]!;
      for (let i = 0; i < candidates.length; i++) {
        cursor -= weights[i]!;
        if (cursor <= 0) {
          chosen = candidates[i]!;
          break;
        }
      }
    }

    const axis = pickSplitAxis(
      chosen.rect,
      gutterPt,
      minDims,
      rng,
      heroBias,
      false,
      containerAspect
    );
    if (axis === null) {
      break;
    }

    const harmonicPool =
      heroBias <= 0.2
        ? [0.5, 0.5, 0.4, 0.6]
        : heroBias <= 0.65
          ? [1 / 3, 0.4, 0.5, 0.6, 2 / 3]
          : HARMONIC_RATIOS;

    const axisLen = axis === 'vertical' ? chosen.rect.width : chosen.rect.height;
    const minSide = axis === 'vertical' ? minDims.minW : minDims.minH;
    const safeRatio = pickHarmonicRatio(axisLen, gutterPt, minSide, harmonicPool, rng);

    const firstChild: BspLeafNode = {
      kind: 'leaf',
      nodeId: nextNodeId(),
      slotId: chosen.leaf.slotId,
      role: chosen.leaf.role,
      locked: false,
    };
    const secondChild: BspLeafNode = {
      kind: 'leaf',
      nodeId: nextNodeId(),
      slotId: nextTempSlotId(),
      role: 'standard',
      locked: false,
    };

    const splitNode: BspSplitNode = {
      kind: 'split',
      nodeId: nextNodeId(),
      axis,
      ratio: safeRatio,
      first: firstChild,
      second: secondChild,
    };

    root = replaceLeafInTree(root, chosen.leaf.nodeId, splitNode);
    currentLeaves += 1;
  }

  return root;
}

/**
 * Deterministic Best-of-K ("Art Director") generator combining Intent grammars,
 * Swiss harmonic snapping, and aesthetics scoring.
 */
function generateBestIntentTree(
  intent: LayoutIntent,
  rect: RectPt,
  targetCount: number,
  gutterPt: number,
  heroBias: number,
  minDims: MinCellDimensions,
  seed: number,
  startNodeNumber: number,
  allowHero: boolean
): BspNode {
  let bestTree: BspNode | null = null;
  let bestScore = -Infinity;

  for (let attempt = 0; attempt < AESTHETIC_CANDIDATE_COUNT; attempt++) {
    const attemptSeed = (seed ^ Math.imul(attempt + 1, 0x9e3779b1)) >>> 0;
    const rng = mulberry32(attemptSeed || 1);
    let nodeCounter = startNodeNumber;
    let tempSlotCounter = 1;
    const nextNodeId = () => `n_${nodeCounter++}`;
    const nextTempSlotId = () => `tmp_${tempSlotCounter++}`;

    const ctx = {
      rect,
      targetCount,
      gutterPt,
      heroBias,
      minDims,
      rng,
      nextNodeId,
      nextTempSlotId,
      allowHero,
    };

    const candidate =
      buildIntentTree(intent, ctx) ?? generateHarmonicFreeformSubtree(ctx);

    const resolved = resolveTreeLayout(candidate, rect, gutterPt);
    const leafPenalty = Math.abs(targetCount - resolved.length) * 18;
    const aestheticScore = scoreLayoutAesthetics(resolved, rect, intent) - leafPenalty;

    if (aestheticScore > bestScore) {
      bestScore = aestheticScore;
      bestTree = candidate;
    }
  }

  return bestTree!;
}

function assignSlotIdsToTree(
  tree: BspNode,
  slotByNodeId: Map<string, string>
): BspNode {
  if (tree.kind === 'leaf') {
    const mapped = slotByNodeId.get(tree.nodeId);
    if (!mapped || mapped === tree.slotId) {
      return tree;
    }
    return { ...tree, slotId: mapped };
  }
  const first = assignSlotIdsToTree(tree.first, slotByNodeId);
  const second = assignSlotIdsToTree(tree.second, slotByNodeId);
  if (first === tree.first && second === tree.second) {
    return tree;
  }
  return { ...tree, first, second };
}

/**
 * Remaps unlocked leaves in a newly generated tree to preserve existing unlocked slotIds cleanly
 * (hero -> previous hero / slot_01, then reading order) so typed user text stays bound in-place.
 */
function remapUnlockedSlotIds(
  tree: BspNode,
  anchorRect: RectPt,
  gutterPt: number,
  prevState: BentoDocumentState | null
): { tree: BspNode; nextSlotSeq: number } {
  const resolvedSorted = sortReadingOrder(resolveTreeLayout(tree, anchorRect, gutterPt));
  const unlockedNewLeaves = resolvedSorted.filter((item) => !item.leaf.locked);

  let nextSlotSeq = prevState ? prevState.nextSlotSeq : 1;
  const slotByNodeId = new Map<string, string>();

  const prevUnlockedSlotOrder: string[] = [];
  if (prevState) {
    const prevSorted = sortReadingOrder(
      resolveTreeLayout(prevState.tree, prevState.anchorRect, prevState.params.gutterPt)
    );
    const prevUnlocked = prevSorted.filter((item) => !item.leaf.locked);

    const hasNewUnlockedHero = unlockedNewLeaves.some((item) => item.leaf.role === 'hero');
    const slot01Item = prevUnlocked.find((item) => item.leaf.slotId === 'slot_01');
    const prevHeroItem = prevUnlocked.find((item) => item.leaf.role === 'hero');

    const used = new Set<string>();
    if (hasNewUnlockedHero && prevHeroItem) {
      prevUnlockedSlotOrder.push(prevHeroItem.leaf.slotId);
      used.add(prevHeroItem.leaf.slotId);
    } else if (hasNewUnlockedHero && slot01Item) {
      prevUnlockedSlotOrder.push(slot01Item.leaf.slotId);
      used.add(slot01Item.leaf.slotId);
    }

    for (const item of prevUnlocked) {
      if (!used.has(item.leaf.slotId)) {
        prevUnlockedSlotOrder.push(item.leaf.slotId);
        used.add(item.leaf.slotId);
      }
    }
  }

  for (let i = 0; i < unlockedNewLeaves.length; i++) {
    const leaf = unlockedNewLeaves[i]!.leaf;
    const reusedSlot = prevUnlockedSlotOrder[i];
    if (reusedSlot) {
      slotByNodeId.set(leaf.nodeId, reusedSlot);
    } else {
      slotByNodeId.set(leaf.nodeId, formatSlotId(nextSlotSeq));
      nextSlotSeq += 1;
    }
  }

  return {
    tree: assignSlotIdsToTree(tree, slotByNodeId),
    nextSlotSeq,
  };
}

function clampParams(partial?: Partial<BentoParams>): BentoParams {
  const intent: LayoutIntent = partial?.intent ?? DEFAULT_BENTO_PARAMS.intent;
  const gridSystem: GridSystemId = partial?.gridSystem ?? DEFAULT_BENTO_PARAMS.gridSystem;
  return {
    intent,
    gridSystem,
    count: Math.max(
      1,
      Math.min(MAX_BOX_COUNT, Math.round(partial?.count ?? DEFAULT_BENTO_PARAMS.count))
    ),
    gutterPt: round2(
      Math.max(0, Math.min(MAX_GUTTER_PT, partial?.gutterPt ?? DEFAULT_BENTO_PARAMS.gutterPt))
    ),
    radiusPt: round2(
      Math.max(0, Math.min(MAX_RADIUS_PT, partial?.radiusPt ?? DEFAULT_BENTO_PARAMS.radiusPt))
    ),
    heroBias: round2(
      Math.max(0, Math.min(1, partial?.heroBias ?? DEFAULT_BENTO_PARAMS.heroBias))
    ),
    seed: normalizeSeed(partial?.seed ?? DEFAULT_BENTO_PARAMS.seed),
    stylePreset: partial?.stylePreset ?? DEFAULT_BENTO_PARAMS.stylePreset,
    hierarchyMode: partial?.hierarchyMode ?? DEFAULT_BENTO_PARAMS.hierarchyMode,
    morphEnabled: partial?.morphEnabled ?? DEFAULT_BENTO_PARAMS.morphEnabled,
  };
}

/**
 * Helper to create a brand-new BentoDocumentState using an intent's signature defaults.
 */
export function createIntentBentoDocument(
  anchorRect: RectPt,
  intent: LayoutIntent,
  overrides?: Partial<BentoParams>,
  options?: { bentoId?: string; salt?: number }
): BentoResult<BentoDocumentState> {
  const rec = getIntentDefinition(intent).recommendedParams;
  return createBentoDocument(
    anchorRect,
    {
      intent,
      ...(rec.gridSystem ? { gridSystem: rec.gridSystem } : {}),
      count: rec.count,
      gutterPt: rec.gutterPt,
      radiusPt: rec.radiusPt,
      heroBias: rec.heroBias,
      stylePreset: rec.stylePreset,
      hierarchyMode: rec.hierarchyMode,
      ...overrides,
    },
    options
  );
}

/**
 * Creates a brand-new BentoDocumentState for the given anchorRect and optional parameters.
 */
export function createBentoDocument(
  anchorRect: RectPt,
  partialParams?: Partial<BentoParams>,
  options?: { bentoId?: string; salt?: number }
): BentoResult<BentoDocumentState> {
  const normalizedRect = normalizeRect(anchorRect);
  const params = clampParams(partialParams);
  const minDims = computeMinCellDimensions(normalizedRect);

  const containerTooSmall =
    normalizedRect.width < minDims.minW || normalizedRect.height < minDims.minH;

  let tree: BspNode;
  let warning: 'CONTAINER_TOO_SMALL' | undefined;

  if (containerTooSmall) {
    warning = 'CONTAINER_TOO_SMALL';
    tree = {
      kind: 'leaf',
      nodeId: 'n_1',
      slotId: 'tmp_1',
      role: 'standard',
      locked: false,
    };
  } else {
    const maxCount = computeMaxCount(normalizedRect, params.gutterPt, minDims);
    const effectiveTarget = Math.max(1, Math.min(params.count, maxCount));
    const rawTree = generateBestIntentTree(
      params.intent,
      normalizedRect,
      effectiveTarget,
      params.gutterPt,
      params.heroBias,
      minDims,
      params.seed,
      1,
      true
    );
    tree = snapTreeToGridLattice(rawTree, normalizedRect, params.gutterPt, params.gridSystem);
  }

  const remapped = remapUnlockedSlotIds(tree, normalizedRect, params.gutterPt, null);
  const hintedTree = assignContentHints(
    remapped.tree,
    normalizedRect,
    params.gutterPt,
    params.intent
  );
  const actualCount = countLeaves(hintedTree);

  const bentoId =
    options?.bentoId ?? createDeterministicBentoId(params.seed, normalizedRect, options?.salt ?? 0);

  const sculpt = resolveIntentSculptOverlay(
    params.intent,
    params.seed,
    hintedTree,
    normalizedRect,
    params.gutterPt
  );

  const state: BentoDocumentState = {
    schemaVersion: BENTO_SCHEMA_VERSION,
    bentoId,
    revision: 1,
    anchorRect: normalizedRect,
    params: {
      ...params,
      count: actualCount,
    },
    tree: hintedTree,
    nextSlotSeq: remapped.nextSlotSeq,
    ...(sculpt ? { sculpt } : {}),
  };

  return warning ? { ok: true, value: state, warning } : { ok: true, value: state };
}

interface UnlockedSubtreeSlot {
  nodeId: string;
  rect: RectPt;
  maxCapacity: number;
  area: number;
}

/**
 * Subtree-Freeze BSP Re-Partitioning (PRD Section 3.7).
 * Any split node with a locked descendant freezes its axis and ratio, guaranteeing 0.00pt shift
 * for every locked cell while freely randomizing or resizing unlocked subtrees.
 */
export function regenerateWithLocks(
  state: BentoDocumentState,
  nextPartialParams: Partial<BentoParams>
): BentoResult<BentoDocumentState> {
  const totalLeaves = countLeaves(state.tree);
  const lockedLeaves = countLockedLeaves(state.tree);

  if (lockedLeaves === totalLeaves) {
    return {
      ok: false,
      errorCode: 'ALL_CELLS_LOCKED',
      message: BENTO_ERROR_MESSAGES.ALL_CELLS_LOCKED,
    };
  }

  const nextParams = clampParams({
    ...state.params,
    ...nextPartialParams,
  });

  const minDims = computeMinCellDimensions(state.anchorRect);
  const startNodeNum = findMaxNodeNumber(state.tree) + 1;

  // Fast path: no locked cells at all -> run Best-of-3 Intent tree from root, snap to grid, remap slotIds
  if (lockedLeaves === 0) {
    const maxCount = computeMaxCount(state.anchorRect, nextParams.gutterPt, minDims);
    const effectiveTarget = Math.max(1, Math.min(nextParams.count, maxCount));
    const generatedTree = generateBestIntentTree(
      nextParams.intent,
      state.anchorRect,
      effectiveTarget,
      nextParams.gutterPt,
      nextParams.heroBias,
      minDims,
      nextParams.seed,
      startNodeNum,
      true
    );
    const rawTree = snapTreeToGridLattice(
      generatedTree,
      state.anchorRect,
      nextParams.gutterPt,
      nextParams.gridSystem
    );
    const remapped = remapUnlockedSlotIds(rawTree, state.anchorRect, nextParams.gutterPt, state);
    const hintedTree = assignContentHints(
      remapped.tree,
      state.anchorRect,
      nextParams.gutterPt,
      nextParams.intent
    );
    const actualCount = countLeaves(hintedTree);
    const nextSculpt = resolveIntentSculptOverlay(
      nextParams.intent,
      nextParams.seed,
      hintedTree,
      state.anchorRect,
      nextParams.gutterPt
    );
    const { sculpt: _oldSculpt, ...restState } = state;
    return {
      ok: true,
      value: {
        ...restState,
        revision: state.revision + 1,
        params: {
          ...nextParams,
          count: actualCount,
        },
        tree: hintedTree,
        nextSlotSeq: remapped.nextSlotSeq,
        ...(nextSculpt ? { sculpt: nextSculpt } : {}),
      },
    };
  }

  // Subtree-freeze path: identify maximal unlocked subtrees under frozen ancestors
  const rng = mulberry32(nextParams.seed);
  let nodeCounter = startNodeNum;
  let tempSlotCounter = 1;
  const nextNodeId = () => `n_${nodeCounter++}`;
  const nextTempSlotId = () => `tmp_${tempSlotCounter++}`;

  const rectMap = resolveAllNodeRects(state.tree, state.anchorRect, nextParams.gutterPt);
  const unlockedSlots: UnlockedSubtreeSlot[] = [];

  function collectMaximalUnlocked(node: BspNode): void {
    if (!hasLockedDescendant(node)) {
      const rect = rectMap.get(node.nodeId) ?? state.anchorRect;
      const cap = Math.max(1, computeMaxCount(rect, nextParams.gutterPt, minDims));
      unlockedSlots.push({
        nodeId: node.nodeId,
        rect,
        maxCapacity: cap,
        area: Math.max(1, rect.width * rect.height),
      });
      return;
    }
    if (node.kind === 'split') {
      collectMaximalUnlocked(node.first);
      collectMaximalUnlocked(node.second);
    }
  }

  collectMaximalUnlocked(state.tree);

  const minUnlockedTotal = unlockedSlots.length;
  const maxUnlockedTotal = unlockedSlots.reduce((sum, s) => sum + s.maxCapacity, 0);
  const desiredUnlockedTotal = Math.max(
    minUnlockedTotal,
    Math.min(maxUnlockedTotal, nextParams.count - lockedLeaves)
  );

  const allocations = new Map<string, number>();
  for (const slot of unlockedSlots) {
    allocations.set(slot.nodeId, 1);
  }

  let remaining = desiredUnlockedTotal - minUnlockedTotal;
  while (remaining > 0) {
    let bestSlot: UnlockedSubtreeSlot | null = null;
    let bestWeight = -1;
    for (const slot of unlockedSlots) {
      const current = allocations.get(slot.nodeId) ?? 1;
      if (current < slot.maxCapacity) {
        const weight = slot.area / current;
        if (weight > bestWeight) {
          bestWeight = weight;
          bestSlot = slot;
        }
      }
    }
    if (!bestSlot) {
      break;
    }
    allocations.set(bestSlot.nodeId, (allocations.get(bestSlot.nodeId) ?? 1) + 1);
    remaining -= 1;
  }

  const hasLockedHero = collectLeaves(state.tree).some(
    (leaf) => leaf.locked && leaf.role === 'hero'
  );
  let heroAllowedForOneSubtree = !hasLockedHero && nextParams.intent !== 'comparison';

  let heroSubtreeNodeId: string | null = null;
  if (heroAllowedForOneSubtree) {
    let bestArea = -1;
    for (const slot of unlockedSlots) {
      if ((allocations.get(slot.nodeId) ?? 1) >= 3 && slot.area > bestArea) {
        bestArea = slot.area;
        heroSubtreeNodeId = slot.nodeId;
      }
    }
  }

  function rebuild(node: BspNode): BspNode {
    if (!hasLockedDescendant(node)) {
      const rect = rectMap.get(node.nodeId) ?? state.anchorRect;
      const quota = allocations.get(node.nodeId) ?? 1;
      const allowHero = heroAllowedForOneSubtree && node.nodeId === heroSubtreeNodeId;
      if (allowHero) {
        heroAllowedForOneSubtree = false;
      }
      return generateHarmonicFreeformSubtree({
        rect,
        targetCount: quota,
        gutterPt: nextParams.gutterPt,
        heroBias: nextParams.heroBias,
        minDims,
        rng,
        nextNodeId,
        nextTempSlotId,
        allowHero,
      });
    }

    if (node.kind === 'leaf') {
      return node;
    }

    // Freeze axis & ratio unconditionally for any ancestor of a locked leaf
    return {
      ...node,
      first: rebuild(node.first),
      second: rebuild(node.second),
    };
  }

  const rebuiltTree = snapTreeToGridLattice(
    rebuild(state.tree),
    state.anchorRect,
    nextParams.gutterPt,
    nextParams.gridSystem
  );
  const remapped = remapUnlockedSlotIds(rebuiltTree, state.anchorRect, nextParams.gutterPt, state);
  const hintedTree = assignContentHints(
    remapped.tree,
    state.anchorRect,
    nextParams.gutterPt,
    nextParams.intent
  );
  const actualCount = countLeaves(hintedTree);

  return {
    ok: true,
    value: {
      ...state,
      revision: state.revision + 1,
      params: {
        ...nextParams,
        count: actualCount,
      },
      tree: hintedTree,
      nextSlotSeq: remapped.nextSlotSeq,
    },
  };
}

/**
 * Switches the active Swiss modular grid system (12x6, 6x4, 4x3, Free) and smoothly re-snaps
 * unlocked splits onto the new global track lines without changing card topology or slotIds.
 */
export function setGridSystem(
  state: BentoDocumentState,
  gridSystem: GridSystemId
): BentoDocumentState {
  const nextTree = snapTreeToGridLattice(
    state.tree,
    state.anchorRect,
    state.params.gutterPt,
    gridSystem
  );
  return {
    ...state,
    revision: state.revision + 1,
    params: {
      ...state.params,
      gridSystem,
    },
    tree: nextTree,
  };
}

/**
 * Updates non-structural parameters (gutterPt, radiusPt, stylePreset, hierarchyMode, morphEnabled)
 * in-place on the existing tree without changing topology.
 * Clamps gutterPt to computeSafeMaxGutter(tree, anchorRect) so dense trees never violate minW/minH.
 */
export function updateNonStructuralParams(
  state: BentoDocumentState,
  patch: Partial<
    Pick<BentoParams, 'gutterPt' | 'radiusPt' | 'stylePreset' | 'hierarchyMode' | 'morphEnabled'>
  >
): BentoDocumentState {
  let nextGutter = state.params.gutterPt;
  if (patch.gutterPt !== undefined) {
    const safeMaxGutter = computeSafeMaxGutter(state.tree, state.anchorRect);
    nextGutter = round2(Math.max(0, Math.min(safeMaxGutter, patch.gutterPt)));
  }

  const nextRadius =
    patch.radiusPt !== undefined
      ? round2(Math.max(0, Math.min(MAX_RADIUS_PT, patch.radiusPt)))
      : state.params.radiusPt;

  return {
    ...state,
    revision: state.revision + 1,
    params: {
      ...state.params,
      gutterPt: nextGutter,
      radiusPt: nextRadius,
      stylePreset: patch.stylePreset ?? state.params.stylePreset,
      hierarchyMode: patch.hierarchyMode ?? state.params.hierarchyMode,
      morphEnabled: patch.morphEnabled ?? state.params.morphEnabled,
    },
  };
}

/**
 * Delete-and-Reflow Gap Healing Algorithm (PRD Section 3.8).
 * Returns null if all leaves were deleted.
 */
export function reflowMissingSlots(
  state: BentoDocumentState,
  survivingSlotIds: ReadonlySet<string>
): BentoDocumentState | null {
  function pruneMissing(node: BspNode): BspNode | null {
    if (node.kind === 'leaf') {
      return survivingSlotIds.has(node.slotId) ? node : null;
    }
    const newFirst = pruneMissing(node.first);
    const newSecond = pruneMissing(node.second);
    if (newFirst === null && newSecond === null) {
      return null;
    }
    if (newFirst === null) {
      return newSecond;
    }
    if (newSecond === null) {
      return newFirst;
    }
    return {
      ...node,
      first: newFirst,
      second: newSecond,
    };
  }

  const pruned = pruneMissing(state.tree);
  if (pruned === null) {
    return null;
  }

  const survivingCount = countLeaves(pruned);
  return {
    ...state,
    revision: state.revision + 1,
    params: {
      ...state.params,
      count: survivingCount,
    },
    tree: pruned,
  };
}

/**
 * Direct Leaf Split (PRD Section 3.9).
 */
export function splitLeaf(
  state: BentoDocumentState,
  slotId: string,
  axis: SplitAxis
): BentoResult<BentoDocumentState> {
  const resolved = resolveTreeLayout(state.tree, state.anchorRect, state.params.gutterPt);
  const target = resolved.find((item) => item.leaf.slotId === slotId);
  if (!target) {
    return {
      ok: false,
      errorCode: 'CONTAINER_TOO_SMALL',
      message: BENTO_ERROR_MESSAGES.CONTAINER_TOO_SMALL,
    };
  }

  if (countLeaves(state.tree) >= MAX_BOX_COUNT) {
    return {
      ok: false,
      errorCode: 'CONTAINER_TOO_SMALL',
      message: BENTO_ERROR_MESSAGES.CONTAINER_TOO_SMALL,
    };
  }

  const minDims = computeMinCellDimensions(state.anchorRect);
  const canSplit =
    axis === 'vertical'
      ? canSplitVertical(target.rect, state.params.gutterPt, minDims.minW)
      : canSplitHorizontal(target.rect, state.params.gutterPt, minDims.minH);

  if (!canSplit) {
    return {
      ok: false,
      errorCode: 'CONTAINER_TOO_SMALL',
      message: BENTO_ERROR_MESSAGES.CONTAINER_TOO_SMALL,
    };
  }

  const axisLen = axis === 'vertical' ? target.rect.width : target.rect.height;
  const minSide = axis === 'vertical' ? minDims.minW : minDims.minH;
  const lattice = computeGridLattice(
    state.anchorRect,
    state.params.gutterPt,
    state.params.gridSystem
  );
  const latticeSnap = lattice
    ? snapRatioToGridLattice(lattice, target.rect, axis, 0.5, minSide, minSide)
    : null;
  const safeRatio =
    latticeSnap?.ratio ?? clampSplitRatioForRounding(axisLen, state.params.gutterPt, minSide, 0.5);

  let nextNodeNum = findMaxNodeNumber(state.tree) + 1;
  const splitNodeId = `n_${nextNodeNum++}`;
  const secondLeafNodeId = `n_${nextNodeNum++}`;
  const newSlotId = formatSlotId(state.nextSlotSeq);

  const newSplit: BspSplitNode = {
    kind: 'split',
    nodeId: splitNodeId,
    axis,
    ratio: safeRatio,
    first: {
      ...target.leaf,
    },
    second: {
      kind: 'leaf',
      nodeId: secondLeafNodeId,
      slotId: newSlotId,
      role: 'standard',
      locked: false,
      contentHint: 'Supporting Card',
    },
  };

  const nextTree = replaceLeafInTree(state.tree, target.leaf.nodeId, newSplit);
  return {
    ok: true,
    value: {
      ...state,
      revision: state.revision + 1,
      params: {
        ...state.params,
        count: countLeaves(nextTree),
      },
      tree: nextTree,
      nextSlotSeq: state.nextSlotSeq + 1,
    },
  };
}

export function canMergeLeaves(tree: BspNode, slotIdA: string, slotIdB: string): boolean {
  if (slotIdA === slotIdB) {
    return false;
  }

  function search(node: BspNode): boolean {
    if (node.kind === 'leaf') {
      return false;
    }
    if (node.first.kind === 'leaf' && node.second.kind === 'leaf') {
      const a = node.first.slotId;
      const b = node.second.slotId;
      if ((a === slotIdA && b === slotIdB) || (a === slotIdB && b === slotIdA)) {
        return true;
      }
    }
    return search(node.first) || search(node.second);
  }

  return search(tree);
}

export function mergeLeaves(
  state: BentoDocumentState,
  slotIdA: string,
  slotIdB: string
): BentoResult<BentoDocumentState> {
  if (!canMergeLeaves(state.tree, slotIdA, slotIdB)) {
    return {
      ok: false,
      errorCode: 'NON_SIBLING_MERGE',
      message: BENTO_ERROR_MESSAGES.NON_SIBLING_MERGE,
    };
  }

  function mergeNode(node: BspNode): BspNode {
    if (node.kind === 'leaf') {
      return node;
    }
    if (node.first.kind === 'leaf' && node.second.kind === 'leaf') {
      const a = node.first.slotId;
      const b = node.second.slotId;
      if (a === slotIdA && b === slotIdB) {
        return node.first;
      }
      if (b === slotIdA && a === slotIdB) {
        return node.second;
      }
    }
    const nextFirst = mergeNode(node.first);
    const nextSecond = mergeNode(node.second);
    if (nextFirst === node.first && nextSecond === node.second) {
      return node;
    }
    return {
      ...node,
      first: nextFirst,
      second: nextSecond,
    };
  }

  const nextTree = mergeNode(state.tree);
  return {
    ok: true,
    value: {
      ...state,
      revision: state.revision + 1,
      params: {
        ...state.params,
        count: countLeaves(nextTree),
      },
      tree: nextTree,
    },
  };
}

export function toggleLeafLock(state: BentoDocumentState, slotId: string): BentoDocumentState {
  function walk(node: BspNode): BspNode {
    if (node.kind === 'leaf') {
      return node.slotId === slotId ? { ...node, locked: !node.locked } : node;
    }
    const first = walk(node.first);
    const second = walk(node.second);
    if (first === node.first && second === node.second) {
      return node;
    }
    return { ...node, first, second };
  }

  return {
    ...state,
    revision: state.revision + 1,
    tree: walk(state.tree),
  };
}

export function setLeafRole(
  state: BentoDocumentState,
  slotId: string,
  role: CellRole
): BentoDocumentState {
  function walk(node: BspNode): BspNode {
    if (node.kind === 'leaf') {
      if (node.slotId === slotId) {
        return { ...node, role };
      }
      if (role === 'hero' && node.role === 'hero') {
        return { ...node, role: 'standard' };
      }
      return node;
    }
    const first = walk(node.first);
    const second = walk(node.second);
    if (first === node.first && second === node.second) {
      return node;
    }
    return { ...node, first, second };
  }

  return {
    ...state,
    revision: state.revision + 1,
    tree: walk(state.tree),
  };
}

export function setLeafShapeKind(
  state: BentoDocumentState,
  slotId: string,
  shapeKind: CellShapeKind
): BentoDocumentState {
  function walk(node: BspNode): BspNode {
    if (node.kind === 'leaf') {
      if (node.slotId === slotId) {
        if (shapeKind === 'rect') {
          const { shapeKind: _removed, ...rest } = node;
          return rest;
        }
        return { ...node, shapeKind };
      }
      return node;
    }
    const first = walk(node.first);
    const second = walk(node.second);
    if (first === node.first && second === node.second) {
      return node;
    }
    return { ...node, first, second };
  }

  return {
    ...state,
    revision: state.revision + 1,
    tree: walk(state.tree),
  };
}

export function deleteLeafFromTree(
  state: BentoDocumentState,
  slotId: string
): BentoDocumentState | null {
  const surviving = new Set(
    collectLeaves(state.tree)
      .map((l) => l.slotId)
      .filter((id) => id !== slotId)
  );
  return reflowMissingSlots(state, surviving);
}

export type MirrorDirection = 'horizontal' | 'vertical';

/**
 * Mirrors unlocked BSP splits horizontally (Left <-> Right) or vertically (Top <-> Bottom),
 * preserving exact Swiss track alignment, internal gutters, slotIds, and locked 0.00pt invariant.
 */
export function mirrorBentoLayout(
  state: BentoDocumentState,
  direction: MirrorDirection
): BentoResult<BentoDocumentState> {
  const targetAxis: SplitAxis = direction === 'horizontal' ? 'vertical' : 'horizontal';
  let mutated = false;

  function mirrorNode(node: BspNode): BspNode {
    if (node.kind === 'leaf') {
      return node;
    }
    if (hasLockedDescendant(node)) {
      // Never move a locked descendant; still mirror completely unlocked sibling subtrees
      const first = hasLockedDescendant(node.first) ? mirrorNode(node.first) : mirrorNode(node.first);
      const second = hasLockedDescendant(node.second)
        ? mirrorNode(node.second)
        : mirrorNode(node.second);
      if (first === node.first && second === node.second) {
        return node;
      }
      return { ...node, first, second };
    }

    const nextFirst = mirrorNode(node.first);
    const nextSecond = mirrorNode(node.second);

    if (node.axis === targetAxis) {
      mutated = true;
      return {
        ...node,
        ratio: round4(1 - node.ratio),
        first: nextSecond,
        second: nextFirst,
      };
    }

    if (nextFirst === node.first && nextSecond === node.second) {
      return node;
    }
    return { ...node, first: nextFirst, second: nextSecond };
  }

  const mirrored = mirrorNode(state.tree);
  if (!mutated && hasLockedDescendant(state.tree)) {
    return {
      ok: false,
      errorCode: 'ALL_CELLS_LOCKED',
      message: 'Unlock cards before flipping this layout.',
    };
  }

  const nextSculpt = mirrorSculptOverlay(state.sculpt, direction);
  const sculptChanged = nextSculpt !== state.sculpt;

  if (!mutated && !sculptChanged) {
    return { ok: true, value: state };
  }

  return {
    ok: true,
    value: {
      ...state,
      revision: state.revision + 1,
      tree: mirrored,
      ...(nextSculpt ? { sculpt: nextSculpt } : {}),
    },
  };
}

export interface ResizeSplitOptions {
  /** Magnetically snap within +-snapTolerance of Swiss harmonic ratios (default true) */
  snapHarmonic?: boolean;
  snapTolerance?: number;
}

export interface ResizeSplitResult {
  state: BentoDocumentState;
  appliedRatio: number;
  snappedTo: number | null;
  snappedGridTrack: GridTrackSnapResult | null;
}

/**
 * Interactive split-gutter resize: mutates a single BspSplitNode's ratio in-place while
 * snapping onto the active global Swiss grid tracks (or harmonic fractions in Free mode),
 * preserving exact perimeter fit, internal gutter, minW/minH floor, and locked-cell immutability.
 */
export function resizeSplitRatio(
  state: BentoDocumentState,
  nodeId: string,
  desiredRatio: number,
  options?: ResizeSplitOptions
): ResizeSplitResult {
  const handles = resolveSplitHandles(state.tree, state.anchorRect, state.params.gutterPt);
  const handle = handles.find((h) => h.nodeId === nodeId);

  if (!handle || handle.locked) {
    return {
      state,
      appliedRatio: handle?.ratio ?? 0.5,
      snappedTo: null,
      snappedGridTrack: null,
    };
  }

  const snapHarmonic = options?.snapHarmonic ?? true;
  const snapTolerance = options?.snapTolerance ?? 0.018;

  let targetRatio = Math.max(handle.minRatio, Math.min(handle.maxRatio, desiredRatio));
  let snappedTo: number | null = null;
  let snappedGridTrack: GridTrackSnapResult | null = null;

  const { minW, minH } = computeMinCellDimensions(state.anchorRect);
  const minSide = handle.axis === 'vertical' ? minW : minH;

  if (snapHarmonic) {
    // 1. Prefer snapping to the active global Swiss modular grid lattice when gridSystem !== 'free'
    const lattice = computeGridLattice(
      state.anchorRect,
      state.params.gutterPt,
      state.params.gridSystem
    );
    if (lattice) {
      const findSplitNode = (node: BspNode): BspSplitNode | null => {
        if (node.kind === 'leaf') return null;
        if (node.nodeId === nodeId) return node;
        return findSplitNode(node.first) ?? findSplitNode(node.second);
      };
      const splitNode = findSplitNode(state.tree);
      if (splitNode) {
        const minFirst = computeSubtreeMinSpan(
          splitNode.first,
          handle.axis,
          state.params.gutterPt,
          minSide
        );
        const minSecond = computeSubtreeMinSpan(
          splitNode.second,
          handle.axis,
          state.params.gutterPt,
          minSide
        );
        const gridSnap = snapRatioToGridLattice(
          lattice,
          handle.parentRect,
          handle.axis,
          targetRatio,
          minFirst,
          minSecond
        );
        if (gridSnap) {
          snappedGridTrack = gridSnap;
          targetRatio = gridSnap.ratio;
          snappedTo = gridSnap.ratio;
        }
      }
    }

    // 2. Fallback to local harmonic fractions when in Free mode
    if (!snappedGridTrack) {
      let closestDist = snapTolerance;
      for (const hRatio of HARMONIC_RATIOS) {
        if (hRatio >= handle.minRatio && hRatio <= handle.maxRatio) {
          const dist = Math.abs(targetRatio - hRatio);
          if (dist <= closestDist) {
            closestDist = dist;
            snappedTo = hRatio;
          }
        }
      }
      if (snappedTo !== null) {
        targetRatio = snappedTo;
      }
    }
  }

  const avail =
    handle.axis === 'vertical'
      ? Math.max(0, round2(handle.parentRect.width - state.params.gutterPt))
      : Math.max(0, round2(handle.parentRect.height - state.params.gutterPt));

  const safeRatio = round4(
    clampSplitRatioForRounding(
      handle.axis === 'vertical' ? handle.parentRect.width : handle.parentRect.height,
      state.params.gutterPt,
      minSide,
      targetRatio
    )
  );

  const updateNode = (node: BspNode): BspNode => {
    if (node.kind === 'leaf') return node;
    if (node.nodeId === nodeId) {
      return { ...node, ratio: safeRatio };
    }
    const first = updateNode(node.first);
    const second = updateNode(node.second);
    if (first === node.first && second === node.second) return node;
    return { ...node, first, second };
  };

  if (avail <= 0 || Math.abs(safeRatio - handle.ratio) < 0.0001) {
    return { state, appliedRatio: handle.ratio, snappedTo, snappedGridTrack };
  }

  const candidateTree = updateNode(state.tree);
  const candidateLeaves = resolveTreeLayout(
    candidateTree,
    state.anchorRect,
    state.params.gutterPt
  );
  const breachesFloor = candidateLeaves.some(
    (l) => l.rect.width < minW || l.rect.height < minH
  );

  if (breachesFloor) {
    return { state, appliedRatio: handle.ratio, snappedTo: null, snappedGridTrack: null };
  }

  return {
    state: {
      ...state,
      revision: state.revision + 1,
      tree: candidateTree,
    },
    appliedRatio: safeRatio,
    snappedTo,
    snappedGridTrack,
  };
}
