import {
  BENTO_OFFSLIDE_OFFSET_PT,
  BENTO_STASH_MAX_WIDTH_PT,
  BENTO_STASH_ROW_STEP_PT,
  BENTO_STASH_TOP_START_PT,
  BENTO_TAG_KEYS,
  BENTO_TAGS,
  type CellRenderSpec,
  type CellStyleSpec,
  type HostCapabilities,
  type IBentoHost,
  type LayoutDiffPayload,
  type MosaikafyPayload,
  type MultiSlideItem,
  type RectPt,
  type SelectionContext,
  type StyleApplyPayload,
} from '@bento/contract';
import { DEFAULT_TEXTFRAME_STYLE, round2 } from '@bento/core';
import {
  createBrowserOfficeRuntime,
  type OfficeRequestContext,
  type OfficeRuntimeAdapter,
  type OfficeShape,
  type OfficeSlide,
} from './officeRuntime.js';

const DEFAULT_SLIDE_BOUNDS: RectPt = { left: 0, top: 0, width: 960, height: 540 };

function getTagMap(shape: OfficeShape): Map<string, string> {
  const map = new Map<string, string>();
  const items = shape.tags?.items ?? [];
  for (const item of items) {
    // Office.js normalizes tag keys to uppercase on some hosts; store uppercase for safe lookup
    map.set(item.key.toUpperCase(), item.value);
  }
  return map;
}

function readTag(tags: Map<string, string>, key: string): string | undefined {
  const val = tags.get(key.toUpperCase());
  return val && val.length > 0 ? val : undefined;
}

function applyCornerAdjustmentZeroBased(
  shape: OfficeShape,
  cornerAdjustment: number,
  has110: boolean
): void {
  if (!has110 || !shape.adjustments) return;
  const clamped = Math.max(0, Math.min(0.5, Number.isFinite(cornerAdjustment) ? cornerAdjustment : 0));
  try {
    if (typeof shape.adjustments.set === 'function') {
      // Rule 5: 0-based adjustments.set(0, a) in Office.js PowerPointApi 1.10
      shape.adjustments.set(0, clamped);
    } else if (typeof shape.adjustments.getItem === 'function') {
      const item = shape.adjustments.getItem(0);
      if (item) item.value = clamped;
    }
  } catch {
    // Gracefully skip on hosts that disallow adjustment writes
  }
}

function applyDefaultTextFrame(shape: OfficeShape): void {
  if (!shape.textFrame) return;
  shape.textFrame.leftMargin = DEFAULT_TEXTFRAME_STYLE.marginLeftPt;
  shape.textFrame.rightMargin = DEFAULT_TEXTFRAME_STYLE.marginRightPt;
  shape.textFrame.topMargin = DEFAULT_TEXTFRAME_STYLE.marginTopPt;
  shape.textFrame.bottomMargin = DEFAULT_TEXTFRAME_STYLE.marginBottomPt;
  shape.textFrame.wordWrap = true;
  shape.textFrame.verticalAlignment = 'Top';
}

function writeCellMetadata(shape: OfficeShape, spec: CellRenderSpec): void {
  if (spec.shapeName) {
    shape.name = spec.shapeName;
  }
  for (const [key, value] of Object.entries(spec.tags)) {
    shape.tags.add(key, value ?? '');
  }
}

function applyCellStyleToShape(shape: OfficeShape, style: CellStyleSpec): void {
  // Never overwrite an image fill on an image card
  if (shape.fill.type !== 'Image') {
    if (style.fillHex === null) {
      shape.fill.clear();
    } else {
      shape.fill.setSolidColor(style.fillHex);
    }
  }

  if (style.borderColorHex === null || style.borderWeightPt <= 0) {
    shape.lineFormat.visible = false;
  } else {
    shape.lineFormat.visible = true;
    shape.lineFormat.color = style.borderColorHex;
    shape.lineFormat.weight = style.borderWeightPt;
    shape.lineFormat.transparency = Math.max(0, Math.min(1, style.borderTransparency));
    shape.lineFormat.dashStyle = style.borderDashed ? 'Dash' : 'Solid';
  }

  if (shape.textFrame?.textRange?.font && style.textColorHex) {
    shape.textFrame.textRange.font.color = style.textColorHex;
  }
}

