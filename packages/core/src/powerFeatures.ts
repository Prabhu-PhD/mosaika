import {
  type BentoDocumentState,
  type BentoResult,
  type EntranceAnimationPreset,
  type EntranceAnimationSpec,
  type ExistingShapeSummary,
  type LayoutIntent,
  type MosaikafyPayload,
  type MosaikafySlotAssignment,
  type RectPt,
  type SavedBentoBlueprint,
} from '@bento/contract';
import { createIntentBentoDocument, countLeaves } from './bsp.js';
import { buildCellRenderSpecs } from './diff.js';
import { computeAutoFitRect, round2 } from './geometry.js';
import { createDeterministicBentoId } from './prng.js';
import { computeStylePayload } from './styles.js';

export interface EntranceAnimationPresetMeta {
  id: EntranceAnimationPreset;
  label: string;
  caption: string;
  durationSec: number;
  staggerSec: number;
}

export const ENTRANCE_ANIMATION_PRESETS: readonly EntranceAnimationPresetMeta[] = [
  {
    id: 'fade-cascade',
    label: 'Fade Cascade',
    caption: 'Soft sequential opacity reveal',
    durationSec: 0.45,
    staggerSec: 0.08,
  },
  {
    id: 'rise-stagger',
    label: 'Rise Stagger',
    caption: 'Upward glide with Swiss rhythm',
    durationSec: 0.5,
    staggerSec: 0.1,
  },
  {
    id: 'zoom-pop',
    label: 'Zoom Pop',
    caption: 'Crisp scale-in hero then tiles',
    durationSec: 0.38,
    staggerSec: 0.07,
  },
  {
    id: 'wipe-editorial',
    label: 'Editorial Wipe',
    caption: 'Directional Swiss curtain reveal',
    durationSec: 0.55,
    staggerSec: 0.09,
  },
] as const;

/**
 * Computes a clean, bounded anchor rectangle for Mosaika-fying 2+ existing slide shapes.
 * Uses the union bounding box of the selected shapes clamped inside slideBounds,
 * falling back to the spacious Auto-Fit content area when the selected shapes are
 * tightly stacked or smaller than 35% of the slide along either axis.
 */
export function computeMosaikafyAnchorRect(
  shapes: readonly ExistingShapeSummary[],
  slideBounds: RectPt
): RectPt {
  const autoRect = computeAutoFitRect(slideBounds);
  if (shapes.length === 0) {
    return autoRect;
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const s of shapes) {
    minX = Math.min(minX, s.rect.left);
    minY = Math.min(minY, s.rect.top);
    maxX = Math.max(maxX, s.rect.left + s.rect.width);
    maxY = Math.max(maxY, s.rect.top + s.rect.height);
  }

  const clampedLeft = Math.max(slideBounds.left + 12, minX);
  const clampedTop = Math.max(slideBounds.top + 12, minY);
  const clampedRight = Math.min(slideBounds.left + slideBounds.width - 12, maxX);
  const clampedBottom = Math.min(slideBounds.top + slideBounds.height - 12, maxY);

  const unionW = clampedRight - clampedLeft;
  const unionH = clampedBottom - clampedTop;

  if (unionW < slideBounds.width * 0.35 || unionH < slideBounds.height * 0.35) {
    return autoRect;
  }

  return {
    left: round2(clampedLeft),
    top: round2(clampedTop),
    width: round2(unionW),
    height: round2(unionH),
  };
}

/**
 * Deterministically ranks existing slide shapes so the visually dominant shape
 * (largest area / richest text / image) becomes the Hero slot, and remaining shapes
 * follow natural top-to-bottom, left-to-right reading order.
 */
export function rankShapesForMosaikafy(
  shapes: readonly ExistingShapeSummary[]
): ExistingShapeSummary[] {
  if (shapes.length <= 1) return [...shapes];

  const importance = (s: ExistingShapeSummary): number =>
    s.rect.width * s.rect.height + s.textLength * 18 + (s.hasImage ? 12000 : 0);

  let heroIdx = 0;
  let bestScore = -1;
  for (let i = 0; i < shapes.length; i++) {
    const score = importance(shapes[i]!);
    if (score > bestScore) {
      bestScore = score;
      heroIdx = i;
    }
  }

  const hero = shapes[heroIdx]!;
  const rest = shapes.filter((_, idx) => idx !== heroIdx);
  const ROW_BAND_PT = 28;
  rest.sort((a, b) => {
    const yDiff = a.rect.top - b.rect.top;
    if (Math.abs(yDiff) > ROW_BAND_PT) {
      return yDiff;
    }
    const xDiff = a.rect.left - b.rect.left;
    if (Math.abs(xDiff) > 0.5) {
      return xDiff;
    }
    return a.shapeId.localeCompare(b.shapeId);
  });

  return [hero, ...rest];
}

export interface BuildMosaikafyOptions {
  supportsShadows: boolean;
  supportsCustomGeometry: boolean;
  isDarkTheme: boolean;
  seed?: number;
}

/**
 * Generates a bounded Bento layout and non-destructive slot-assignment plan to
 * re-home existing slide shapes into a crisp Swiss Bento grid without losing text or images.
 */
