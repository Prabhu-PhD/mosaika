import {
  BENTO_TAGS,
  type BentoDocumentState,
  type BentoTemplate,
  type CellRole,
  type CellShapeKind,
  type CellStyleSpec,
  type EntranceAnimationPreset,
  type EntranceAnimationSpec,
  type HierarchyMode,
  type HostCapabilities,
  type IBentoHost,
  type LayoutDiffPayload,
  type LayoutIntent,
  type MultiSlideItem,
  type RectPt,
  type SavedBentoBlueprint,
  type SelectionContext,
  type SplitAxis,
  type StyleApplyPayload,
  type StylePresetId,
} from '@bento/contract';
import {
  applyTemplateToDocument,
  buildCellRenderSpecs,
  buildEntranceAnimationSpec,
  computeLayoutDiff,
  computeStylePayload,
  createIntentBentoDocument,
  deleteLeafFromTree,
  getAutoContrastTextColor,
  getIntentDefinition,
  getPresetDefaultRadius,
  hydrateStateFromJson,
  instantiateSavedBlueprint,
  mirrorBentoLayout,
  nextDeterministicSeed,
  parseSeedCode,
  regenerateWithLocks,
  resizeSplitRatio,
  setLeafRole,
  setLeafShapeKind,
  splitLeaf,
  toggleLeafLock,
  updateNonStructuralParams,
  type MirrorDirection,
} from '@bento/core';
import {
  deleteBlueprintFromLibrary,
  loadSavedBlueprints,
  saveBlueprintToLibrary,
} from '@bento/ui';
import {
  CARD_BLOCK_OPTIONS,
  type CardBlockType,
  type CardPatternKind,
  type CardSurfaceTreatment,
  type CardWidgetVariant,
} from './cardBlocks.js';
import { CANVAS_PRESETS, computeArtboardContentRect } from './presets.js';
import type { NotesToBentoPlan } from './notesToBento.js';
import type { ShowcaseCardSeed, StudioShowcase } from './showcases.js';
import type {
  ArtboardBackdropId,
  CardIconId,
  CardTextAlign,
  CornerStyle,
  FontPairingId,
  HoverInteractionMode,
} from './visualCraft.js';

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
  kicker?: string;
  icon?: CardIconId;
  textAlign?: CardTextAlign;
  blockType?: CardBlockType;
  widgetVariant?: CardWidgetVariant;
  pattern?: CardPatternKind;
  surfaceTreatment?: CardSurfaceTreatment;
  imageDataUrl?: string;
  hasScrim?: boolean;
  style: CellStyleSpec;
}

export interface StudioSlideSummary {
  id: string;
  title: string;
  accentHex: string;
  cardCount: number;
}

interface StudioSlideRecord {
  id: string;
  title: string;
  canvasBgHex: string;
  brandAccentHex: string;
  backdrop: ArtboardBackdropId;
  backdropImageUrl?: string;
  grainEnabled: boolean;
  cornerStyle: CornerStyle;
  fontPairing: FontPairingId;
  hoverMode: HoverInteractionMode;
  activeDoc: BentoDocumentState | null;
  cards: StudioCard[];
}

export interface StudioSnapshot {
  canvasWidth: number;
  canvasHeight: number;
  canvasPadding: number;
  canvasBgHex: string;
  brandAccentHex: string;
  backdrop: ArtboardBackdropId;
  backdropImageUrl?: string;
  grainEnabled: boolean;
  cornerStyle: CornerStyle;
  fontPairing: FontPairingId;
  hoverMode: HoverInteractionMode;
  presetId: string;
  cards: StudioCard[];
  selectedCardIds: string[];
  activeDoc: BentoDocumentState | null;
  activeAnimation: EntranceAnimationSpec | null;
  animationRunId: number;
  savedBlueprints: SavedBentoBlueprint[];
  slides: StudioSlideSummary[];
  activeSlideIndex: number;
  canUndo: boolean;
  canRedo: boolean;
  canSeedBack: boolean;
  canSeedForward: boolean;
  version: number;
}

export interface ShareableStudioPayload {
  w: number;
  h: number;
  pad: number;
  bg: string;
  accent: string;
  backdrop?: ArtboardBackdropId;
  grain?: boolean;
  corners?: CornerStyle;
  font?: FontPairingId;
  hover?: HoverInteractionMode;
  state: BentoDocumentState;
  texts: Record<string, string>;
  kickers?: Record<string, string>;
  icons?: Record<string, CardIconId>;
  aligns?: Record<string, CardTextAlign>;
  blocks?: Record<string, CardBlockType>;
  variants?: Record<string, CardWidgetVariant>;
  patterns?: Record<string, CardPatternKind>;
  surfaces?: Record<string, CardSurfaceTreatment>;
}

interface StudioUndoRecord {
  canvasWidth: number;
  canvasHeight: number;
  canvasPadding: number;
  canvasBgHex: string;
  brandAccentHex: string;
  backdrop: ArtboardBackdropId;
  backdropImageUrl?: string;
  grainEnabled: boolean;
  cornerStyle: CornerStyle;
  fontPairing: FontPairingId;
  hoverMode: HoverInteractionMode;
  activeDoc: BentoDocumentState | null;
  cards: StudioCard[];
  selectedCardIds: string[];
}

const STORAGE_KEY = 'mosaika_web_studio_v1';
const MAX_UNDO_STEPS = 40;

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
  supportsMosaikafy: false,
  supportsEntranceAnimations: true,
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

function cloneUndoRecord(rec: StudioUndoRecord): StudioUndoRecord {
  return JSON.parse(JSON.stringify(rec)) as StudioUndoRecord;
}

export class WebStudioHost implements IBentoHost {
  private canvasWidth: number;
  private canvasHeight: number;
  private canvasPadding: number;
  private canvasBgHex = '#FFFFFF';
  private brandAccentHex = '#2563EB';
  private backdrop: ArtboardBackdropId = 'aurora';
  private backdropImageUrl: string | undefined;
  private grainEnabled = true;
  private cornerStyle: CornerStyle = 'squircle';
  private fontPairing: FontPairingId = 'swiss';
  private hoverMode: HoverInteractionMode = 'lift';
  private presetId: string;
  private cards: StudioCard[] = [];
  private selectedCardIds: string[] = [];
  private activeDoc: BentoDocumentState | null = null;
  private activeAnimation: EntranceAnimationSpec | null = null;
  private animationRunId = 0;
  private savedBlueprints: SavedBentoBlueprint[] = [];
  private slides: StudioSlideRecord[] = [];
  private activeSlideIndex = 0;
  private slideSeq = 1;
  private seedTrail: number[] = [48219];
  private seedIndex = 0;
  private undoStack: StudioUndoRecord[] = [];
  private redoStack: StudioUndoRecord[] = [];
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
    this.savedBlueprints = loadSavedBlueprints();