function stripBentoTags(shape: OfficeShape): void {
  for (const key of BENTO_TAG_KEYS) {
    try {
      shape.tags.delete(key);
    } catch {
      // Ignore absent tags
    }
  }
}

/**
 * Cross-platform Office.js implementation of IBentoHost (PRD Section 7.3).
 * Supports PowerPointApi 1.10 (live corner radius + slide bounds) and gracefully
 * degrades on PowerPointApi 1.4 Legacy (Mac/Web/older M365) with zero crashes.
 */
export class OfficeJsBentoHost implements IBentoHost {
  private readonly runtime: OfficeRuntimeAdapter;

  constructor(runtime: OfficeRuntimeAdapter = createBrowserOfficeRuntime()) {
    this.runtime = runtime;
  }

  public getOfficeTheme(): 'light' | 'dark' {
    return this.runtime.getOfficeTheme();
  }

  private hasPowerPointApi110(): boolean {
    return this.runtime.isRequirementSetSupported('PowerPointApi', '1.10');
  }

  public async getCapabilities(): Promise<HostCapabilities> {
    const has110 = this.hasPowerPointApi110();
    return {
      platform: 'officejs',
      supportsCornerRadius: has110,
      supportsNativeUndoGrouping: false,
      supportsLiveThemeBinding: has110,
      supportsShadows: false,
      supportsAutoMorph: false,
      supportsSelectionEvents: false,
      supportsImageCropScrim: false,
      supportsSlideDuplication: false,
      supportsCustomGeometry: false,
      supportsMosaikafy: true,
      supportsEntranceAnimations: false,
    };
  }

  private async resolveActiveSlideAndBounds(
    context: OfficeRequestContext,
    has110: boolean
  ): Promise<{ slide: OfficeSlide | null; slideBounds: RectPt }> {
    const selectedSlides = context.presentation.getSelectedSlides();
    selectedSlides.load('items/id');

    let pageSetupLoaded = false;
    if (has110 && context.presentation.pageSetup) {
      context.presentation.pageSetup.load('slideWidth,slideHeight');
      pageSetupLoaded = true;
    }

    await context.sync();

    let slide: OfficeSlide | null = selectedSlides.items[0] ?? null;
    if (!slide) {
      context.presentation.slides.load('items/id');
      await context.sync();
      slide = context.presentation.slides.items[0] ?? null;
    }

    let slideBounds = DEFAULT_SLIDE_BOUNDS;
    if (pageSetupLoaded && context.presentation.pageSetup) {
      const w = context.presentation.pageSetup.slideWidth;
      const h = context.presentation.pageSetup.slideHeight;
      if (typeof w === 'number' && w > 0 && typeof h === 'number' && h > 0) {
        slideBounds = { left: 0, top: 0, width: round2(w), height: round2(h) };
      }
    }

    return { slide, slideBounds };
  }

