import {
  BENTO_TAGS,
  type BentoDocumentState,
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
  buildCellRenderSpecs,
  computeLayoutDiff,
  computeStylePayload,
  createIntentBentoDocument,
  getAutoContrastTextColor,
  hydrateStateFromJson,
  resizeSplitRatio,
  round2,
} from '@bento/core';
import { CANVAS_PRESETS, computeArtboardContentRect } from './presets.js';

export interface StudioCard {
  id: string;
  slotId: string;
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

export interface StudioSnapshot {
  canvasWidth: number;
  canvasHeight: number;
  canvasPadding: number;
  canvasBgHex: string;
  brandAccentHex: string;
  presetId: string;
  cards: StudioCard[];
  selectedCardIds: string[];
  activeDoc: BentoDocumentState | null;
  version: number;
}

export interface ShareableStudioPayload {
  w: number;
  h: number;
  pad: number;
  bg: string;
  accent: string;
  state: BentoDocumentState;
  texts: Record<string, string>;
}

const STORAGE_KEY = 'mosaika_web_studio_v1';

const STUDIO_CAPABILITIES: HostCapabilities = {
  platform: 'browser-harness',
  supportsCornerRadius: true,
  supportsNativeUndoGrouping: false,
  supportsLiveThemeBinding: true,
  supportsShadows: true,
  supportsAutoMorph: false,
  supportsSelectionEvents: true,
  supportsImageCropScrim: true,
  supportsSlideDuplication: false,
  supportsCustomGeometry: true,
};

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

export class WebStudioHost implements IBentoHost {
  private canvasWidth: number;
  private canvasHeight: number;
  private canvasPadding: number;
  private canvasBgHex = '#FFFFFF';
  private brandAccentHex = '#1B1D1E';
  private presetId: string;
  private cards: StudioCard[] = [];
  private selectedCardIds: string[] = [];
  private activeDoc: BentoDocumentState | null = null;
  private cardSeq = 1;
  private version = 1;
  private isDarkTheme = false;
  private cachedSnapshot!: StudioSnapshot;

  private readonly stateListeners = new Set<() => void>();
  private readonly selectionListeners = new Set<() => void>();

  constructor(options?: { initialSharePayload?: ShareableStudioPayload | null; skipDefaultSeed?: boolean }) {
    const initialPreset = CANVAS_PRESETS[0]!;
    this.presetId = initialPreset.id;
    this.canvasWidth = initialPreset.width;
    this.canvasHeight = initialPreset.height;
    this.canvasPadding = initialPreset.defaultPadding;

    if (options?.initialSharePayload) {
      this.hydrateFromSharePayload(options.initialSharePayload);
    } else if (!this.tryRestoreFromLocalStorage() && !options?.skipDefaultSeed) {
      this.seedStarterLayout();
    }
    this.rebuildSnapshot();
  }

  private seedStarterLayout(): void {
    const rect = computeArtboardContentRect(this.canvasWidth, this.canvasHeight, this.canvasPadding);
    const created = createIntentBentoDocument(rect, 'executive-brief', {
      count: 5,
      gutterPt: 14,
      radiusPt: 16,
      seed: 48219,
      stylePreset: 'soft-modern',
      hierarchyMode: 'hero-accent',
    });
    if (!created.ok) return;

    this.applyDocumentDirectly(created.value, {
      slot_01: 'Mosaika Studio\nDesign bounded Swiss bento grids for web, social & print.',
      slot_02: '144 Blueprints\n12 intents + L-wraps & circles',
      slot_03: 'Vector Export\nFigma-ready SVG & 2× PNG',
      slot_04: 'Live Reflow\nSwitch 1440×900 to 1080×1080',
      slot_05: 'Tailwind Code\n1-click responsive HTML',
    });
  }

