import {
  BENTO_OFFSLIDE_OFFSET_PT,
  BENTO_STASH_MAX_WIDTH_PT,
  BENTO_STASH_ROW_STEP_PT,
  BENTO_STASH_TOP_START_PT,
  BENTO_TAG_KEYS,
  BENTO_TAGS,
  type CellRole,
  type CellShapeKind,
  type CellStyleSpec,
  type HostCapabilities,
  type IBentoHost,
  type LayoutDiffPayload,
  type MultiSlideItem,
  type RectPt,
  type SelectionContext,
  type StyleApplyPayload,
} from '@bento/contract';
import {
  computeLayoutDiff,
  hydrateStateFromJson,
  resizeSplitRatio,
  round2,
} from '@bento/core';

export type CapabilityProfileId = 'vsto' | 'officejs-110' | 'officejs-14';

export const CAPABILITY_PROFILES: Record<CapabilityProfileId, HostCapabilities> = {
  vsto: {
    platform: 'vsto',
    supportsCornerRadius: true,
    supportsNativeUndoGrouping: true,
    supportsLiveThemeBinding: true,
    supportsShadows: true,
    supportsAutoMorph: true,
    supportsSelectionEvents: true,
    supportsImageCropScrim: true,
    supportsSlideDuplication: true,
    supportsCustomGeometry: true,
  },
  'officejs-110': {
    platform: 'officejs',
    supportsCornerRadius: true,
    supportsNativeUndoGrouping: false,
    supportsLiveThemeBinding: true,
    supportsShadows: false,
    supportsAutoMorph: false,
    supportsSelectionEvents: false,
    supportsImageCropScrim: false,
    supportsSlideDuplication: false,
    supportsCustomGeometry: false,
  },
  'officejs-14': {
    platform: 'officejs',
    supportsCornerRadius: false,
    supportsNativeUndoGrouping: false,
    supportsLiveThemeBinding: false,
    supportsShadows: false,
    supportsAutoMorph: false,
    supportsSelectionEvents: false,
    supportsImageCropScrim: false,
    supportsSlideDuplication: false,
    supportsCustomGeometry: false,
  },
};

export const SLIDE_BOUNDS: RectPt = { left: 0, top: 0, width: 960, height: 540 };

export interface MockShape {
  id: string;
  kind: 'placeholder' | 'bento-card' | 'stashed';
  rect: RectPt;
  cornerAdjustment: number;
  shapeKind?: CellShapeKind;
  svgPath?: string;
  shapeName: string;
  role: CellRole;
  locked: boolean;
  zOrderIndex: number;
  contentHint?: string;
  tags: Record<string, string>;
  text: string;
  imageDataUrl?: string;
  hasScrim?: boolean;
  style: CellStyleSpec;
}

export interface MockSlide {
  id: string;
  title: string;
  subtitle: string;
  hasMorphTransition: boolean;
  hasChrome: boolean;
  shapes: MockShape[];
  selectedShapeIds: string[];
}

export interface DeckSnapshot {
  profile: CapabilityProfileId;
  capabilities: HostCapabilities;
  slides: MockSlide[];
  activeSlideIndex: number;
  version: number;
}

const DEFAULT_CARD_STYLE: CellStyleSpec = {
  slotId: '',
  fillHex: '#F4F5F7',
  borderColorHex: '#111827',
  borderWeightPt: 0.75,
  borderTransparency: 0.88,
  borderDashed: false,
  textColorHex: '#111827',
  shadow: null,
};

const PLACEHOLDER_STYLE: CellStyleSpec = {
  slotId: '',
  fillHex: '#EFF6FF',
  borderColorHex: '#2563EB',
  borderWeightPt: 1.5,
  borderTransparency: 0.2,
  borderDashed: true,
  textColorHex: '#1E3A8A',
  shadow: null,
};

export class MockBentoHost implements IBentoHost {
  private profile: CapabilityProfileId = 'vsto';
  private slides: MockSlide[];
  private activeSlideIndex = 0;
  private shapeSeq = 1;
  private slideSeq = 1;
  private version = 1;

  private deckListeners = new Set<() => void>();
  private selectionListeners = new Set<() => void>();

  constructor() {
    this.slides = [this.createInitialSlide()];
  }