  public async getSelectionContext(): Promise<SelectionContext> {
    const has110 = this.hasPowerPointApi110();

    return this.runtime.run(async (context) => {
      const { slide, slideBounds } = await this.resolveActiveSlideAndBounds(context, has110);
      if (!slide) {
        return {
          slideId: '',
          slideBounds,
          selectedShapeCount: 0,
          survivingSlotIds: [],
          selectedSlotIds: [],
          hasDuplicateSlotConflict: false,
        };
      }

      const selectedShapes = context.presentation.getSelectedShapes();
      selectedShapes.load(
        'items/id,items/left,items/top,items/width,items/height,items/tags/items,items/fill/type,items/textFrame/textRange/text'
      );
      slide.shapes.load('items/id,items/left,items/top,items/width,items/height,items/tags/items');
      await context.sync();

      const selItems = selectedShapes.items ?? [];
      let activeBentoId: string | undefined;

      for (const sh of selItems) {
        const bid = readTag(getTagMap(sh), BENTO_TAGS.ID);
        if (bid) {
          activeBentoId = bid;
          break;
        }
      }

      if (activeBentoId) {
        let highestRev = -1;
        let hydratedStateJson: string | undefined;
        const seenSlots = new Set<string>();
        const survivingSlotIds: string[] = [];
        let hasDuplicateSlotConflict = false;

        for (const sh of slide.shapes.items ?? []) {
          const tags = getTagMap(sh);
          if (readTag(tags, BENTO_TAGS.ID) !== activeBentoId) continue;

          const revRaw = readTag(tags, BENTO_TAGS.REV);
          const stateRaw = readTag(tags, BENTO_TAGS.STATE);
          const rev = revRaw ? Number.parseInt(revRaw, 10) : -1;
          if (!Number.isNaN(rev) && rev >= highestRev && stateRaw) {
            highestRev = rev;
            hydratedStateJson = stateRaw;
          }

          const slotId = readTag(tags, BENTO_TAGS.SLOT_ID);
          if (slotId) {
            if (seenSlots.has(slotId)) {
              hasDuplicateSlotConflict = true;
            } else {
              seenSlots.add(slotId);
              survivingSlotIds.push(slotId);
            }
          }
        }

        const selectedSlotIds: string[] = [];
        for (const sh of selItems) {
          const tags = getTagMap(sh);
          if (readTag(tags, BENTO_TAGS.ID) !== activeBentoId) continue;
          const slotId = readTag(tags, BENTO_TAGS.SLOT_ID);
          if (slotId) selectedSlotIds.push(slotId);
        }

        return {
          slideId: slide.id,
          slideBounds,
          selectedShapeCount: selItems.length,
          activeBentoId,
          ...(hydratedStateJson ? { hydratedStateJson } : {}),
          survivingSlotIds,
          selectedSlotIds,
          hasDuplicateSlotConflict,
        };
      }

      const selectedShapeBounds =
        selItems.length === 1 && selItems[0]
          ? {
              left: round2(selItems[0].left),
              top: round2(selItems[0].top),
              width: round2(selItems[0].width),
              height: round2(selItems[0].height),
            }
          : undefined;

      const multiExisting =
        selItems.length >= 2
          ? selItems.map((sh) => ({
              shapeId: sh.id,
              rect: {
                left: round2(sh.left),
                top: round2(sh.top),
                width: round2(sh.width),
                height: round2(sh.height),
              },
              textLength: sh.textFrame?.textRange?.text?.length ?? 0,
              hasImage: sh.fill?.type === 'Image',
            }))
          : undefined;

      return {
        slideId: slide.id,
        slideBounds,
        selectedShapeCount: selItems.length,
        ...(selectedShapeBounds ? { selectedShapeBounds } : {}),
        ...(multiExisting ? { selectedShapes: multiExisting } : {}),
        survivingSlotIds: [],
        selectedSlotIds: [],
        hasDuplicateSlotConflict: false,
      };
    });
  }