  private applyDocumentDirectly(
    doc: BentoDocumentState,
    initialTexts?: Record<string, string>
  ): void {
    this.activeDoc = doc;
    const specs = buildCellRenderSpecs(doc, { supportsCustomGeometry: true });
    const stylePayload = this.applyBrandAccentOverride(
      computeStylePayload(doc, {
        supportsShadows: true,
        isDarkTheme: this.isDarkTheme,
        commitUndoEntry: false,
      })
    );
    const styleBySlot = new Map(stylePayload.cells.map((c) => [c.slotId, c]));
    const prevBySlot = new Map(this.cards.map((c) => [c.slotId, c]));

    this.cards = specs.map((spec) => {
      const prev = prevBySlot.get(spec.slotId);
      return {
        id: prev?.id ?? `card_${this.cardSeq++}`,
        slotId: spec.slotId,
        rect: { ...spec.rect },
        cornerAdjustment: spec.cornerAdjustment,
        shapeKind: spec.shapeKind,
        svgPath: spec.svgPath,
        shapeName: spec.shapeName,
        role: spec.role,
        locked: spec.locked,
        zOrderIndex: spec.zOrderIndex,
        contentHint: spec.contentHint,
        tags: { ...spec.tags },
        text: initialTexts?.[spec.slotId] ?? prev?.text ?? '',
        imageDataUrl: prev?.imageDataUrl,
        hasScrim: prev?.hasScrim,
        style: styleBySlot.get(spec.slotId) ?? { ...DEFAULT_CARD_STYLE, slotId: spec.slotId },
      };
    });

    this.selectedCardIds = this.cards[0] ? [this.cards[0].id] : [];
    this.persistToLocalStorage();
  }

  private applyBrandAccentOverride(payload: StyleApplyPayload): StyleApplyPayload {
    if (payload.hierarchyMode !== 'hero-accent' || payload.presetId === 'wireframe') {
      return payload;
    }
    const heroSlotIds = new Set(
      this.activeDoc
        ? buildCellRenderSpecs(this.activeDoc, { supportsCustomGeometry: true })
            .filter((s) => s.role === 'hero')
            .map((s) => s.slotId)
        : []
    );
    return {
      ...payload,
      cells: payload.cells.map((cell) => {
        if (!heroSlotIds.has(cell.slotId)) return cell;
        return {
          ...cell,
          fillHex: this.brandAccentHex,
          textColorHex: getAutoContrastTextColor(this.brandAccentHex, this.isDarkTheme),
        };
      }),
    };
  }

  public hydrateFromSharePayload(payload: ShareableStudioPayload): void {
    this.canvasWidth = Math.max(320, Math.min(3840, Math.round(payload.w)));
    this.canvasHeight = Math.max(240, Math.min(3840, Math.round(payload.h)));
    this.canvasPadding = Math.max(0, Math.round(payload.pad));
    this.canvasBgHex = payload.bg || '#FFFFFF';
    this.brandAccentHex = payload.accent || '#1B1D1E';
    this.presetId = this.detectPresetId(this.canvasWidth, this.canvasHeight);
    this.applyDocumentDirectly(payload.state, payload.texts);
    this.emitChange(true);
  }

  public toSharePayload(): ShareableStudioPayload | null {
    if (!this.activeDoc) return null;
    const texts: Record<string, string> = {};
    for (const card of this.cards) {
      if (card.text.trim().length > 0) {
        texts[card.slotId] = card.text;
      }
    }
    return {
      w: this.canvasWidth,
      h: this.canvasHeight,
      pad: this.canvasPadding,
      bg: this.canvasBgHex,
      accent: this.brandAccentHex,
      state: this.activeDoc,
      texts,
    };
  }

  private persistToLocalStorage(): void {
    try {
      if (typeof globalThis.localStorage === 'undefined') return;
      const payload = this.toSharePayload();
      if (!payload) {
        globalThis.localStorage.removeItem(STORAGE_KEY);
        return;
      }
      globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Ignore storage quota or SSR/test environments
    }
  }