  private createInitialSlide(): MockSlide {
    const id = `slide_${this.slideSeq++}`;
    return {
      id,
      title: 'Quarterly Product Overview',
      subtitle: 'Draw a bounding box below or click Auto-Fit Slide in Mosaika',
      hasMorphTransition: false,
      hasChrome: true,
      shapes: [],
      selectedShapeIds: [],
    };
  }

  private getActiveSlide(): MockSlide {
    return this.slides[this.activeSlideIndex] ?? this.slides[0]!;
  }

  private emitDeckChange(): void {
    this.version += 1;
    for (const listener of this.deckListeners) {
      listener();
    }
  }

  private emitSelectionChange(): void {
    this.emitDeckChange();
    if (this.getCapabilitiesSync().supportsSelectionEvents) {
      for (const listener of this.selectionListeners) {
        listener();
      }
    }
  }

  public subscribeDeck(listener: () => void): () => void {
    this.deckListeners.add(listener);
    return () => {
      this.deckListeners.delete(listener);
    };
  }

  public getSnapshot(): DeckSnapshot {
    return {
      profile: this.profile,
      capabilities: this.getCapabilitiesSync(),
      slides: this.slides.map((s) => ({
        ...s,
        shapes: s.shapes.map((sh) => ({ ...sh, rect: { ...sh.rect }, tags: { ...sh.tags } })),
        selectedShapeIds: [...s.selectedShapeIds],
      })),
      activeSlideIndex: this.activeSlideIndex,
      version: this.version,
    };
  }

  public getCapabilitiesSync(): HostCapabilities {
    return { ...CAPABILITY_PROFILES[this.profile] };
  }

  public setCapabilityProfile(profile: CapabilityProfileId): void {
    this.profile = profile;
    const caps = this.getCapabilitiesSync();
    // Reflect shadow/radius visual fallbacks cleanly on existing shapes when simulating legacy hosts
    const slide = this.getActiveSlide();
    if (!caps.supportsShadows) {
      for (const sh of slide.shapes) {
        if (sh.kind === 'bento-card' && sh.style.shadow) {
          sh.style = {
            ...sh.style,
            shadow: null,
            borderColorHex: '#E2E8F0',
            borderWeightPt: 0.75,
            borderTransparency: 0,
          };
        }
      }
    }
    this.emitDeckChange();
  }

  public setActiveSlide(index: number): void {
    if (index < 0 || index >= this.slides.length) {
      return;
    }
    this.activeSlideIndex = index;
    this.emitSelectionChange();
  }

  public resetDeck(): void {
    this.slideSeq = 1;
    this.shapeSeq = 1;
    this.slides = [this.createInitialSlide()];
    this.activeSlideIndex = 0;
    this.emitSelectionChange();
  }

  public addPlaceholderRect(rect: RectPt): string {
    const slide = this.getActiveSlide();
    const id = `shape_${this.shapeSeq++}`;
    const normalized: RectPt = {
      left: round2(Math.max(0, Math.min(SLIDE_BOUNDS.width - 20, rect.left))),
      top: round2(Math.max(0, Math.min(SLIDE_BOUNDS.height - 20, rect.top))),
      width: round2(Math.max(20, rect.width)),
      height: round2(Math.max(20, rect.height)),
    };

    const placeholder: MockShape = {
      id,
      kind: 'placeholder',
      rect: normalized,
      cornerAdjustment: 0,
      shapeName: `Bounding Area ${this.shapeSeq - 1}`,
      role: 'standard',
      locked: false,
      zOrderIndex: slide.shapes.length,
      tags: {},
      text: '',
      style: { ...PLACEHOLDER_STYLE },
    };

    slide.shapes.push(placeholder);
    slide.selectedShapeIds = [id];
    this.emitSelectionChange();
    return id;
  }

  public selectShapes(ids: string[]): void {
    const slide = this.getActiveSlide();
    const valid = new Set(slide.shapes.map((s) => s.id));
    slide.selectedShapeIds = ids.filter((id) => valid.has(id));
    this.emitSelectionChange();
  }

  public updateShapeText(shapeId: string, text: string): void {
    const slide = this.getActiveSlide();
    const shape = slide.shapes.find((s) => s.id === shapeId);
    if (!shape) return;
    shape.text = text;
    this.emitDeckChange();
  }