  public async applyLayoutDiff(diff: LayoutDiffPayload): Promise<{ stashedCount: number }> {
    const has110 = this.hasPowerPointApi110();

    return this.runtime.run(async (context) => {
      const { slide, slideBounds } = await this.resolveActiveSlideAndBounds(context, has110);
      if (!slide) {
        throw new Error('No active PowerPoint slide found.');
      }

      slide.shapes.load(
        'items/id,items/name,items/left,items/top,items/width,items/height,items/tags/items,items/fill/type,items/textFrame/textRange/text'
      );

      let selectedShapes = null;
      if (diff.deletePlaceholderSelection) {
        selectedShapes = context.presentation.getSelectedShapes();
        selectedShapes.load('items/id,items/tags/items');
      }

      await context.sync();

      if (diff.deletePlaceholderSelection && selectedShapes) {
        for (const sh of selectedShapes.items ?? []) {
          if (!readTag(getTagMap(sh), BENTO_TAGS.ID)) {
            sh.delete();
          }
        }
      }

      const existingBySlot = new Map<string, OfficeShape>();
      let existingOffSlideCount = 0;

      for (const sh of slide.shapes.items ?? []) {
        if (sh.left >= slideBounds.width + 10) {
          existingOffSlideCount += 1;
        }
        const tags = getTagMap(sh);
        if (readTag(tags, BENTO_TAGS.ID) !== diff.bentoId) continue;
        const slotId = readTag(tags, BENTO_TAGS.SLOT_ID);
        if (slotId && !existingBySlot.has(slotId)) {
          existingBySlot.set(slotId, sh);
        }
      }

      // 1. Update surviving cards in-place (Rule 4: preserves text & imagery)
      for (const spec of diff.update) {
        const shape = existingBySlot.get(spec.slotId);
        if (!shape) continue;
        shape.left = spec.rect.left;
        shape.top = spec.rect.top;
        shape.width = Math.max(1, spec.rect.width);
        shape.height = Math.max(1, spec.rect.height);
        applyCornerAdjustmentZeroBased(shape, spec.cornerAdjustment, has110);
        writeCellMetadata(shape, spec);
      }

      // 2. Create new cards (Rule 5: Always RoundRectangle with 0-based adjustment)
      for (const spec of diff.create) {
        const created = slide.shapes.addGeometricShape('RoundRectangle', {
          left: spec.rect.left,
          top: spec.rect.top,
          width: Math.max(1, spec.rect.width),
          height: Math.max(1, spec.rect.height),
        });
        applyCornerAdjustmentZeroBased(created, spec.cornerAdjustment, has110);
        applyDefaultTextFrame(created);
        writeCellMetadata(created, spec);
        existingBySlot.set(spec.slotId, created);
      }

      // 3. Retire removed slots non-destructively (Rule 4: delete empty, stash non-empty off-slide)
      let stashedCount = 0;
      let stashIdx = existingOffSlideCount;

      for (const slotId of diff.retireSlotIds) {
        const shape = existingBySlot.get(slotId);
        if (!shape) continue;

        const text = shape.textFrame?.textRange?.text ?? '';
        const hasImage = shape.fill?.type === 'Image';
        const hasContent = text.trim().length > 0 || hasImage;

        if (hasContent) {
          stripBentoTags(shape);
          const scale =
            shape.width > BENTO_STASH_MAX_WIDTH_PT ? BENTO_STASH_MAX_WIDTH_PT / shape.width : 1;
          shape.left = slideBounds.width + BENTO_OFFSLIDE_OFFSET_PT;
          shape.top = BENTO_STASH_TOP_START_PT + stashIdx * BENTO_STASH_ROW_STEP_PT;
          shape.width = round2(Math.min(BENTO_STASH_MAX_WIDTH_PT, shape.width));
          shape.height = round2(Math.max(72, Math.min(96, shape.height * scale)));
          shape.name = `Stashed (${slotId})`;
          stashIdx += 1;
          stashedCount += 1;
        } else {
          shape.delete();
        }
      }

      await context.sync();
      return { stashedCount };
    });
  }

  public async applyStyle(bentoId: string, payload: StyleApplyPayload): Promise<void> {
    const has110 = this.hasPowerPointApi110();

    return this.runtime.run(async (context) => {
      const { slide } = await this.resolveActiveSlideAndBounds(context, has110);
      if (!slide) throw new Error('No active PowerPoint slide found.');

      slide.shapes.load('items/id,items/tags/items,items/fill/type');
      await context.sync();

      const bySlot = new Map<string, OfficeShape>();
      for (const sh of slide.shapes.items ?? []) {
        const tags = getTagMap(sh);
        if (readTag(tags, BENTO_TAGS.ID) !== bentoId) continue;
        const slotId = readTag(tags, BENTO_TAGS.SLOT_ID);
        if (slotId) bySlot.set(slotId, sh);
      }

      for (const cellStyle of payload.cells) {
        const shape = bySlot.get(cellStyle.slotId);
        if (!shape) continue;
        applyCellStyleToShape(shape, cellStyle);
      }

      await context.sync();
    });
  }