    if (options?.initialSharePayload) {
      this.hydrateFromSharePayload(options.initialSharePayload);
    } else if (!this.tryRestoreFromLocalStorage() && !options?.skipDefaultSeed) {
      this.seedStarterLayout();
    }
    this.ensurePrimarySlide();
    this.rebuildSnapshot();
  }

  private captureCurrentSlideRecord(existingId?: string, existingTitle?: string): StudioSlideRecord {
    const heroCard = this.cards.find((c) => c.role === 'hero') ?? this.cards[0];
    const firstLine = heroCard?.text.trim().split(/\r?\n/)[0]?.trim();
    const fallbackTitle = `Slide ${this.activeSlideIndex + 1}`;
    const title = existingTitle || (firstLine ? firstLine.slice(0, 26) : fallbackTitle);
    return JSON.parse(
      JSON.stringify({
        id: existingId ?? `slide_${this.slideSeq++}`,
        title,
        canvasBgHex: this.canvasBgHex,
        brandAccentHex: this.brandAccentHex,
        backdrop: this.backdrop,
        backdropImageUrl: this.backdropImageUrl,
        grainEnabled: this.grainEnabled,
        cornerStyle: this.cornerStyle,
        fontPairing: this.fontPairing,
        hoverMode: this.hoverMode,
        activeDoc: this.activeDoc,
        cards: this.cards,
      })
    ) as StudioSlideRecord;
  }

  private ensurePrimarySlide(): void {
    if (this.slides.length === 0) {
      this.slides = [this.captureCurrentSlideRecord()];
      this.activeSlideIndex = 0;
    }
  }

  private syncActiveSlideRecord(): void {
    if (this.slides.length === 0) {
      this.ensurePrimarySlide();
      return;
    }
    const existing = this.slides[this.activeSlideIndex];
    const updated = this.captureCurrentSlideRecord(existing?.id);
    this.slides[this.activeSlideIndex] = updated;
  }

  private captureUndoRecord(): StudioUndoRecord {
    return cloneUndoRecord({
      canvasWidth: this.canvasWidth,
      canvasHeight: this.canvasHeight,
      canvasPadding: this.canvasPadding,
      canvasBgHex: this.canvasBgHex,
      brandAccentHex: this.brandAccentHex,
      backdrop: this.backdrop,
      backdropImageUrl: this.backdropImageUrl,
      grainEnabled: this.grainEnabled,
      cornerStyle: this.cornerStyle,
      fontPairing: this.fontPairing,
      hoverMode: this.hoverMode,
      activeDoc: this.activeDoc,
      cards: this.cards,
      selectedCardIds: this.selectedCardIds,
    });
  }

  private pushUndo(): void {
    this.undoStack.push(this.captureUndoRecord());
    if (this.undoStack.length > MAX_UNDO_STEPS) {
      this.undoStack.shift();
    }
    this.redoStack = [];
  }

  private restoreUndoRecord(rec: StudioUndoRecord): void {
    const copy = cloneUndoRecord(rec);
    this.canvasWidth = copy.canvasWidth;
    this.canvasHeight = copy.canvasHeight;
    this.canvasPadding = copy.canvasPadding;
    this.canvasBgHex = copy.canvasBgHex;
    this.brandAccentHex = copy.brandAccentHex;
    this.backdrop = copy.backdrop;
    this.backdropImageUrl = copy.backdropImageUrl;
    this.grainEnabled = copy.grainEnabled;
    this.cornerStyle = copy.cornerStyle;
    this.fontPairing = copy.fontPairing;
    this.hoverMode = copy.hoverMode ?? 'lift';
    this.presetId = this.detectPresetId(this.canvasWidth, this.canvasHeight);
    this.activeDoc = copy.activeDoc;
    this.cards = copy.cards;
    this.selectedCardIds = copy.selectedCardIds;
    this.persistToLocalStorage();
    this.emitChange(true);
  }

  public undo(): void {
    const prev = this.undoStack.pop();
    if (!prev) return;
    this.redoStack.push(this.captureUndoRecord());
    this.restoreUndoRecord(prev);
  }

  public redo(): void {
    const next = this.redoStack.pop();
    if (!next) return;
    this.undoStack.push(this.captureUndoRecord());
    this.restoreUndoRecord(next);
  }

  private seedStarterLayout(): void {
    const rect = computeArtboardContentRect(this.canvasWidth, this.canvasHeight, this.canvasPadding);
    const created = createIntentBentoDocument(rect, 'executive-brief', {
      count: 5,
      gutterPt: 16,
      radiusPt: 20,
      seed: 48219,
      stylePreset: 'soft-modern',
      hierarchyMode: 'hero-accent',
    });
    if (!created.ok) return;

    this.seedTrail = [48219];
    this.seedIndex = 0;
    this.applyDocumentDirectly(
      created.value,
      {
        slot_01: 'Mosaika Studio\nDesign bounded Swiss bento grids for web, social & PowerPoint.',
        slot_02: '144\n+12 Intents\nCurated Blueprints',
        slot_03: 'Export Anywhere\nEditable .pptx slides\nVector SVG & 2× PNG\nResponsive Tailwind',
        slot_04: 'Weekly Velocity\n+38% MoM\n24, 38, 32, 54, 48, 76, 92',
        slot_05: 'Quick Start\npnpm create mosaika\ncd my-grid && pnpm dev',
      },
      {
        slot_02: 'kpi',
        slot_03: 'checklist',
        slot_04: 'chart',
        slot_05: 'code',
      },
      {
        slot_01: 'mesh',
        slot_02: 'glass',
        slot_03: 'glass',
        slot_04: 'glass',
        slot_05: 'glass',
      },
      {
        slot_01: 'STUDIO 2.0',
        slot_04: 'LIVE DATA',
        slot_05: 'DEV READY',
      },
      {
        slot_01: 'sparkles',
        slot_04: 'trending',
        slot_05: 'command',
      },
      {
        slot_01: 'bl',
      },
      {
        slot_04: 'sparkline',
      },
      {
        slot_01: 'rings',
      }
    );
    // Start cleanly in Canvas mode so first-time users see the calm Canvas controls!
    this.selectedCardIds = [];
  }

  private applyDocumentDirectly(
    doc: BentoDocumentState,
    initialTexts?: Record<string, string>,
    initialBlocks?: Record<string, CardBlockType>,
    initialSurfaces?: Record<string, CardSurfaceTreatment>,
    initialKickers?: Record<string, string>,
    initialIcons?: Record<string, CardIconId>,
    initialAligns?: Record<string, CardTextAlign>,
    initialVariants?: Record<string, CardWidgetVariant>,
    initialPatterns?: Record<string, CardPatternKind>
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
      const baseStyle = styleBySlot.get(spec.slotId) ?? { ...DEFAULT_CARD_STYLE, slotId: spec.slotId };
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
        kicker: initialKickers?.[spec.slotId] ?? prev?.kicker,
        icon: initialIcons?.[spec.slotId] ?? prev?.icon ?? 'none',
        textAlign: initialAligns?.[spec.slotId] ?? prev?.textAlign ?? 'tl',
        blockType: initialBlocks?.[spec.slotId] ?? prev?.blockType ?? 'text',
        widgetVariant: initialVariants?.[spec.slotId] ?? prev?.widgetVariant,
        pattern: initialPatterns?.[spec.slotId] ?? prev?.pattern ?? 'none',
        surfaceTreatment:
          initialSurfaces?.[spec.slotId] ??
          prev?.surfaceTreatment ??
          (this.backdrop !== 'paper' && spec.role !== 'hero' ? 'glass' : 'solid'),
        imageDataUrl: prev?.imageDataUrl,
        hasScrim: prev?.hasScrim,
        style: prev?.imageDataUrl ? { ...baseStyle, textColorHex: '#FFFFFF' } : baseStyle,
      };
    });

    // Keep valid selectedCardIds if they still exist
    const liveIds = new Set(this.cards.map((c) => c.id));
    this.selectedCardIds = this.selectedCardIds.filter((id) => liveIds.has(id));
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
    this.brandAccentHex = payload.accent || '#2563EB';
    this.backdrop = payload.backdrop ?? 'paper';
    this.grainEnabled = Boolean(payload.grain);
    this.cornerStyle = payload.corners ?? 'squircle';
    this.fontPairing = payload.font ?? 'swiss';
    this.hoverMode = payload.hover ?? 'lift';
    this.presetId = this.detectPresetId(this.canvasWidth, this.canvasHeight);
    this.seedTrail = [payload.state.params.seed];
    this.seedIndex = 0;
    this.applyDocumentDirectly(
      payload.state,
      payload.texts,
      payload.blocks,
      payload.surfaces,
      payload.kickers,
      payload.icons,
      payload.aligns,
      payload.variants,
      payload.patterns
    );
    this.emitChange(true);
  }

  public toSharePayload(): ShareableStudioPayload | null {
    if (!this.activeDoc) return null;
    const texts: Record<string, string> = {};
    const kickers: Record<string, string> = {};
    const icons: Record<string, CardIconId> = {};
    const aligns: Record<string, CardTextAlign> = {};
    const blocks: Record<string, CardBlockType> = {};
    const variants: Record<string, CardWidgetVariant> = {};
    const patterns: Record<string, CardPatternKind> = {};
    const surfaces: Record<string, CardSurfaceTreatment> = {};

    for (const card of this.cards) {
      if (card.text.trim().length > 0) texts[card.slotId] = card.text;
      if (card.kicker?.trim()) kickers[card.slotId] = card.kicker.trim();
      if (card.icon && card.icon !== 'none') icons[card.slotId] = card.icon;
      if (card.textAlign && card.textAlign !== 'tl') aligns[card.slotId] = card.textAlign;
      if (card.blockType && card.blockType !== 'text') blocks[card.slotId] = card.blockType;
      if (card.widgetVariant) variants[card.slotId] = card.widgetVariant;
      if (card.pattern && card.pattern !== 'none') patterns[card.slotId] = card.pattern;
      if (card.surfaceTreatment && card.surfaceTreatment !== 'solid') {
        surfaces[card.slotId] = card.surfaceTreatment;
      }
    }

    return {
      w: this.canvasWidth,
      h: this.canvasHeight,
      pad: this.canvasPadding,
      bg: this.canvasBgHex,
      accent: this.brandAccentHex,
      backdrop: this.backdrop,
      grain: this.grainEnabled,
      corners: this.cornerStyle,
      font: this.fontPairing,
      hover: this.hoverMode,
      state: this.activeDoc,
      texts,
      ...(Object.keys(kickers).length > 0 ? { kickers } : {}),
      ...(Object.keys(icons).length > 0 ? { icons } : {}),
      ...(Object.keys(aligns).length > 0 ? { aligns } : {}),
      ...(Object.keys(blocks).length > 0 ? { blocks } : {}),
      ...(Object.keys(variants).length > 0 ? { variants } : {}),
      ...(Object.keys(patterns).length > 0 ? { patterns } : {}),
      ...(Object.keys(surfaces).length > 0 ? { surfaces } : {}),
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
        accent: typeof parsed.accent === 'string' ? parsed.accent : '#2563EB',
        backdrop: parsed.backdrop ?? 'aurora',
        grain: parsed.grain ?? true,
        corners: parsed.corners ?? 'squircle',
        font: parsed.font ?? 'swiss',
        hover: parsed.hover ?? 'lift',
        state: validState,
        texts: parsed.texts ?? {},
        kickers: parsed.kickers,
        icons: parsed.icons,
        aligns: parsed.aligns,
        blocks: parsed.blocks,
        variants: parsed.variants,
        patterns: parsed.patterns,
        surfaces: parsed.surfaces,
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
    this.syncActiveSlideRecord();
    this.cachedSnapshot = {
      canvasWidth: this.canvasWidth,
      canvasHeight: this.canvasHeight,
      canvasPadding: this.canvasPadding,
      canvasBgHex: this.canvasBgHex,
      brandAccentHex: this.brandAccentHex,
      backdrop: this.backdrop,
      backdropImageUrl: this.backdropImageUrl,
      grainEnabled: this.grainEnabled,
      cornerStyle: this.cornerStyle,
      fontPairing: this.fontPairing,
      hoverMode: this.hoverMode,
      presetId: this.presetId,
      cards: [...this.cards],
      selectedCardIds: [...this.selectedCardIds],
      activeDoc: this.activeDoc,
      activeAnimation: this.activeAnimation,
      animationRunId: this.animationRunId,
      savedBlueprints: [...this.savedBlueprints],
      slides: this.slides.map((s) => ({
        id: s.id,
        title: s.title,
        accentHex: s.brandAccentHex,
        cardCount: s.cards.length,
      })),
      activeSlideIndex: this.activeSlideIndex,
      canUndo: this.undoStack.length > 0,
      canRedo: this.redoStack.length > 0,
      canSeedBack: this.seedIndex > 0,
      canSeedForward: this.seedIndex < this.seedTrail.length - 1,
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

  // --- Wave 1 Calm Studio Look & Craft Controls ---

  public setTheme(isDark: boolean): void {
    this.isDarkTheme = isDark;
    this.canvasBgHex = isDark ? '#0D0F0F' : '#FFFFFF';
    if (this.activeDoc) {
      this.applyDocumentDirectly(this.activeDoc);
    }
    this.emitChange(false);
  }

  public setBackdrop(backdrop: ArtboardBackdropId): void {
    this.pushUndo();
    this.backdrop = backdrop;
    // Automatically make standard cards glass when switching onto a scenic wallpaper if they were plain solid
    if (backdrop === 'aurora' || backdrop === 'dusk' || backdrop === 'photo') {
      for (const card of this.cards) {
        if (card.role !== 'hero' && (!card.surfaceTreatment || card.surfaceTreatment === 'solid')) {
          card.surfaceTreatment = 'glass';
        }
      }
    } else if (backdrop === 'paper') {
      for (const card of this.cards) {
        if (card.surfaceTreatment === 'glass') {
          card.surfaceTreatment = 'solid';
        }
      }
    }
    this.persistToLocalStorage();
    this.emitChange(false);
  }

  public setBackdropImage(dataUrl: string): void {
    this.pushUndo();
    this.backdropImageUrl = dataUrl;
    this.backdrop = 'photo';
    for (const card of this.cards) {
      if (card.role !== 'hero' && (!card.surfaceTreatment || card.surfaceTreatment === 'solid')) {
        card.surfaceTreatment = 'glass';
      }
    }
    this.persistToLocalStorage();
    this.emitChange(false);
  }

  public setGrainEnabled(enabled: boolean): void {
    this.grainEnabled = enabled;
    this.persistToLocalStorage();
    this.emitChange(false);
  }

  public setCornerStyle(style: CornerStyle): void {
    this.pushUndo();
    this.cornerStyle = style;
    this.persistToLocalStorage();
    this.emitChange(false);
  }

  public setFontPairing(font: FontPairingId): void {
    this.pushUndo();
    this.fontPairing = font;
    this.persistToLocalStorage();
    this.emitChange(false);
  }

  public selectPreset(presetId: string): void {
    const preset = CANVAS_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    this.presetId = preset.id;
    this.setCanvasDimensions(preset.width, preset.height, preset.defaultPadding);
  }

  public setCanvasDimensions(width: number, height: number, padding = this.canvasPadding): void {
    this.pushUndo();
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
    this.pushUndo();
    this.brandAccentHex = hex.toUpperCase();
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

  // --- Direct @bento/core Layout & Seed Actions ---

  private commitDocMutation(nextDoc: BentoDocumentState, recordUndo = true): void {
    if (recordUndo) this.pushUndo();
    this.applyDocumentDirectly(nextDoc);
    this.emitChange(false);
  }

  public setIntent(intent: LayoutIntent): void {
    const rect = computeArtboardContentRect(this.canvasWidth, this.canvasHeight, this.canvasPadding);
    if (!this.activeDoc) {
      const created = createIntentBentoDocument(rect, intent, { seed: 48219 });
      if (created.ok) this.commitDocMutation(created.value);
      return;
    }
    const def = getIntentDefinition(intent);
    const next = regenerateWithLocks(this.activeDoc, {
      intent,
      count: def.recommendedParams.count,
      gutterPt: this.activeDoc.params.gutterPt,
      radiusPt: this.activeDoc.params.radiusPt,
      heroBias: def.recommendedParams.heroBias,
    });
    if (next.ok) this.commitDocMutation(next.value);
  }

  public applyTemplate(template: BentoTemplate): void {
    const rect = computeArtboardContentRect(this.canvasWidth, this.canvasHeight, this.canvasPadding);
    const result = this.activeDoc
      ? applyTemplateToDocument(this.activeDoc, template)
      : createIntentBentoDocument(rect, template.params.intent, {
          ...template.params,
        });
    if (result.ok) {
      this.recordSeed(result.value.params.seed);
      this.commitDocMutation(result.value);
    }
  }

  public setBoxCount(count: number, commitUndo = true): void {
    if (!this.activeDoc) return;
    const res = regenerateWithLocks(this.activeDoc, { count });
    if (res.ok) this.commitDocMutation(res.value, commitUndo);
  }

  public setGutter(gutterPt: number, commitUndo = false): void {
    if (!this.activeDoc) return;
    const next = updateNonStructuralParams(this.activeDoc, { gutterPt });
    this.commitDocMutation(next, commitUndo);
  }

  public setRadius(radiusPt: number, commitUndo = false): void {
    if (!this.activeDoc) return;
    const next = updateNonStructuralParams(this.activeDoc, { radiusPt });
    this.commitDocMutation(next, commitUndo);
  }

  public setHeroBias(heroBias: number, commitUndo = false): void {
    if (!this.activeDoc) return;
    const res = regenerateWithLocks(this.activeDoc, { heroBias });
    if (res.ok) this.commitDocMutation(res.value, commitUndo);
  }

  public setStylePreset(stylePreset: StylePresetId): void {
    if (!this.activeDoc) return;
    const next = updateNonStructuralParams(this.activeDoc, {
      stylePreset,
      radiusPt: getPresetDefaultRadius(stylePreset),
    });
    this.commitDocMutation(next, true);
  }

  public setHierarchyMode(hierarchyMode: HierarchyMode): void {
    if (!this.activeDoc) return;
    const next = updateNonStructuralParams(this.activeDoc, { hierarchyMode });
    this.commitDocMutation(next, true);
  }

  public mirrorLayout(direction: MirrorDirection): void {
    if (!this.activeDoc) return;
    const mirrored = mirrorBentoLayout(this.activeDoc, direction);
    if (mirrored.ok) this.commitDocMutation(mirrored.value, true);
  }

  private recordSeed(seed: number): void {
    if (this.seedTrail[this.seedIndex] === seed) return;
    this.seedTrail = [...this.seedTrail.slice(0, this.seedIndex + 1), seed].slice(-30);
    this.seedIndex = this.seedTrail.length - 1;
  }

  public randomizeSeed(): void {
    if (!this.activeDoc) {
      this.seedStarterLayout();
      this.emitChange(true);
      return;
    }
    const nextSeed = nextDeterministicSeed(this.activeDoc.params.seed);
    const res = regenerateWithLocks(this.activeDoc, { seed: nextSeed });
    if (res.ok) {
      this.recordSeed(nextSeed);
      this.commitDocMutation(res.value, true);
    }
  }

  public prevSeed(): void {
    if (!this.activeDoc || this.seedIndex <= 0) return;
    this.seedIndex -= 1;
    const seed = this.seedTrail[this.seedIndex]!;
    const res = regenerateWithLocks(this.activeDoc, { seed });
    if (res.ok) this.commitDocMutation(res.value, true);
  }

  public nextSeed(): void {
    if (!this.activeDoc || this.seedIndex >= this.seedTrail.length - 1) return;
    this.seedIndex += 1;
    const seed = this.seedTrail[this.seedIndex]!;
    const res = regenerateWithLocks(this.activeDoc, { seed });
    if (res.ok) this.commitDocMutation(res.value, true);
  }

  public applySeedCode(rawCode: string): boolean {
    if (!this.activeDoc) return false;
    const parsed = parseSeedCode(rawCode);
    if (!parsed) return false;
    const res = regenerateWithLocks(this.activeDoc, { count: parsed.count, seed: parsed.seed });
    if (!res.ok) return false;
    this.recordSeed(parsed.seed);
    this.commitDocMutation(res.value, true);
    return true;
  }

  // --- Personal Saved Library ---

  public saveCurrentBlueprint(name: string): SavedBentoBlueprint | null {
    if (!this.activeDoc) return null;
    const def = getIntentDefinition(this.activeDoc.params.intent);
    const label = name.trim() || `${def.label} ${this.activeDoc.params.count}`;
    const { blueprint, nextList } = saveBlueprintToLibrary(
      this.savedBlueprints,
      label,
      this.activeDoc
    );
    this.savedBlueprints = nextList;
    this.emitChange(false);
    return blueprint;
  }

  public applySavedBlueprint(blueprint: SavedBentoBlueprint): void {
    const rect = computeArtboardContentRect(this.canvasWidth, this.canvasHeight, this.canvasPadding);
    const nextDoc = instantiateSavedBlueprint(blueprint, rect, this.activeDoc);
    this.recordSeed(nextDoc.params.seed);
    this.commitDocMutation(nextDoc, true);
  }

  public deleteSavedBlueprint(id: string): void {
    this.savedBlueprints = deleteBlueprintFromLibrary(this.savedBlueprints, id);
    this.emitChange(false);
  }

  // --- Card Selection, Content, Ergonomics & Drag-to-Swap ---

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

  public setCardKicker(cardId: string, kicker: string): void {
    const target = this.cards.find((c) => c.id === cardId);
    if (!target) return;
    target.kicker = kicker;
    this.persistToLocalStorage();
    this.emitChange(false);
  }

  public setCardIcon(cardId: string, icon: CardIconId): void {
    const target = this.cards.find((c) => c.id === cardId);
    if (!target) return;
    this.pushUndo();
    target.icon = icon;
    this.persistToLocalStorage();
    this.emitChange(false);
  }

  public setCardTextAlign(cardId: string, align: CardTextAlign): void {
    const target = this.cards.find((c) => c.id === cardId);
    if (!target) return;
    this.pushUndo();
    target.textAlign = align;
    this.persistToLocalStorage();
    this.emitChange(false);
  }

  public setCardBlockType(cardId: string, blockType: CardBlockType): void {
    const target = this.cards.find((c) => c.id === cardId);
    if (!target) return;
    this.pushUndo();
    const prevType = target.blockType ?? 'text';
    target.blockType = blockType;

    // Seed clean sample content when switching to a specialized widget type
    if (prevType !== blockType) {
      const def = CARD_BLOCK_OPTIONS.find((o) => o.id === blockType);
      if (
        def &&
        (blockType === 'chart' ||
          blockType === 'code' ||
          blockType === 'quote' ||
          blockType === 'proof' ||
          blockType === 'qr' ||
          blockType === 'kpi' ||
          blockType === 'checklist' ||
          !target.text.trim())
      ) {
        if (blockType === 'kpi' && target.text.trim() && target.text.trim().split(/\r?\n/).length < 2) {
          target.text = `$4.2M\n+24% YoY\n${target.text.trim()}`;
        } else if (blockType === 'checklist' && target.text.trim() && target.text.trim().split(/\r?\n/).length < 2) {
          target.text = `${target.text.trim()}\nEditable .pptx export\nVector SVG & Retina PNG\nZero-backend share link`;
        } else if (blockType !== 'text' && blockType !== 'mockup') {
          target.text = def.defaultText;
        } else if (!target.text.trim()) {
          target.text = def.defaultText;
        }
      }
      if (blockType === 'chart') {
        target.widgetVariant = 'sparkline';
      } else if (blockType === 'mockup') {
        target.widgetVariant = 'iphone';
      } else {
        target.widgetVariant = undefined;
      }
    }

    this.persistToLocalStorage();
    this.emitChange(false);
  }

  public setCardWidgetVariant(cardId: string, variant: CardWidgetVariant): void {
    const target = this.cards.find((c) => c.id === cardId);
    if (!target) return;
    this.pushUndo();
    target.widgetVariant = variant;
    this.persistToLocalStorage();
    this.emitChange(false);
  }

  public setCardPattern(cardId: string, pattern: CardPatternKind): void {
    const target = this.cards.find((c) => c.id === cardId);
    if (!target) return;
    this.pushUndo();
    target.pattern = pattern;
    this.persistToLocalStorage();
    this.emitChange(false);
  }

  public setCardSurfaceTreatment(cardId: string, treatment: CardSurfaceTreatment): void {
    const target = this.cards.find((c) => c.id === cardId);
    if (!target) return;
    this.pushUndo();
    target.surfaceTreatment = treatment;
    this.persistToLocalStorage();
    this.emitChange(false);
  }

  public setCardImageDataUrl(cardId: string, dataUrl: string, addScrim = true): void {
    const target = this.cards.find((c) => c.id === cardId);
    if (!target) return;
    this.pushUndo();
    target.imageDataUrl = dataUrl;
    target.hasScrim = addScrim;
    target.style = { ...target.style, textColorHex: '#FFFFFF' };
    this.emitChange(false);
  }

  public clearCardImage(cardId: string): void {
    const target = this.cards.find((c) => c.id === cardId);
    if (!target) return;
    this.pushUndo();
    target.imageDataUrl = undefined;
    target.hasScrim = false;
    if (this.activeDoc) {
      this.applyDocumentDirectly(this.activeDoc);
    }
    this.emitChange(false);
  }

  /**
   * Drag-and-drop content swap (#17): swaps text, block type, kicker, icon, alignment,
   * image, and surface treatment between two tiles while preserving exact grid geometry!
   */
  public swapCardContents(sourceCardId: string, targetCardId: string): void {
    if (sourceCardId === targetCardId) return;
    const a = this.cards.find((c) => c.id === sourceCardId);
    const b = this.cards.find((c) => c.id === targetCardId);
    if (!a || !b) return;

    this.pushUndo();
    const tmp = {
      text: a.text,
      kicker: a.kicker,
      icon: a.icon,
      textAlign: a.textAlign,
      blockType: a.blockType,
      widgetVariant: a.widgetVariant,
      pattern: a.pattern,
      surfaceTreatment: a.surfaceTreatment,
      imageDataUrl: a.imageDataUrl,
      hasScrim: a.hasScrim,
    };

    a.text = b.text;
    a.kicker = b.kicker;
    a.icon = b.icon;
    a.textAlign = b.textAlign;
    a.blockType = b.blockType;
    a.widgetVariant = b.widgetVariant;
    a.pattern = b.pattern;
    a.surfaceTreatment = b.surfaceTreatment;
    a.imageDataUrl = b.imageDataUrl;
    a.hasScrim = b.hasScrim;

    b.text = tmp.text;
    b.kicker = tmp.kicker;
    b.icon = tmp.icon;
    b.textAlign = tmp.textAlign;
    b.blockType = tmp.blockType;
    b.widgetVariant = tmp.widgetVariant;
    b.pattern = tmp.pattern;
    b.surfaceTreatment = tmp.surfaceTreatment;
    b.imageDataUrl = tmp.imageDataUrl;
    b.hasScrim = tmp.hasScrim;

    if (this.activeDoc) {
      this.applyDocumentDirectly(this.activeDoc);
    }
    this.selectedCardIds = [b.id];
    this.emitChange(true);
  }

  public toggleCardLock(cardId: string): void {
    if (!this.activeDoc) return;
    const card = this.cards.find((c) => c.id === cardId);
    if (!card) return;
    const next = toggleLeafLock(this.activeDoc, card.slotId);
    this.commitDocMutation(next, true);
  }

  public toggleCardHero(cardId: string): void {
    if (!this.activeDoc) return;
    const card = this.cards.find((c) => c.id === cardId);
    if (!card) return;
    const nextRole: CellRole = card.role === 'hero' ? 'standard' : 'hero';
    const next = setLeafRole(this.activeDoc, card.slotId, nextRole);
    this.commitDocMutation(next, true);
  }

  public setCardShape(cardId: string, shapeKind: CellShapeKind): void {
    if (!this.activeDoc) return;
    const card = this.cards.find((c) => c.id === cardId);
    if (!card) return;
    const next = setLeafShapeKind(this.activeDoc, card.slotId, shapeKind);
    this.commitDocMutation(next, true);
  }

  public splitCard(cardId: string, axis: SplitAxis): void {
    if (!this.activeDoc) return;
    const card = this.cards.find((c) => c.id === cardId);
    if (!card) return;
    const res = splitLeaf(this.activeDoc, card.slotId, axis);
    if (res.ok) this.commitDocMutation(res.value, true);
  }

  public deleteCardAndReflow(cardId: string): void {
    const card = this.cards.find((c) => c.id === cardId);
    if (!card) return;
    if (this.activeDoc && this.cards.length > 2) {
      const next = deleteLeafFromTree(this.activeDoc, card.slotId);
      if (next) {
        this.selectedCardIds = [];
        this.commitDocMutation(next, true);
        return;
      }
    }
    this.deleteCardById(cardId);
  }

  public deleteCardById(cardId: string): void {
    this.pushUndo();
    this.cards = this.cards.filter((c) => c.id !== cardId);
    this.selectedCardIds = this.selectedCardIds.filter((id) => id !== cardId);
    this.persistToLocalStorage();
    this.emitChange(true);
  }

  public applyMotionPreset(preset: EntranceAnimationPreset): void {
    if (!this.activeDoc) return;
    const spec = buildEntranceAnimationSpec(this.activeDoc, preset, {
      supportsCustomGeometry: true,
    });
    void this.applyEntranceAnimations(this.activeDoc.bentoId, spec);
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
    this.pushUndo();
    this.cards = [];
    this.selectedCardIds = [];
    this.activeDoc = null;
    this.persistToLocalStorage();
    this.emitChange(true);
  }

  public resetToStarter(): void {
    this.pushUndo();
    this.backdrop = 'aurora';
    this.grainEnabled = true;
    this.cornerStyle = 'squircle';
    this.fontPairing = 'swiss';
    this.brandAccentHex = '#2563EB';
    this.cards = [];
    this.seedStarterLayout();
    this.emitChange(true);
  }

  private applyCardSeedsToDocument(
    doc: BentoDocumentState,
    seeds: readonly ShowcaseCardSeed[]
  ): void {
    const specs = buildCellRenderSpecs(doc, { supportsCustomGeometry: true });
    const sortedSpecs = [...specs].sort((a, b) => a.zOrderIndex - b.zOrderIndex);
    const heroSpecs = sortedSpecs.filter((s) => s.role === 'hero');
    const otherSpecs = sortedSpecs.filter((s) => s.role !== 'hero');
    const orderedSpecs = [...heroSpecs, ...otherSpecs];

    const texts: Record<string, string> = {};
    const blocks: Record<string, CardBlockType> = {};
    const surfaces: Record<string, CardSurfaceTreatment> = {};
    const kickers: Record<string, string> = {};
    const icons: Record<string, CardIconId> = {};
    const aligns: Record<string, CardTextAlign> = {};
    const variants: Record<string, CardWidgetVariant> = {};
    const patterns: Record<string, CardPatternKind> = {};

    orderedSpecs.forEach((spec, idx) => {
      const seed = seeds[idx];
      if (!seed) return;
      texts[spec.slotId] = seed.text;
      blocks[spec.slotId] = seed.blockType ?? 'text';
      if (seed.widgetVariant) {
        variants[spec.slotId] = seed.widgetVariant;
      }
      if (seed.kicker) {
        kickers[spec.slotId] = seed.kicker;
      }
      icons[spec.slotId] = seed.icon ?? 'none';
      aligns[spec.slotId] = seed.textAlign ?? 'tl';
      surfaces[spec.slotId] =
        seed.surfaceTreatment ??
        (this.backdrop !== 'paper' && spec.role !== 'hero' ? 'glass' : 'solid');
      patterns[spec.slotId] = seed.pattern ?? 'none';
    });

    // Clear previous cards so stale media/kickers never bleed across showcases
    this.cards = [];
    this.applyDocumentDirectly(
      doc,
      texts,
      blocks,
      surfaces,
      kickers,
      icons,
      aligns,
      variants,
      patterns
    );
    this.selectedCardIds = [];
  }

  /** Wave 3 (#8): Apply one of the 12 curated Starter Showcases in a single undoable step. */
  public applyShowcase(showcase: StudioShowcase): { isDark: boolean } {
    this.pushUndo();

    const preset = CANVAS_PRESETS.find((p) => p.id === showcase.presetId);
    if (preset) {
      this.presetId = preset.id;
      this.canvasWidth = preset.width;
      this.canvasHeight = preset.height;
      this.canvasPadding = preset.defaultPadding;
    }

    this.isDarkTheme = Boolean(showcase.isDark);
    this.canvasBgHex = this.isDarkTheme ? '#0D0F0F' : '#FFFFFF';
    this.brandAccentHex = showcase.brandAccentHex;
    this.backdrop = showcase.backdrop;
    this.backdropImageUrl = undefined;
    this.grainEnabled = showcase.grainEnabled;
    this.cornerStyle = showcase.cornerStyle;
    this.fontPairing = showcase.fontPairing;

    const rect = computeArtboardContentRect(
      this.canvasWidth,
      this.canvasHeight,
      this.canvasPadding
    );
    const created = createIntentBentoDocument(rect, showcase.intent, {
      count: showcase.count,
      gutterPt: showcase.gutterPt,
      radiusPt: showcase.radiusPt,
      seed: showcase.seed,
      stylePreset: showcase.stylePreset,
      hierarchyMode: 'hero-accent',
    });

    if (created.ok) {
      this.seedTrail = [showcase.seed];
      this.seedIndex = 0;
      this.applyCardSeedsToDocument(created.value, showcase.cards);
    }

    this.emitChange(true);
    return { isDark: this.isDarkTheme };
  }

  /** Wave 3 (#9): Build a bounded Bento grid from parsed Raw Notes / Markdown. */
  public applyNotesPlan(plan: NotesToBentoPlan): boolean {
    if (plan.cards.length === 0) return false;
    this.pushUndo();

    const rect = computeArtboardContentRect(
      this.canvasWidth,
      this.canvasHeight,
      this.canvasPadding
    );
    const count = Math.max(2, Math.min(9, plan.cards.length));
    const baseSeed = this.activeDoc?.params.seed ?? 48219;
    const nextSeed = nextDeterministicSeed(baseSeed + count * 137);
    const created = createIntentBentoDocument(rect, plan.intent, {
      count,
      gutterPt: this.activeDoc?.params.gutterPt ?? 16,
      radiusPt: this.activeDoc?.params.radiusPt ?? 20,
      seed: nextSeed,
      stylePreset: this.activeDoc?.params.stylePreset ?? 'soft-modern',
      hierarchyMode: this.activeDoc?.params.hierarchyMode ?? 'hero-accent',
    });

    if (!created.ok) return false;

    this.seedTrail = [...this.seedTrail.slice(0, this.seedIndex + 1), nextSeed];
    this.seedIndex = this.seedTrail.length - 1;
    this.applyCardSeedsToDocument(created.value, plan.cards);
    this.emitChange(true);
    return true;
  }

  // --- Wave 4: Hover Micro-Interactions (#11) & Opt-in Multi-Slide Carousel (#12) ---

  public setHoverMode(mode: HoverInteractionMode): void {
    if (this.hoverMode === mode) return;
    this.pushUndo();
    this.hoverMode = mode;
    this.persistToLocalStorage();
    this.emitChange(false);
  }

  private loadSlideRecordIntoActiveCanvas(slide: StudioSlideRecord): void {
    const cloned = JSON.parse(JSON.stringify(slide)) as StudioSlideRecord;
    this.canvasBgHex = cloned.canvasBgHex;
    this.brandAccentHex = cloned.brandAccentHex;
    this.backdrop = cloned.backdrop;
    this.backdropImageUrl = cloned.backdropImageUrl;
    this.grainEnabled = cloned.grainEnabled;
    this.cornerStyle = cloned.cornerStyle;
    this.fontPairing = cloned.fontPairing;
    this.hoverMode = cloned.hoverMode ?? 'lift';
    this.activeDoc = cloned.activeDoc;
    this.cards = cloned.cards;
    this.selectedCardIds = [];
  }

  public addSlide(duplicateCurrent = false): void {
    this.syncActiveSlideRecord();
    this.pushUndo();

    const nextIdx = this.slides.length;
    if (duplicateCurrent) {
      const cloned = this.captureCurrentSlideRecord(
        `slide_${this.slideSeq++}`,
        `Slide ${nextIdx + 1}`
      );
      this.slides.push(cloned);
      this.activeSlideIndex = nextIdx;
      this.loadSlideRecordIntoActiveCanvas(cloned);
      this.persistToLocalStorage();
      this.emitChange(true);
      return;
    }

    // Create a fresh variation slide preserving the deck's artboard size, backdrop, brand, and fonts
    const rect = computeArtboardContentRect(
      this.canvasWidth,
      this.canvasHeight,
      this.canvasPadding
    );
    const seed = nextDeterministicSeed((this.activeDoc?.params.seed ?? 48219) + (nextIdx + 1) * 7919);
    const intent = this.activeDoc?.params.intent ?? 'executive-brief';
    const count = Math.max(3, Math.min(6, this.activeDoc?.params.count ?? 4));
    const created = createIntentBentoDocument(rect, intent, {
      count,
      gutterPt: this.activeDoc?.params.gutterPt ?? 16,
      radiusPt: this.activeDoc?.params.radiusPt ?? 20,
      seed,
      stylePreset: this.activeDoc?.params.stylePreset ?? 'soft-modern',
      hierarchyMode: this.activeDoc?.params.hierarchyMode ?? 'hero-accent',
    });

    if (created.ok) {
      this.cards = [];
      this.applyCardSeedsToDocument(created.value, [
        {
          text: `Slide ${nextIdx + 1}\nContinue your visual story with consistent Swiss alignment.`,
          kicker: `PART 0${nextIdx + 1}`,
          icon: 'layers',
          textAlign: 'bl',
          surfaceTreatment: 'mesh',
        },
        {
          text: 'Key Takeaway\nDouble-click any tile to write copy or switch widget type.',
          surfaceTreatment: this.backdrop !== 'paper' ? 'glass' : 'solid',
        },
        {
          text: '100%\nConsistent\nMatched brand kit & typography',
          blockType: 'kpi',
          surfaceTreatment: this.backdrop !== 'paper' ? 'glass' : 'solid',
        },
      ]);
      const newRecord = this.captureCurrentSlideRecord(`slide_${this.slideSeq++}`);
      this.slides.push(newRecord);
      this.activeSlideIndex = nextIdx;
    }

    this.emitChange(true);
  }

  public selectSlide(index: number): void {
    if (index < 0 || index >= this.slides.length || index === this.activeSlideIndex) return;
    this.syncActiveSlideRecord();
    this.activeSlideIndex = index;
    const target = this.slides[index];
    if (target) {
      this.loadSlideRecordIntoActiveCanvas(target);
    }
    this.persistToLocalStorage();
    this.emitChange(true);
  }

  public duplicateSlide(index: number): void {
    if (index < 0 || index >= this.slides.length) return;
    this.syncActiveSlideRecord();
    const source = this.slides[index]!;
    const cloned = JSON.parse(JSON.stringify(source)) as StudioSlideRecord;
    cloned.id = `slide_${this.slideSeq++}`;
    cloned.title = `${source.title} (Copy)`;
    this.slides.splice(index + 1, 0, cloned);
    this.activeSlideIndex = index + 1;
    this.loadSlideRecordIntoActiveCanvas(cloned);
    this.persistToLocalStorage();
    this.emitChange(true);
  }

  public deleteSlide(index: number): void {
    if (this.slides.length <= 1 || index < 0 || index >= this.slides.length) return;
    this.syncActiveSlideRecord();
    this.slides.splice(index, 1);
    const nextIdx = Math.min(index, this.slides.length - 1);
    this.activeSlideIndex = nextIdx;
    const target = this.slides[nextIdx];
    if (target) {
      this.loadSlideRecordIntoActiveCanvas(target);
    }
    this.persistToLocalStorage();
    this.emitChange(true);
  }

  public getAllSlideSnapshots(): StudioSnapshot[] {
    this.syncActiveSlideRecord();
    const base = this.getSnapshot();
    return this.slides.map((slide, idx) => ({
      ...base,
      canvasBgHex: slide.canvasBgHex,
      brandAccentHex: slide.brandAccentHex,
      backdrop: slide.backdrop,
      backdropImageUrl: slide.backdropImageUrl,
      grainEnabled: slide.grainEnabled,
      cornerStyle: slide.cornerStyle,
      fontPairing: slide.fontPairing,
      hoverMode: slide.hoverMode,
      activeDoc: slide.activeDoc,
      cards: slide.cards.map((c) => ({ ...c, rect: { ...c.rect }, style: { ...c.style } })),
      selectedCardIds: [],
      activeSlideIndex: idx,
    }));
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

    for (const spec of diff.create) {
      const id = `card_${this.cardSeq++}`;
      this.cards.push({
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
        icon: 'none',
        textAlign: 'tl',
        blockType: 'text',
        surfaceTreatment: this.backdrop !== 'paper' && spec.role !== 'hero' ? 'glass' : 'solid',
        style: { ...DEFAULT_CARD_STYLE, slotId: spec.slotId },
      });
    }

    const retireSet = new Set(diff.retireSlotIds);
    if (retireSet.size > 0) {
      this.cards = this.cards.filter((c) => !retireSet.has(c.slotId));
    }

    this.cards.sort((a, b) => a.zOrderIndex - b.zOrderIndex);
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
      card.style = card.imageDataUrl ? { ...style, textColorHex: '#FFFFFF' } : { ...style };
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

  public async applyEntranceAnimations(
    _bentoId: string,
    spec: EntranceAnimationSpec
  ): Promise<void> {
    this.activeAnimation = spec.preset === 'none' ? null : spec;
    this.animationRunId += 1;
    this.emitChange(false);
  }

  public onSelectionChanged(handler: () => void): () => void {
    this.selectionListeners.add(handler);
    return () => this.selectionListeners.delete(handler);
  }
}
