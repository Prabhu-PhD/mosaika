export type SplitAxis = 'vertical' | 'horizontal'; // vertical = left|right; horizontal = top/bottom
export type CellRole = 'standard' | 'hero' | 'image';
export type CellShapeKind = 'rect' | 'pill' | 'circle' | 'arch' | 'leaf' | 'chamfer';
export type CutoutCorner = 'tl' | 'tr' | 'bl' | 'br';

export type BentoSculptOverlay =
  | { kind: 'none' }
  | {
      kind: 'center-hub';
      /** Radius of the floating center circle as fraction of min(anchorW, anchorH) */
      radiusRatio: number;
      hubHint?: string;
    }
  | {
      kind: 'l-wrap';
      /** Corner where the nested companion tile sits while the hero card wraps around it in an L-shape */
      corner: CutoutCorner;
      insetWidthRatio: number;
      insetHeightRatio: number;
      insetShape?: CellShapeKind;
      insetHint?: string;
    };

export interface RectPt {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface BspSplitNode {
  kind: 'split';
  nodeId: string;
  axis: SplitAxis;
  ratio: number; // Fraction of available space (total - gutter) given to child A, in (0, 1)
  first: BspNode; // Left (vertical) or Top (horizontal)
  second: BspNode; // Right (vertical) or Bottom (horizontal)
}

export interface BspLeafNode {
  kind: 'leaf';
  nodeId: string;
  slotId: string; // Stable shape mapping ID, e.g. "slot_01"
  role: CellRole;
  locked: boolean;
  shapeKind?: CellShapeKind; // Optional sculptural card contour (defaults to 'rect')
  customStyleOverride?: boolean;
  contentHint?: string; // Optional semantic placeholder hint (e.g. "Core Takeaway", "KPI 1")
}

export type BspNode = BspSplitNode | BspLeafNode;

export type LayoutIntent =
  | 'executive-brief'
  | 'editorial-story'
  | 'kpi-dashboard'
  | 'product-showcase'
  | 'comparison'
  | 'matrix-grid'
  | 'brand-collage'
  | 'creative'
  | 'experimental'
  | 'sculpted'
  | 'puzzle'
  | 'freeform';

export type StylePresetId =
  | 'soft-modern'
  | 'swiss-editorial'
  | 'elevated-cards'
  | 'dark-surface'
  | 'tonal-flat'
  | 'wireframe';

export type HierarchyMode = 'uniform' | 'hero-accent' | 'tonal-ramp';

export type MultiSlideMode = 'exploration' | 'deck-builder';

export type GridSystemId = 'swiss-12x6' | 'deck-6x4' | 'matrix-4x3' | 'free';

export interface BentoParams {
  intent: LayoutIntent; // Narrative/communication intent driving BSP grammar
  gridSystem: GridSystemId; // Underlying Swiss modular track lattice (default 'swiss-12x6')
  count: number; // Integer, [2..maxCount], default 5 (or 1 if container < minW/minH)
  gutterPt: number; // Number, [0..36], step 1, default 10
  radiusPt: number; // Number, [0..32], step 1, default 12
  heroBias: number; // Number, [0..1], step 0.05, default 0.5
  seed: number; // Unsigned 32-bit integer [1..999999]
  stylePreset: StylePresetId;
  hierarchyMode: HierarchyMode;
  morphEnabled: boolean; // Default false (true when generating multi-slide with morph)
}

export interface BentoDocumentState {
  schemaVersion: '1.0';
  bentoId: string; // e.g. "bnt_7k2m9x"
  revision: number; // Monotonic integer incremented on every mutation
  anchorRect: RectPt;
  params: BentoParams;
  tree: BspNode;
  nextSlotSeq: number; // Monotonic counter for assigning unique slotIds
  /** Optional sculptural overlay (center circular hub or L-shaped concave corner wrap) */
  sculpt?: BentoSculptOverlay;
}

export type TemplateCategory =
  | 'executive'
  | 'data'
  | 'product'
  | 'editorial'
  | 'creative';

export interface BentoTemplate {
  id: string;
  name: string;
  category: TemplateCategory;
  caption: string;
  description: string;
  tags: readonly string[];
  params: Omit<BentoParams, 'morphEnabled'>;
  /** Optional deterministic mirror flip applied after BSP generation for directional variety */
  mirror?: 'horizontal' | 'vertical';
  slotHints?: readonly string[];
}