  public async syncStyleFromSelected(bentoId: string): Promise<void> {
    const has110 = this.hasPowerPointApi110();

    return this.runtime.run(async (context) => {
      const { slide } = await this.resolveActiveSlideAndBounds(context, has110);
      if (!slide) throw new Error('No active PowerPoint slide found.');

      const selected = context.presentation.getSelectedShapes();
      selected.load(
        'items/id,items/tags/items,items/fill/type,items/fill/foregroundColor,items/lineFormat/visible,items/lineFormat/color,items/lineFormat/weight,items/lineFormat/transparency,items/lineFormat/dashStyle,items/textFrame/textRange/font/color'
      );
      slide.shapes.load('items/id,items/tags/items,items/fill/type');
      await context.sync();

      const source = (selected.items ?? []).find(
        (sh) => readTag(getTagMap(sh), BENTO_TAGS.ID) === bentoId
      );
      if (!source) {
        throw new Error('Select a card inside the active Mosaika grid first.');
      }

      const styleSpec: CellStyleSpec = {
        slotId: '',
        fillHex: source.fill.type === 'NoFill' ? null : (source.fill.foregroundColor ?? '#F4F5F7'),
        borderColorHex: source.lineFormat.visible ? (source.lineFormat.color ?? null) : null,
        borderWeightPt: source.lineFormat.weight ?? 0,
        borderTransparency: source.lineFormat.transparency ?? 0,
        borderDashed: source.lineFormat.dashStyle === 'Dash',
        textColorHex: source.textFrame?.textRange?.font?.color ?? '#111827',
      };

      for (const sh of slide.shapes.items ?? []) {
        if (sh.id === source.id) continue;
        if (readTag(getTagMap(sh), BENTO_TAGS.ID) !== bentoId) continue;
        applyCellStyleToShape(sh, styleSpec);
      }

      await context.sync();
    });
  }

  public async setImageSlot(
    _bentoId: string,
    _slotId: string,
    _imageBase64: string,
    _addScrim: boolean
  ): Promise<void> {
    // PowerPoint Office.js does not yet expose shape.fill.setImageFill for geometric shapes
    throw new Error(
      'Direct shape picture fill requires desktop PowerPoint (Windows Mosaika). In PowerPoint Web/Mac, use Format Shape → Picture Fill.'
    );
  }

  public async generateMultiSlides(items: MultiSlideItem[]): Promise<{ createdSlideCount: number }> {
    if (!items.length) return { createdSlideCount: 0 };
    const has110 = this.hasPowerPointApi110();

    return this.runtime.run(async (context) => {
      const { slide } = await this.resolveActiveSlideAndBounds(context, has110);
      let slideMasterId: string | undefined;
      let layoutId: string | undefined;

      if (slide?.slideMaster && slide?.layout) {
        try {
          slide.slideMaster.load('id');
          slide.layout.load('id');
          await context.sync();
          slideMasterId = slide.slideMaster.id;
          layoutId = slide.layout.id;
        } catch {
          slideMasterId = undefined;
          layoutId = undefined;
        }
      }

      let createdSlideCount = 0;
      for (const item of items) {
        // PRD Section 7.3: Match active slide's slideMasterId + layoutId (PowerPointApi 1.3)
        const newSlide =
          slideMasterId && layoutId
            ? context.presentation.slides.add({ slideMasterId, layoutId })
            : context.presentation.slides.add();

        const styleBySlot = new Map(item.stylePayload.cells.map((c) => [c.slotId, c]));

        for (const spec of item.cells) {
          const card = newSlide.shapes.addGeometricShape('RoundRectangle', {
            left: spec.rect.left,
            top: spec.rect.top,
            width: Math.max(1, spec.rect.width),
            height: Math.max(1, spec.rect.height),
          });
          applyCornerAdjustmentZeroBased(card, spec.cornerAdjustment, has110);
          applyDefaultTextFrame(card);
          writeCellMetadata(card, spec);

          const style = styleBySlot.get(spec.slotId);
          if (style) {
            applyCellStyleToShape(card, style);
          }
        }

        createdSlideCount += 1;
      }

      await context.sync();
      return { createdSlideCount };
    });
  }