  public deleteShapeById(shapeId: string): void {
    const slide = this.getActiveSlide();
    const target = slide.shapes.find((s) => s.id === shapeId);
    if (!target) return;

    const deletedBentoId = target.tags[BENTO_TAGS.ID];
    slide.shapes = slide.shapes.filter((s) => s.id !== shapeId);
    slide.selectedShapeIds = slide.selectedShapeIds.filter((id) => id !== shapeId);

    // Keep active bento hydrated if another card from the same bento remains on the slide
    if (deletedBentoId && slide.selectedShapeIds.length === 0) {
      const sibling = slide.shapes.find((s) => s.tags[BENTO_TAGS.ID] === deletedBentoId);
      if (sibling) {
        slide.selectedShapeIds = [sibling.id];
      }
    }

    this.emitSelectionChange();
  }

  public deleteSelectedShapes(): void {
    const slide = this.getActiveSlide();
    if (slide.selectedShapeIds.length === 0) return;
    const toDelete = new Set(slide.selectedShapeIds);
    const deletedBentoId = slide.shapes.find(
      (s) => toDelete.has(s.id) && Boolean(s.tags[BENTO_TAGS.ID])
    )?.tags[BENTO_TAGS.ID];

    slide.shapes = slide.shapes.filter((s) => !toDelete.has(s.id));
    slide.selectedShapeIds = [];

    if (deletedBentoId) {
      const sibling = slide.shapes.find((s) => s.tags[BENTO_TAGS.ID] === deletedBentoId);
      if (sibling) {
        slide.selectedShapeIds = [sibling.id];
      }
    }

    this.emitSelectionChange();
  }

  /**
   * Direct slide-canvas gutter resize: updates the active bento's split ratio in-place,
   * preserving card text, corner radii, and mirrored BENTO_STATE tags.
   */
  public resizeActiveBentoSplit(
    bentoId: string,
    nodeId: string,
    nextRatio: number,
    snapHarmonic: boolean,
    commit: boolean
  ): void {
    const slide = this.getActiveSlide();
    const bentoShapes = slide.shapes.filter((s) => s.tags[BENTO_TAGS.ID] === bentoId);
    if (bentoShapes.length === 0) return;

    let highestRev = -1;
    let stateJson: string | undefined;
    const existingSlots = new Set<string>();
    for (const sh of bentoShapes) {
      const rev = Number.parseInt(sh.tags[BENTO_TAGS.REV] ?? '0', 10);
      if (rev >= highestRev && sh.tags[BENTO_TAGS.STATE]) {
        highestRev = rev;
        stateJson = sh.tags[BENTO_TAGS.STATE];
      }
      const slot = sh.tags[BENTO_TAGS.SLOT_ID];
      if (slot) existingSlots.add(slot);
    }

    if (!stateJson) return;
    const currentState = hydrateStateFromJson(stateJson);
    if (!currentState) return;

    const { state: nextState } = resizeSplitRatio(currentState, nodeId, nextRatio, {
      snapHarmonic,
    });
    if (nextState === currentState && !commit) return;

    const caps = this.getCapabilitiesSync();
    const diff = computeLayoutDiff(currentState, nextState, existingSlots, {
      commitUndoEntry: commit,
      supportsCustomGeometry: caps.supportsCustomGeometry,
    });

    for (const spec of diff.update) {
      const existing = slide.shapes.find(
        (s) =>
          s.tags[BENTO_TAGS.ID] === diff.bentoId &&
          s.tags[BENTO_TAGS.SLOT_ID] === spec.slotId
      );
      if (existing) {
        existing.rect = { ...spec.rect };
        if (caps.supportsCornerRadius) {
          existing.cornerAdjustment = spec.cornerAdjustment;
        }
        existing.shapeKind = caps.supportsCustomGeometry ? spec.shapeKind : undefined;
        existing.svgPath = caps.supportsCustomGeometry ? spec.svgPath : undefined;
        existing.tags = { ...spec.tags };
      }
    }

    if (commit) {
      this.emitSelectionChange();
    } else {
      this.emitDeckChange();
    }
  }

  // --- IBentoHost Implementation ---

  public async getCapabilities(): Promise<HostCapabilities> {
    return this.getCapabilitiesSync();
  }