export function buildMosaikafyPayload(
  shapes: readonly ExistingShapeSummary[],
  slideBounds: RectPt,
  intent: LayoutIntent,
  options: BuildMosaikafyOptions
): BentoResult<{ state: BentoDocumentState; payload: MosaikafyPayload }> {
  const anchorRect = computeMosaikafyAnchorRect(shapes, slideBounds);
  const targetCount = Math.max(2, Math.min(12, shapes.length));
  const seed = options.seed ?? 48219 + targetCount * 137;

  const created = createIntentBentoDocument(anchorRect, intent, {
    count: targetCount,
    seed,
  });
  if (!created.ok) {
    return created;
  }

  const state = created.value;
  const cells = buildCellRenderSpecs(state, {
    supportsCustomGeometry: options.supportsCustomGeometry,
  });
  const stylePayload = computeStylePayload(state, {
    supportsShadows: options.supportsShadows,
    isDarkTheme: options.isDarkTheme,
    commitUndoEntry: true,
  });

  const rankedShapes = rankShapesForMosaikafy(shapes);
  // Put Hero cell first so the most prominent existing shape maps straight to the Hero slot
  const orderedCells = [...cells].sort((a, b) => {
    if (a.role === 'hero' && b.role !== 'hero') return -1;
    if (b.role === 'hero' && a.role !== 'hero') return 1;
    return a.zOrderIndex - b.zOrderIndex;
  });

  const pairCount = Math.min(rankedShapes.length, orderedCells.length);
  const assignments: MosaikafySlotAssignment[] = [];
  for (let i = 0; i < pairCount; i++) {
    assignments.push({
      sourceShapeId: rankedShapes[i]!.shapeId,
      targetSlotId: orderedCells[i]!.slotId,
    });
  }

  return {
    ok: true,
    value: {
      state,
      payload: {
        bentoId: state.bentoId,
        assignments,
        cells,
        stylePayload,
        commitUndoEntry: true,
      },
    },
  };
}

/**
 * Builds a deterministic staggered entrance animation timeline for a Bento grid,
 * revealing the Hero card first followed by supporting cards in reading order.
 */
export function buildEntranceAnimationSpec(
  doc: BentoDocumentState,
  preset: EntranceAnimationPreset,
  options?: { supportsCustomGeometry?: boolean; durationSec?: number; staggerSec?: number }
): EntranceAnimationSpec {
  const specs = buildCellRenderSpecs(doc, {
    supportsCustomGeometry: options?.supportsCustomGeometry ?? true,
  });

  const ordered = [...specs].sort((a, b) => {
    if (a.role === 'hero' && b.role !== 'hero') return -1;
    if (b.role === 'hero' && a.role !== 'hero') return 1;
    return a.zOrderIndex - b.zOrderIndex;
  });

  if (preset === 'none') {
    return {
      preset: 'none',
      durationSec: 0,
      staggerSec: 0,
      orderedSlotIds: ordered.map((c) => c.slotId),
    };
  }

  const meta =
    ENTRANCE_ANIMATION_PRESETS.find((p) => p.id === preset) ?? ENTRANCE_ANIMATION_PRESETS[0]!;

  return {
    preset,
    durationSec: options?.durationSec ?? meta.durationSec,
    staggerSec: options?.staggerSec ?? meta.staggerSec,
    orderedSlotIds: ordered.map((c) => c.slotId),
  };
}

/**
 * Deep-clones a live BentoDocumentState into a portable personal Library blueprint.
 * Pure deterministic function: caller supplies id & createdAtIso so @bento/core
 * remains 100% free of Date.now() / Math.random().
 */
export function createSavedBlueprint(
  name: string,
  doc: BentoDocumentState,
  id: string,
  createdAtIso: string
): SavedBentoBlueprint {
  const cloned = JSON.parse(JSON.stringify(doc)) as BentoDocumentState;
  const cleanName = name.trim() || `${doc.params.intent} (${countLeaves(doc.tree)} cards)`;

  return {
    id,
    name: cleanName.slice(0, 48),
    createdAtIso,
    intent: doc.params.intent,
    cellCount: countLeaves(doc.tree),
    docSnapshot: {
      ...cloned,
      revision: 1,
    },
  };
}

/**
 * Instantiates a user-saved personal blueprint onto any target slide/artboard anchorRect,
 * optionally preserving the active Bento's identity & visual style when swapping in-place.
 */
export function instantiateSavedBlueprint(
  blueprint: SavedBentoBlueprint,
  anchorRect: RectPt,
  existingDoc?: BentoDocumentState | null
): BentoDocumentState {
  const cloned = JSON.parse(JSON.stringify(blueprint.docSnapshot)) as BentoDocumentState;

  if (existingDoc) {
    return {
      ...cloned,
      bentoId: existingDoc.bentoId,
      revision: existingDoc.revision + 1,
      anchorRect: { ...anchorRect },
      params: {
        ...cloned.params,
        stylePreset: existingDoc.params.stylePreset,
        hierarchyMode: existingDoc.params.hierarchyMode,
        morphEnabled: existingDoc.params.morphEnabled,
      },
    };
  }

  return {
    ...cloned,
    bentoId: createDeterministicBentoId(cloned.params.seed, anchorRect),
    revision: 1,
    anchorRect: { ...anchorRect },
  };
}