  private tryRestoreFromLocalStorage(): boolean {
    try {
      if (typeof globalThis.localStorage === 'undefined') return false;
      const raw = globalThis.localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const parsed = JSON.parse(raw) as Partial<ShareableStudioPayload>;
      if (!parsed.state || typeof parsed.w !== 'number' || typeof parsed.h !== 'number') {
        return false;
      }
      const validState = hydrateStateFromJson(JSON.stringify(parsed.state));
      if (!validState) return false;
      this.hydrateFromSharePayload({
        w: parsed.w,
        h: parsed.h,
        pad: typeof parsed.pad === 'number' ? parsed.pad : 40,
        bg: typeof parsed.bg === 'string' ? parsed.bg : '#FFFFFF',
        accent: typeof parsed.accent === 'string' ? parsed.accent : '#1B1D1E',
        state: validState,
        texts: parsed.texts ?? {},
      });
      return true;
    } catch {
      return false;
    }
  }

  private detectPresetId(w: number, h: number): string {
    const match = CANVAS_PRESETS.find((p) => p.width === w && p.height === h);
    return match ? match.id : 'custom';
  }

  private rebuildSnapshot(): void {
    this.cachedSnapshot = {
      canvasWidth: this.canvasWidth,
      canvasHeight: this.canvasHeight,
      canvasPadding: this.canvasPadding,
      canvasBgHex: this.canvasBgHex,
      brandAccentHex: this.brandAccentHex,
      presetId: this.presetId,
      cards: [...this.cards],
      selectedCardIds: [...this.selectedCardIds],
      activeDoc: this.activeDoc,
      version: this.version,
    };
  }

  private emitChange(notifySelection = false): void {
    this.version += 1;
    this.rebuildSnapshot();
    for (const listener of this.stateListeners) {
      listener();
    }
    if (notifySelection) {
      for (const listener of this.selectionListeners) {
        listener();
      }
    }
  }

  public subscribe(listener: () => void): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  public getSnapshot(): StudioSnapshot {
    return this.cachedSnapshot;
  }

  // --- Studio Workbench Controls ---

  public setTheme(isDark: boolean): void {
    this.isDarkTheme = isDark;
    this.canvasBgHex = isDark ? '#0D0F0F' : '#FFFFFF';
    if (this.activeDoc) {
      this.applyDocumentDirectly(this.activeDoc);
    }
    this.emitChange(false);
  }

  public selectPreset(presetId: string): void {
    const preset = CANVAS_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    this.presetId = preset.id;
    this.setCanvasDimensions(preset.width, preset.height, preset.defaultPadding);
  }

  public setCanvasDimensions(width: number, height: number, padding = this.canvasPadding): void {
    const nextW = Math.max(320, Math.min(3840, Math.round(width)));
    const nextH = Math.max(240, Math.min(3840, Math.round(height)));
    const nextPad = Math.max(0, Math.min(Math.floor(Math.min(nextW, nextH) * 0.2), Math.round(padding)));

    this.canvasWidth = nextW;
    this.canvasHeight = nextH;
    this.canvasPadding = nextPad;
    this.presetId = this.detectPresetId(nextW, nextH);

    if (this.activeDoc) {
      const nextAnchor = computeArtboardContentRect(nextW, nextH, nextPad);
      const resizedDoc: BentoDocumentState = {
        ...this.activeDoc,
        revision: this.activeDoc.revision + 1,
        anchorRect: nextAnchor,
      };
      this.applyDocumentDirectly(resizedDoc);
    }

    this.emitChange(true);
  }

  public setBrandAccent(hex: string): void {
    if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return;
    this.brandAccentHex = hex;
    if (this.activeDoc) {
      this.applyDocumentDirectly(this.activeDoc);
    }
    this.emitChange(false);
  }

  public setCanvasBg(hex: string): void {
    if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return;
    this.canvasBgHex = hex;
    this.persistToLocalStorage();
    this.emitChange(false);
  }

  public selectCards(cardIds: string[]): void {
    this.selectedCardIds = cardIds;
    this.emitChange(true);
  }

  public updateCardText(cardId: string, text: string): void {
    const target = this.cards.find((c) => c.id === cardId);
    if (!target) return;
    target.text = text;
    this.persistToLocalStorage();
    this.emitChange(false);
  }