  public async getSelectionContext(): Promise<SelectionContext> {
    const slide = this.getActiveSlide();
    const selectedShapes = slide.shapes.filter((s) => slide.selectedShapeIds.includes(s.id));

    // Check if any selected shape belongs to a Bento grid
    const selectedBentoShape = selectedShapes.find((s) => Boolean(s.tags[BENTO_TAGS.ID]));
    const activeBentoId = selectedBentoShape?.tags[BENTO_TAGS.ID];

    if (activeBentoId) {
      const bentoShapes = slide.shapes.filter((s) => s.tags[BENTO_TAGS.ID] === activeBentoId);
      let highestRev = -1;
      let hydratedStateJson: string | undefined;
      const seenSlots = new Set<string>();
      const survivingSlotIds: string[] = [];
      let hasDuplicateSlotConflict = false;

      for (const sh of bentoShapes) {
        const rev = Number.parseInt(sh.tags[BENTO_TAGS.REV] ?? '0', 10);
        if (rev >= highestRev && sh.tags[BENTO_TAGS.STATE]) {
          highestRev = rev;
          hydratedStateJson = sh.tags[BENTO_TAGS.STATE];
        }
        const slotId = sh.tags[BENTO_TAGS.SLOT_ID];
        if (slotId) {
          if (seenSlots.has(slotId)) {
            hasDuplicateSlotConflict = true;
          } else {
            seenSlots.add(slotId);
            survivingSlotIds.push(slotId);
          }
        }
      }

      const selectedSlotIds = selectedShapes
        .filter((s) => s.tags[BENTO_TAGS.ID] === activeBentoId)
        .map((s) => s.tags[BENTO_TAGS.SLOT_ID])
        .filter((v): v is string => Boolean(v));

      return {
        slideId: slide.id,
        slideBounds: { ...SLIDE_BOUNDS },
        selectedShapeCount: selectedShapes.length,
        activeBentoId,
        hydratedStateJson,
        survivingSlotIds,
        selectedSlotIds,
        hasDuplicateSlotConflict,
      };
    }

    const singlePlaceholder =
      selectedShapes.length === 1 && selectedShapes[0]!.kind === 'placeholder'
        ? selectedShapes[0]!
        : undefined;

    return {
      slideId: slide.id,
      slideBounds: { ...SLIDE_BOUNDS },
      selectedShapeCount: selectedShapes.length,
      selectedShapeBounds: singlePlaceholder ? { ...singlePlaceholder.rect } : undefined,
      survivingSlotIds: [],
      selectedSlotIds: [],
      hasDuplicateSlotConflict: false,
    };
  }

