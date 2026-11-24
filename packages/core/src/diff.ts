import {
  BENTO_SCHEMA_VERSION,
  BENTO_TAGS,
  type BentoDocumentState,
  type CellRenderSpec,
  type LayoutDiffPayload,
  type MultiSlideItem,
  type MultiSlideMode,
} from '@bento/contract';
import { collectLeaves, createBentoDocument } from './bsp.js';
import {
  computeCornerAdjustment,
  computeMaxCount,
} from './geometry.js';
import { DECK_BUILDER_INTENT_ARC, getIntentDefinition } from './intents.js';
import { nextDeterministicSeed } from './prng.js';
import { resolveVisualCells } from './shapes.js';
import { computeStylePayload, type ComputeStyleOptions } from './styles.js';

export function formatCellShapeName(indexZeroBased: number, morphEnabled: boolean): string {
  const num = String(indexZeroBased + 1).padStart(2, '0');
  return morphEnabled ? `!!bento_${num}` : `Bento Card ${num}`;
}

export function buildBentoTags(
  state: BentoDocumentState,
  slotId: string,
  serializedState: string
): Record<string, string> {
  return {
    [BENTO_TAGS.SCHEMA]: BENTO_SCHEMA_VERSION,
    [BENTO_TAGS.ID]: state.bentoId,
    [BENTO_TAGS.SLOT_ID]: slotId,
    [BENTO_TAGS.REV]: String(state.revision),
    [BENTO_TAGS.STATE]: serializedState,
  };
}

/**
 * Builds deterministically ordered CellRenderSpecs (reading order + cornerAdjustment + hints + tags).
 */
export function buildCellRenderSpecs(
  state: BentoDocumentState,
  options?: { supportsCustomGeometry?: boolean }
): CellRenderSpec[] {
  const visualCells = resolveVisualCells(state, options);
  const serializedState = JSON.stringify(state);

  return visualCells.map((cell, idx) => ({
    slotId: cell.slotId,
    rect: cell.rect,
    cornerAdjustment: computeCornerAdjustment(state.params.radiusPt, cell.rect),
    ...(cell.shapeKind !== 'rect' ? { shapeKind: cell.shapeKind } : {}),
    ...(cell.svgPath ? { svgPath: cell.svgPath } : {}),
    shapeName: formatCellShapeName(idx, state.params.morphEnabled),
    role: cell.role,
    locked: cell.locked,
    zOrderIndex: idx,
    ...(cell.contentHint ? { contentHint: cell.contentHint } : {}),
    tags: buildBentoTags(state, cell.slotId, serializedState),
  }));
}

export interface ComputeLayoutDiffOptions {
  deletePlaceholderSelection?: boolean;
  commitUndoEntry: boolean;
  supportsCustomGeometry?: boolean;
}

/**
 * Computes a non-destructive diff between existing live slide slots and nextState.
 */
export function computeLayoutDiff(
  _prevState: BentoDocumentState | null,
  nextState: BentoDocumentState,
  existingSlideSlots: ReadonlySet<string>,
  options: ComputeLayoutDiffOptions
): LayoutDiffPayload {
  const nextSpecs = buildCellRenderSpecs(nextState, {
    supportsCustomGeometry: options.supportsCustomGeometry,
  });
  const nextSlotSet = new Set<string>();

  const create: CellRenderSpec[] = [];
  const update: CellRenderSpec[] = [];

  for (const spec of nextSpecs) {
    nextSlotSet.add(spec.slotId);
    if (existingSlideSlots.has(spec.slotId)) {
      update.push(spec);
    } else {
      create.push(spec);
    }
  }

  const retireSlotIds: string[] = [];
  for (const existingSlot of existingSlideSlots) {
    if (!nextSlotSet.has(existingSlot)) {
      retireSlotIds.push(existingSlot);
    }
  }

  return {
    bentoId: nextState.bentoId,
    deletePlaceholderSelection: options.deletePlaceholderSelection ?? false,
    create,
    update,
    retireSlotIds,
    commitUndoEntry: options.commitUndoEntry,
  };
}

