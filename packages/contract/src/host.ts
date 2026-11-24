import type { CellRole, CellShapeKind, HierarchyMode, RectPt, StylePresetId } from './types.js';

export interface HostCapabilities {
  platform: 'browser-harness' | 'vsto' | 'officejs' | 'mac-dmg';
  supportsCornerRadius: boolean;
  supportsNativeUndoGrouping: boolean;
  supportsLiveThemeBinding: boolean;
  supportsShadows: boolean;
  supportsAutoMorph: boolean;
  supportsSelectionEvents: boolean;
  supportsImageCropScrim: boolean;
  supportsSlideDuplication: boolean;
  supportsCustomGeometry: boolean; // True when host can emit circles, pills, L-shapes & concave cutouts
}

export interface SelectionContext {
  slideId: string;
  slideBounds: RectPt; // e.g. 960 x 540 pt for 16:9 widescreen
  selectedShapeCount: number;
  selectedShapeBounds?: RectPt; // Populated if 1 non-bento shape selected
  activeBentoId?: string;
  hydratedStateJson?: string; // Highest BENTO_REV state on slide
  survivingSlotIds: string[]; // All live slotIds for activeBentoId
  selectedSlotIds: string[]; // Currently selected bento cells
  hasDuplicateSlotConflict: boolean;
}

export interface CellRenderSpec {
  slotId: string;
  rect: RectPt;
  cornerAdjustment: number; // [0..0.5]
  shapeKind?: CellShapeKind; // Defaults to 'rect'
  /** Optional local-coordinate (0..rect.width, 0..rect.height) SVG path for custom contours/cutouts */
  svgPath?: string;
  shapeName: string; // "!!bento_01" or "Bento Card 01"
  role: CellRole;
  locked: boolean;
  zOrderIndex: number;
  contentHint?: string; // Semantic ghost placeholder hint for empty cards
  tags: Record<string, string>; // BENTO_SCHEMA, BENTO_ID, BENTO_SLOT_ID, BENTO_REV, BENTO_STATE
}

export interface LayoutDiffPayload {
  bentoId: string;
  deletePlaceholderSelection: boolean; // True only on initial creation
  create: CellRenderSpec[];
  update: CellRenderSpec[];
  retireSlotIds: string[];
  commitUndoEntry: boolean; // True on pointer-up; false during live drag
}

export interface CellShadowSpec {
  blurPt: number;
  offsetXPt: number;
  offsetYPt: number;
  transparency: number;
  colorHex: string;
}

export interface CellStyleSpec {
  slotId: string;
  fillHex: string | null; // null = transparent / no fill
  themeFillSlot?: 'Background1' | 'Text1' | 'Accent1';
  themeTintAndShade?: number;
  borderColorHex: string | null;
  borderWeightPt: number;
  borderTransparency: number; // 0..1
  borderDashed: boolean;
  textColorHex: string;
  shadow?: CellShadowSpec | null;
}

export interface StyleApplyPayload {
  presetId: StylePresetId;
  hierarchyMode: HierarchyMode;
  cells: CellStyleSpec[];
  commitUndoEntry: boolean;
}

export interface MultiSlideItem {
  bentoId: string;
  cells: CellRenderSpec[];
  stylePayload: StyleApplyPayload;
  applyMorphTransition: boolean;
}

export interface IBentoHost {
  getCapabilities(): Promise<HostCapabilities>;
  getSelectionContext(): Promise<SelectionContext>;
  applyLayoutDiff(diff: LayoutDiffPayload): Promise<{ stashedCount: number }>;
  applyStyle(bentoId: string, payload: StyleApplyPayload): Promise<void>;
  syncStyleFromSelected(bentoId: string): Promise<void>;
  setImageSlot(
    bentoId: string,
    slotId: string,
    imageBase64: string,
    addScrim: boolean
  ): Promise<void>;
  generateMultiSlides(items: MultiSlideItem[]): Promise<{ createdSlideCount: number }>;
  reorderReadingOrder(bentoId: string, orderedSlotIds: string[]): Promise<void>;
  detachBento(bentoId: string): Promise<void>;
  onSelectionChanged?(handler: () => void): () => void;
}