  public async applyLayoutDiff(diff: LayoutDiffPayload): Promise<{ stashedCount: number }> {
    const slide = this.getActiveSlide();
    const caps = this.getCapabilitiesSync();

    if (diff.deletePlaceholderSelection) {
      const selectedIds = new Set(slide.selectedShapeIds);
      slide.shapes = slide.shapes.filter(
        (s) => !(s.kind === 'placeholder' && selectedIds.has(s.id))
      );
      slide.selectedShapeIds = [];
    }

    // 1. Update existing shapes in-place (preserving user text & imagery!)
    for (const spec of diff.update) {
      const existing = slide.shapes.find(
        (s) =>
          s.tags[BENTO_TAGS.ID] === diff.bentoId &&
          s.tags[BENTO_TAGS.SLOT_ID] === spec.slotId
      );
      if (existing) {
        existing.rect = { ...spec.rect };
        if (caps.supportsCornerRadius) {
          existing.cornerAdjustment = spec.cornerAdjustment;
        }
        existing.shapeKind = caps.supportsCustomGeometry ? spec.shapeKind : undefined;
        existing.svgPath = caps.supportsCustomGeometry ? spec.svgPath : undefined;
        existing.shapeName = spec.shapeName;
        existing.role = spec.role;
        existing.locked = spec.locked;
        existing.zOrderIndex = spec.zOrderIndex;
        existing.contentHint = spec.contentHint;
        existing.tags = { ...spec.tags };
      }
    }

    // 2. Create new shapes
    const createdIds: string[] = [];
    for (const spec of diff.create) {
      const id = `shape_${this.shapeSeq++}`;
      const shape: MockShape = {
        id,
        kind: 'bento-card',
        rect: { ...spec.rect },
        cornerAdjustment: caps.supportsCornerRadius ? spec.cornerAdjustment : 0,
        shapeKind: caps.supportsCustomGeometry ? spec.shapeKind : undefined,
        svgPath: caps.supportsCustomGeometry ? spec.svgPath : undefined,
        shapeName: spec.shapeName,
        role: spec.role,
        locked: spec.locked,
        zOrderIndex: spec.zOrderIndex,
        contentHint: spec.contentHint,
        tags: { ...spec.tags },
        text: '',
        style: { ...DEFAULT_CARD_STYLE, slotId: spec.slotId },
      };
      slide.shapes.push(shape);
      createdIds.push(id);
    }

    // 3. Retire removed slots with non-destructive off-slide stashing (PRD 3.12 & Rule 4)
    let stashedCount = 0;
    const existingStashCount = slide.shapes.filter((s) => s.kind === 'stashed').length;
    let stashIdx = existingStashCount;

    for (const slotId of diff.retireSlotIds) {
      const targetIndex = slide.shapes.findIndex(
        (s) =>
          s.tags[BENTO_TAGS.ID] === diff.bentoId && s.tags[BENTO_TAGS.SLOT_ID] === slotId
      );
      if (targetIndex === -1) continue;
      const target = slide.shapes[targetIndex]!;
      const hasContent = target.text.trim().length > 0 || Boolean(target.imageDataUrl);

      if (!hasContent) {
        slide.shapes.splice(targetIndex, 1);
        slide.selectedShapeIds = slide.selectedShapeIds.filter((id) => id !== target.id);
      } else {
        // Strip BENTO_* tags and stash cleanly off-slide at x = slideWidth + 24pt (984pt)
        const nextTags = { ...target.tags };
        for (const key of BENTO_TAG_KEYS) {
          delete nextTags[key];
        }
        const scale =
          target.rect.width > BENTO_STASH_MAX_WIDTH_PT
            ? BENTO_STASH_MAX_WIDTH_PT / target.rect.width
            : 1;
        const stashedWidth = round2(Math.min(BENTO_STASH_MAX_WIDTH_PT, target.rect.width));
        const stashedHeight = round2(Math.max(76, Math.min(96, target.rect.height * scale)));

        target.kind = 'stashed';
        target.tags = nextTags;
        target.locked = false;
        target.shapeKind = undefined;
        target.svgPath = undefined;
        target.shapeName = `Stashed (${slotId})`;
        target.rect = {
          left: SLIDE_BOUNDS.width + BENTO_OFFSLIDE_OFFSET_PT,
          top: BENTO_STASH_TOP_START_PT + stashIdx * BENTO_STASH_ROW_STEP_PT,
          width: stashedWidth,
          height: stashedHeight,
        };
        slide.selectedShapeIds = slide.selectedShapeIds.filter((id) => id !== target.id);
        stashIdx += 1;
        stashedCount += 1;
      }
    }

    // Sort slide shapes by zOrderIndex
    slide.shapes.sort((a, b) => a.zOrderIndex - b.zOrderIndex);

    // Ensure newly created bento is selected so hydration remains active
    if (slide.selectedShapeIds.length === 0 && createdIds.length > 0) {
      slide.selectedShapeIds = [createdIds[0]!];
    }

    this.emitDeckChange();
    return { stashedCount };
  }

  public async applyStyle(bentoId: string, payload: StyleApplyPayload): Promise<void> {
    const slide = this.getActiveSlide();
    const styleBySlot = new Map(payload.cells.map((c) => [c.slotId, c]));

    for (const sh of slide.shapes) {
      if (sh.tags[BENTO_TAGS.ID] !== bentoId) continue;
      const slotId = sh.tags[BENTO_TAGS.SLOT_ID];
      if (!slotId) continue;
      const spec = styleBySlot.get(slotId);
      if (spec) {
        sh.style = { ...spec };
      }
    }
    this.emitDeckChange();
  }

  public async syncStyleFromSelected(bentoId: string): Promise<void> {
    const slide = this.getActiveSlide();
    const selectedShape = slide.shapes.find(
      (s) => slide.selectedShapeIds.includes(s.id) && s.tags[BENTO_TAGS.ID] === bentoId
    );
    if (!selectedShape) {
      return;
    }

    const sourceStyle = { ...selectedShape.style };
    for (const sh of slide.shapes) {
      if (sh.tags[BENTO_TAGS.ID] !== bentoId) continue;
      if (sh.role === 'standard') {
        sh.style = { ...sourceStyle, slotId: sh.tags[BENTO_TAGS.SLOT_ID] ?? '' };
      }
    }
    this.emitDeckChange();
  }