/**
 * Safely parses and validates a serialized BentoDocumentState from Shape.Tags[BENTO_STATE].
 * Backfills intent='freeform' cleanly if hydrating legacy schema 1.0 JSON.
 */
export function hydrateStateFromJson(json: string): BentoDocumentState | null {
  try {
    const parsed: unknown = JSON.parse(json);
    if (typeof parsed !== 'object' || parsed === null) {
      return null;
    }
    const candidate = parsed as Partial<BentoDocumentState>;
    if (
      candidate.schemaVersion !== BENTO_SCHEMA_VERSION ||
      typeof candidate.bentoId !== 'string' ||
      typeof candidate.revision !== 'number' ||
      typeof candidate.nextSlotSeq !== 'number' ||
      !candidate.anchorRect ||
      !candidate.params ||
      !candidate.tree
    ) {
      return null;
    }
    const safeParams = {
      ...candidate.params,
      intent: candidate.params.intent ?? 'freeform',
      gridSystem: candidate.params.gridSystem ?? 'swiss-12x6',
    };
    return {
      ...(candidate as BentoDocumentState),
      params: safeParams,
    };
  } catch {
    return null;
  }
}

/**
 * Detects leaves present in state.tree that have been deleted from the slide.
 */
export function detectMissingSlots(
  state: BentoDocumentState,
  survivingSlotIds: readonly string[]
): string[] {
  const survivingSet = new Set(survivingSlotIds);
  return collectLeaves(state.tree)
    .map((leaf) => leaf.slotId)
    .filter((slotId) => !survivingSet.has(slotId));
}

export interface MultiSlideGenOptions {
  mode: MultiSlideMode;
  slideCount: number; // 2..12
  morphNamingEnabled: boolean;
  supportsAutoMorph: boolean;
  styleOptions: Omit<ComputeStyleOptions, 'commitUndoEntry'>;
}

/**
 * Generates deterministic MultiSlideItems:
 * - Exploration: explores seed variations strictly within the active Intent.
 * - Deck Builder: builds a coherent narrative arc across Intents (Executive -> KPI -> Showcase -> Editorial -> Compare).
 */
export function generateMultiSlideItems(
  baseState: BentoDocumentState,
  options: MultiSlideGenOptions
): MultiSlideItem[] {
  const clampedSlideCount = Math.max(2, Math.min(12, Math.round(options.slideCount)));
  const maxCount = computeMaxCount(baseState.anchorRect, baseState.params.gutterPt);
  const items: MultiSlideItem[] = [];

  let runningSeed = baseState.params.seed;

  for (let i = 0; i < clampedSlideCount; i++) {
    runningSeed = nextDeterministicSeed(runningSeed);
    const slideIntent =
      options.mode === 'exploration'
        ? baseState.params.intent
        : DECK_BUILDER_INTENT_ARC[i % DECK_BUILDER_INTENT_ARC.length]!;

    const intentRec = getIntentDefinition(slideIntent).recommendedParams;
    const targetCount =
      options.mode === 'exploration'
        ? baseState.params.count
        : Math.max(2, Math.min(maxCount, intentRec.count));

    const created = createBentoDocument(
      baseState.anchorRect,
      {
        ...baseState.params,
        intent: slideIntent,
        count: targetCount,
        heroBias: options.mode === 'exploration' ? baseState.params.heroBias : intentRec.heroBias,
        seed: runningSeed,
        morphEnabled: options.morphNamingEnabled,
      },
      { salt: i + 1 }
    );

    if (!created.ok) {
      continue;
    }

    const slideState = created.value;
    const cells = buildCellRenderSpecs(slideState);
    const stylePayload = computeStylePayload(slideState, {
      ...options.styleOptions,
      commitUndoEntry: true,
    });

    items.push({
      bentoId: slideState.bentoId,
      cells,
      stylePayload,
      applyMorphTransition: options.morphNamingEnabled && options.supportsAutoMorph,
    });
  }

  return items;
}