  public setCardImageDataUrl(cardId: string, dataUrl: string, addScrim = true): void {
    const target = this.cards.find((c) => c.id === cardId);
    if (!target) return;
    target.imageDataUrl = dataUrl;
    target.hasScrim = addScrim;
    target.style = { ...target.style, textColorHex: '#FFFFFF' };
    this.emitChange(false);
  }

  public deleteCardById(cardId: string): void {
    this.cards = this.cards.filter((c) => c.id !== cardId);
    this.selectedCardIds = this.selectedCardIds.filter((id) => id !== cardId);
    this.persistToLocalStorage();
    this.emitChange(true);
  }

  public resizeActiveSplit(
    nodeId: string,
    nextRatio: number,
    snapHarmonic: boolean,
    commit: boolean
  ): void {
    if (!this.activeDoc) return;
    const { state: nextState } = resizeSplitRatio(this.activeDoc, nodeId, nextRatio, {
      snapHarmonic,
    });
    if (nextState === this.activeDoc && !commit) return;

    const existingSlots = new Set(this.cards.map((c) => c.slotId));
    const diff = computeLayoutDiff(this.activeDoc, nextState, existingSlots, {
      commitUndoEntry: commit,
      supportsCustomGeometry: true,
    });
    this.activeDoc = nextState;

    for (const spec of diff.update) {
      const card = this.cards.find((c) => c.slotId === spec.slotId);
      if (card) {
        card.rect = { ...spec.rect };
        card.cornerAdjustment = spec.cornerAdjustment;
        card.shapeKind = spec.shapeKind;
        card.svgPath = spec.svgPath;
        card.tags = { ...spec.tags };
      }
    }

    if (commit) {
      this.persistToLocalStorage();
    }
    this.emitChange(commit);
  }

  public clearCanvas(): void {
    this.cards = [];
    this.selectedCardIds = [];
    this.activeDoc = null;
    this.persistToLocalStorage();
    this.emitChange(true);
  }

  // --- IBentoHost Implementation ---

  public async getCapabilities(): Promise<HostCapabilities> {
    return { ...STUDIO_CAPABILITIES };
  }

  public async getSelectionContext(): Promise<SelectionContext> {
    const slideBounds: RectPt = { left: 0, top: 0, width: this.canvasWidth, height: this.canvasHeight };
    const contentRect = computeArtboardContentRect(
      this.canvasWidth,
      this.canvasHeight,
      this.canvasPadding
    );

    if (this.activeDoc && this.cards.length > 0) {
      const selectedCards = this.cards.filter((c) => this.selectedCardIds.includes(c.id));
      return {
        slideId: 'studio_artboard',
        slideBounds,
        selectedShapeCount: selectedCards.length || 1,
        activeBentoId: this.activeDoc.bentoId,
        hydratedStateJson: JSON.stringify(this.activeDoc),
        survivingSlotIds: this.cards.map((c) => c.slotId),
        selectedSlotIds: selectedCards.map((c) => c.slotId),
        hasDuplicateSlotConflict: false,
      };
    }

    // When canvas is cleared, pre-select the artboard content bounds so Entry "Create Layout" works in 1 click!
    return {
      slideId: 'studio_artboard',
      slideBounds,
      selectedShapeCount: 1,
      selectedShapeBounds: contentRect,
      survivingSlotIds: [],
      selectedSlotIds: [],
      hasDuplicateSlotConflict: false,
    };
  }