  public async setImageSlot(
    bentoId: string,
    slotId: string,
    imageBase64: string,
    addScrim: boolean
  ): Promise<void> {
    const slide = this.getActiveSlide();
    const caps = this.getCapabilitiesSync();
    const target = slide.shapes.find(
      (s) => s.tags[BENTO_TAGS.ID] === bentoId && s.tags[BENTO_TAGS.SLOT_ID] === slotId
    );
    if (!target) return;

    target.role = 'image';
    target.imageDataUrl = imageBase64;
    target.hasScrim = caps.supportsImageCropScrim ? addScrim : false;
    target.style = {
      ...target.style,
      textColorHex: '#FFFFFF',
    };
    this.emitDeckChange();
  }

  public async generateMultiSlides(
    items: MultiSlideItem[]
  ): Promise<{ createdSlideCount: number }> {
    const caps = this.getCapabilitiesSync();
    const sourceSlide = this.getActiveSlide();

    for (let i = 0; i < items.length; i++) {
      const item = items[i]!;
      const styleBySlot = new Map(item.stylePayload.cells.map((c) => [c.slotId, c]));
      const newSlideId = `slide_${this.slideSeq++}`;

      const shapes: MockShape[] = item.cells.map((spec) => ({
        id: `shape_${this.shapeSeq++}`,
        kind: 'bento-card',
        rect: { ...spec.rect },
        cornerAdjustment: caps.supportsCornerRadius ? spec.cornerAdjustment : 0,
        shapeKind: caps.supportsCustomGeometry ? spec.shapeKind : undefined,
        svgPath: caps.supportsCustomGeometry ? spec.svgPath : undefined,
        shapeName: spec.shapeName,
        role: spec.role,
        locked: spec.locked,
        zOrderIndex: spec.zOrderIndex,
        contentHint: spec.contentHint,
        tags: { ...spec.tags },
        text: '',
        style: styleBySlot.get(spec.slotId) ?? { ...DEFAULT_CARD_STYLE, slotId: spec.slotId },
      }));

      this.slides.push({
        id: newSlideId,
        title: caps.supportsSlideDuplication
          ? `${sourceSlide.title} (${i + 2})`
          : `Bento Variation ${i + 1}`,
        subtitle: caps.supportsSlideDuplication
          ? 'Duplicated slide chrome (VSTO Slide.Duplicate)'
          : 'Inserted matching slide master & layout (Office.js 1.3)',
        hasMorphTransition: item.applyMorphTransition,
        hasChrome: true,
        shapes,
        selectedShapeIds: shapes[0] ? [shapes[0].id] : [],
      });
    }

    this.emitDeckChange();
    return { createdSlideCount: items.length };
  }

  public async reorderReadingOrder(bentoId: string, orderedSlotIds: string[]): Promise<void> {
    const slide = this.getActiveSlide();
    const orderMap = new Map(orderedSlotIds.map((id, idx) => [id, idx]));

    for (const sh of slide.shapes) {
      if (sh.tags[BENTO_TAGS.ID] !== bentoId) continue;
      const slotId = sh.tags[BENTO_TAGS.SLOT_ID];
      if (slotId && orderMap.has(slotId)) {
        sh.zOrderIndex = orderMap.get(slotId)!;
      }
    }

    slide.shapes.sort((a, b) => a.zOrderIndex - b.zOrderIndex);
    this.emitDeckChange();
  }

  public async detachBento(bentoId: string): Promise<void> {
    const slide = this.getActiveSlide();
    for (const sh of slide.shapes) {
      if (sh.tags[BENTO_TAGS.ID] !== bentoId) continue;
      const nextTags = { ...sh.tags };
      for (const key of BENTO_TAG_KEYS) {
        delete nextTags[key];
      }
      sh.tags = nextTags;
      sh.locked = false;
    }
    this.emitSelectionChange();
  }

  public onSelectionChanged(handler: () => void): () => void {
    this.selectionListeners.add(handler);
    return () => {
      this.selectionListeners.delete(handler);
    };
  }
}