  public async reorderReadingOrder(bentoId: string, orderedSlotIds: string[]): Promise<void> {
    const has110 = this.hasPowerPointApi110();

    return this.runtime.run(async (context) => {
      const { slide } = await this.resolveActiveSlideAndBounds(context, has110);
      if (!slide) throw new Error('No active PowerPoint slide found.');

      slide.shapes.load('items/id,items/tags/items');
      await context.sync();

      const bySlot = new Map<string, OfficeShape>();
      for (const sh of slide.shapes.items ?? []) {
        const tags = getTagMap(sh);
        if (readTag(tags, BENTO_TAGS.ID) !== bentoId) continue;
        const slotId = readTag(tags, BENTO_TAGS.SLOT_ID);
        if (slotId) bySlot.set(slotId, sh);
      }

      for (const slotId of orderedSlotIds) {
        const shape = bySlot.get(slotId);
        if (shape && typeof shape.setZOrder === 'function') {
          shape.setZOrder('BringToFront');
        }
      }

      await context.sync();
    });
  }

  public async detachBento(bentoId: string): Promise<void> {
    const has110 = this.hasPowerPointApi110();

    return this.runtime.run(async (context) => {
      const { slide } = await this.resolveActiveSlideAndBounds(context, has110);
      if (!slide) throw new Error('No active PowerPoint slide found.');

      slide.shapes.load('items/id,items/tags/items');
      await context.sync();

      for (const sh of slide.shapes.items ?? []) {
        if (readTag(getTagMap(sh), BENTO_TAGS.ID) === bentoId) {
          stripBentoTags(sh);
        }
      }

      await context.sync();
    });
  }

  public async mosaikafySelection(payload: MosaikafyPayload): Promise<{ convertedCount: number }> {
    const has110 = this.hasPowerPointApi110();

    return this.runtime.run(async (context) => {
      const { slide } = await this.resolveActiveSlideAndBounds(context, has110);
      if (!slide) throw new Error('No active PowerPoint slide found.');

      slide.shapes.load(
        'items/id,items/name,items/left,items/top,items/width,items/height,items/tags/items,items/fill/type'
      );
      await context.sync();

      const byId = new Map<string, OfficeShape>();
      for (const sh of slide.shapes.items ?? []) {
        byId.set(sh.id, sh);
      }

      const cellBySlot = new Map(payload.cells.map((c) => [c.slotId, c]));
      const styleBySlot = new Map(payload.stylePayload.cells.map((c) => [c.slotId, c]));
      let convertedCount = 0;

      for (const assignment of payload.assignments) {
        const shape = byId.get(assignment.sourceShapeId);
        const spec = cellBySlot.get(assignment.targetSlotId);
        if (!shape || !spec) continue;

        shape.left = spec.rect.left;
        shape.top = spec.rect.top;
        shape.width = spec.rect.width;
        shape.height = spec.rect.height;
        applyCornerAdjustmentZeroBased(shape, spec.cornerAdjustment, has110);
        applyDefaultTextFrame(shape);
        writeCellMetadata(shape, spec);

        const style = styleBySlot.get(spec.slotId);
        if (style) {
          applyCellStyleToShape(shape, style);
        }
        convertedCount += 1;
      }

      await context.sync();
      return { convertedCount };
    });
  }
}