  public async applyLayoutDiff(diff: LayoutDiffPayload): Promise<{ stashedCount: number }> {
    const bySlot = new Map(this.cards.map((c) => [c.slotId, c]));

    // Hydrate latest document state from spec tags
    const firstSpec = diff.update[0] ?? diff.create[0];
    const stateTag = firstSpec?.tags[BENTO_TAGS.STATE];
    if (stateTag) {
      const parsed = hydrateStateFromJson(stateTag);
      if (parsed) {
        this.activeDoc = parsed;
      }
    }

    for (const spec of diff.update) {
      const card = bySlot.get(spec.slotId);
      if (!card) continue;
      card.rect = { ...spec.rect };
      card.cornerAdjustment = spec.cornerAdjustment;
      card.shapeKind = spec.shapeKind;
      card.svgPath = spec.svgPath;
      card.shapeName = spec.shapeName;
      card.role = spec.role;
      card.locked = spec.locked;
      card.zOrderIndex = spec.zOrderIndex;
      card.contentHint = spec.contentHint;
      card.tags = { ...spec.tags };
    }

    const createdIds: string[] = [];
    for (const spec of diff.create) {
      const id = `card_${this.cardSeq++}`;
      const card: StudioCard = {
        id,
        slotId: spec.slotId,
        rect: { ...spec.rect },
        cornerAdjustment: spec.cornerAdjustment,
        shapeKind: spec.shapeKind,
        svgPath: spec.svgPath,
        shapeName: spec.shapeName,
        role: spec.role,
        locked: spec.locked,
        zOrderIndex: spec.zOrderIndex,
        contentHint: spec.contentHint,
        tags: { ...spec.tags },
        text: '',
        style: { ...DEFAULT_CARD_STYLE, slotId: spec.slotId },
      };
      this.cards.push(card);
      createdIds.push(id);
    }

    const retireSet = new Set(diff.retireSlotIds);
    if (retireSet.size > 0) {
      this.cards = this.cards.filter((c) => !retireSet.has(c.slotId));
    }

    this.cards.sort((a, b) => a.zOrderIndex - b.zOrderIndex);

    if (createdIds.length > 0 && diff.update.length === 0) {
      this.selectedCardIds = [createdIds[0]!];
    }

    this.persistToLocalStorage();
    this.emitChange(false);
    return { stashedCount: 0 };
  }

  public async applyStyle(_bentoId: string, payload: StyleApplyPayload): Promise<void> {
    const accented = this.applyBrandAccentOverride(payload);
    const bySlot = new Map(accented.cells.map((c) => [c.slotId, c]));

    for (const card of this.cards) {
      const style = bySlot.get(card.slotId);
      if (!style) continue;
      if (card.imageDataUrl) {
        card.style = { ...style, textColorHex: '#FFFFFF' };
      } else {
        card.style = { ...style };
      }
    }

    this.persistToLocalStorage();
    this.emitChange(false);
  }

  public async syncStyleFromSelected(_bentoId: string): Promise<void> {
    const source = this.cards.find((c) => this.selectedCardIds.includes(c.id));
    if (!source) return;
    for (const card of this.cards) {
      if (card.id === source.id || card.imageDataUrl) continue;
      card.style = { ...source.style, slotId: card.slotId };
    }
    this.emitChange(false);
  }

  public async setImageSlot(
    _bentoId: string,
    slotId: string,
    imageBase64: string,
    addScrim: boolean
  ): Promise<void> {
    const target = this.cards.find((c) => c.slotId === slotId);
    if (!target) return;
    target.imageDataUrl = imageBase64;
    target.hasScrim = addScrim;
    target.style = { ...target.style, textColorHex: '#FFFFFF' };
    this.emitChange(false);
  }

  public async generateMultiSlides(_items: MultiSlideItem[]): Promise<{ createdSlideCount: number }> {
    return { createdSlideCount: 0 };
  }

  public async reorderReadingOrder(_bentoId: string, orderedSlotIds: string[]): Promise<void> {
    const orderMap = new Map(orderedSlotIds.map((id, idx) => [id, idx]));
    for (const card of this.cards) {
      card.zOrderIndex = orderMap.get(card.slotId) ?? card.zOrderIndex;
    }
    this.cards.sort((a, b) => a.zOrderIndex - b.zOrderIndex);
    this.emitChange(false);
  }

  public async detachBento(_bentoId: string): Promise<void> {
    this.clearCanvas();
  }

  public onSelectionChanged(handler: () => void): () => void {
    this.selectionListeners.add(handler);
    return () => this.selectionListeners.delete(handler);
  }
}
