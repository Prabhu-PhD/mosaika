import type {
  BentoDocumentState,
  BentoParams,
  BentoResult,
  BentoTemplate,
  BspNode,
  GridSystemId,
  HierarchyMode,
  LayoutIntent,
  RectPt,
  StylePresetId,
  TemplateCategory,
} from '@bento/contract';
import { createBentoDocument, formatSlotId, mirrorBentoLayout } from './bsp.js';
import { type ResolvedLeaf, resolveTreeLayout, sortReadingOrder } from './geometry.js';
import { getIntentDefinition, LAYOUT_INTENTS } from './intents.js';
import { type ResolvedVisualCell, resolveVisualCells } from './shapes.js';

export interface TemplateCategoryMeta {
  id: TemplateCategory;
  label: string;
}

export const TEMPLATE_CATEGORIES: readonly TemplateCategoryMeta[] = [
  { id: 'executive', label: 'Executive' },
  { id: 'data', label: 'Data' },
  { id: 'product', label: 'Product' },
  { id: 'editorial', label: 'Editorial' },
  { id: 'creative', label: 'Creative' },
] as const;

export const TEMPLATES_PER_INTENT = 12;

export interface TemplatePreviewData {
  leaves: ResolvedLeaf[];
  cells: ResolvedVisualCell[];
  anchorRect: RectPt;
}

const DEFAULT_PREVIEW_RECT: RectPt = { left: 0, top: 0, width: 864, height: 390 };

const INTENT_TO_CATEGORY: Record<LayoutIntent, TemplateCategory> = {
  'executive-brief': 'executive',
  comparison: 'executive',
  'kpi-dashboard': 'data',
  'matrix-grid': 'data',
  'product-showcase': 'product',
  'brand-collage': 'product',
  'editorial-story': 'editorial',
  creative: 'creative',
  experimental: 'creative',
  sculpted: 'creative',
  puzzle: 'creative',
  freeform: 'product',
};

interface BlueprintSeedRecipe {
  count: number;
  heroBias: number;
  seed: number;
  gutterPt?: number;
  radiusPt?: number;
  gridSystem?: GridSystemId;
  stylePreset?: StylePresetId;
  hierarchyMode?: HierarchyMode;
  mirror?: 'horizontal' | 'vertical';
  caption?: string;
}

const INTENT_BLUEPRINT_RECIPES: Record<LayoutIntent, readonly BlueprintSeedRecipe[]> = {
  'executive-brief': [
    { count: 3, heroBias: 0.65, seed: 10113, stylePreset: 'soft-modern', hierarchyMode: 'hero-accent' },
    { count: 4, heroBias: 0.65, seed: 48219, stylePreset: 'soft-modern', hierarchyMode: 'hero-accent' },
    { count: 4, heroBias: 0.55, seed: 20419, mirror: 'horizontal', stylePreset: 'elevated-cards', hierarchyMode: 'hero-accent' },
    { count: 5, heroBias: 0.65, seed: 10412, stylePreset: 'elevated-cards', hierarchyMode: 'hero-accent' },
    { count: 5, heroBias: 0.72, seed: 33211, mirror: 'horizontal', stylePreset: 'soft-modern', hierarchyMode: 'tonal-ramp' },
    { count: 5, heroBias: 0.5, seed: 77813, gridSystem: 'deck-6x4', stylePreset: 'tonal-flat', hierarchyMode: 'hero-accent' },
    { count: 6, heroBias: 0.65, seed: 51907, stylePreset: 'soft-modern', hierarchyMode: 'hero-accent' },
    { count: 6, heroBias: 0.6, seed: 61291, mirror: 'vertical', stylePreset: 'dark-surface', hierarchyMode: 'hero-accent' },
    { count: 6, heroBias: 0.75, seed: 84103, mirror: 'horizontal', stylePreset: 'swiss-editorial', hierarchyMode: 'uniform' },
    { count: 7, heroBias: 0.62, seed: 91049, stylePreset: 'elevated-cards', hierarchyMode: 'tonal-ramp' },
    { count: 7, heroBias: 0.7, seed: 44317, mirror: 'horizontal', stylePreset: 'soft-modern', hierarchyMode: 'hero-accent' },
    { count: 8, heroBias: 0.65, seed: 65027, stylePreset: 'soft-modern', hierarchyMode: 'tonal-ramp' },
  ],
  'editorial-story': [
    { count: 3, heroBias: 0.62, seed: 11203, stylePreset: 'swiss-editorial', hierarchyMode: 'uniform' },
    { count: 4, heroBias: 0.65, seed: 19402, stylePreset: 'soft-modern', hierarchyMode: 'hero-accent' },
    { count: 4, heroBias: 0.55, seed: 28109, mirror: 'horizontal', stylePreset: 'swiss-editorial', hierarchyMode: 'uniform' },
    { count: 5, heroBias: 0.6, seed: 48219, stylePreset: 'swiss-editorial', hierarchyMode: 'uniform' },
    { count: 5, heroBias: 0.7, seed: 37411, mirror: 'horizontal', stylePreset: 'swiss-editorial', hierarchyMode: 'hero-accent' },
    { count: 5, heroBias: 0.52, seed: 59021, mirror: 'vertical', stylePreset: 'tonal-flat', hierarchyMode: 'tonal-ramp' },
    { count: 6, heroBias: 0.6, seed: 64109, stylePreset: 'swiss-editorial', hierarchyMode: 'uniform' },
    { count: 6, heroBias: 0.68, seed: 73217, mirror: 'horizontal', stylePreset: 'dark-surface', hierarchyMode: 'hero-accent' },
    { count: 6, heroBias: 0.48, seed: 82411, gridSystem: 'deck-6x4', stylePreset: 'swiss-editorial', hierarchyMode: 'tonal-ramp' },
    { count: 7, heroBias: 0.6, seed: 91513, stylePreset: 'swiss-editorial', hierarchyMode: 'uniform' },
    { count: 7, heroBias: 0.66, seed: 23741, mirror: 'vertical', stylePreset: 'soft-modern', hierarchyMode: 'hero-accent' },
    { count: 8, heroBias: 0.6, seed: 54917, stylePreset: 'swiss-editorial', hierarchyMode: 'tonal-ramp' },
  ],
  'kpi-dashboard': [
    { count: 4, heroBias: 0.55, seed: 14107, stylePreset: 'elevated-cards', hierarchyMode: 'tonal-ramp' },
    { count: 5, heroBias: 0.55, seed: 48219, stylePreset: 'elevated-cards', hierarchyMode: 'tonal-ramp' },
    { count: 5, heroBias: 0.65, seed: 29413, mirror: 'vertical', stylePreset: 'soft-modern', hierarchyMode: 'hero-accent' },
    { count: 6, heroBias: 0.6, seed: 73104, stylePreset: 'soft-modern', hierarchyMode: 'hero-accent' },
    { count: 6, heroBias: 0.5, seed: 38219, mirror: 'horizontal', stylePreset: 'dark-surface', hierarchyMode: 'tonal-ramp' },
    { count: 6, heroBias: 0.68, seed: 61409, mirror: 'vertical', stylePreset: 'elevated-cards', hierarchyMode: 'hero-accent' },
    { count: 7, heroBias: 0.55, seed: 88241, stylePreset: 'dark-surface', hierarchyMode: 'tonal-ramp' },
    { count: 7, heroBias: 0.62, seed: 42917, mirror: 'vertical', stylePreset: 'elevated-cards', hierarchyMode: 'tonal-ramp' },
    { count: 8, heroBias: 0.55, seed: 55109, stylePreset: 'soft-modern', hierarchyMode: 'tonal-ramp' },
    { count: 8, heroBias: 0.65, seed: 67813, mirror: 'horizontal', stylePreset: 'dark-surface', hierarchyMode: 'hero-accent' },
    { count: 9, heroBias: 0.55, seed: 79201, stylePreset: 'elevated-cards', hierarchyMode: 'tonal-ramp' },
    { count: 10, heroBias: 0.52, seed: 91307, stylePreset: 'soft-modern', hierarchyMode: 'tonal-ramp' },
  ],
  'product-showcase': [
    { count: 3, heroBias: 0.72, seed: 13109, stylePreset: 'dark-surface', hierarchyMode: 'hero-accent' },
    { count: 4, heroBias: 0.7, seed: 24211, stylePreset: 'soft-modern', hierarchyMode: 'hero-accent' },
    { count: 5, heroBias: 0.75, seed: 48219, stylePreset: 'dark-surface', hierarchyMode: 'hero-accent' },
    { count: 5, heroBias: 0.6, seed: 35317, gridSystem: 'deck-6x4', stylePreset: 'elevated-cards', hierarchyMode: 'hero-accent' },
    { count: 5, heroBias: 0.8, seed: 57103, mirror: 'vertical', stylePreset: 'dark-surface', hierarchyMode: 'tonal-ramp' },
    { count: 6, heroBias: 0.65, seed: 31904, stylePreset: 'soft-modern', hierarchyMode: 'hero-accent' },
    { count: 6, heroBias: 0.75, seed: 68411, mirror: 'horizontal', stylePreset: 'dark-surface', hierarchyMode: 'hero-accent' },
    { count: 7, heroBias: 0.72, seed: 79519, stylePreset: 'dark-surface', hierarchyMode: 'hero-accent' },
    { count: 7, heroBias: 0.6, seed: 81613, mirror: 'vertical', stylePreset: 'tonal-flat', hierarchyMode: 'hero-accent' },
    { count: 8, heroBias: 0.7, seed: 92717, stylePreset: 'soft-modern', hierarchyMode: 'hero-accent' },
    { count: 8, heroBias: 0.78, seed: 16421, mirror: 'horizontal', stylePreset: 'dark-surface', hierarchyMode: 'tonal-ramp' },
    { count: 9, heroBias: 0.72, seed: 43819, stylePreset: 'dark-surface', hierarchyMode: 'hero-accent' },
  ],
  comparison: [
    { count: 2, heroBias: 0.0, seed: 10011, gridSystem: 'deck-6x4', stylePreset: 'soft-modern', hierarchyMode: 'uniform' },
    { count: 3, heroBias: 0.0, seed: 20023, gridSystem: 'swiss-12x6', stylePreset: 'soft-modern', hierarchyMode: 'uniform' },
    { count: 3, heroBias: 0.0, seed: 30031, mirror: 'horizontal', gridSystem: 'swiss-12x6', stylePreset: 'tonal-flat', hierarchyMode: 'uniform' },
    { count: 4, heroBias: 0.0, seed: 48219, gridSystem: 'deck-6x4', stylePreset: 'soft-modern', hierarchyMode: 'uniform' },
    { count: 4, heroBias: 0.25, seed: 41047, mirror: 'vertical', gridSystem: 'swiss-12x6', stylePreset: 'elevated-cards', hierarchyMode: 'tonal-ramp' },
    { count: 5, heroBias: 0.0, seed: 52051, gridSystem: 'swiss-12x6', stylePreset: 'soft-modern', hierarchyMode: 'uniform' },
    { count: 5, heroBias: 0.0, seed: 63067, mirror: 'horizontal', gridSystem: 'swiss-12x6', stylePreset: 'dark-surface', hierarchyMode: 'uniform' },
    { count: 6, heroBias: 0.0, seed: 22109, gridSystem: 'swiss-12x6', stylePreset: 'tonal-flat', hierarchyMode: 'tonal-ramp' },
    { count: 6, heroBias: 0.2, seed: 74077, mirror: 'vertical', gridSystem: 'deck-6x4', stylePreset: 'swiss-editorial', hierarchyMode: 'uniform' },
    { count: 7, heroBias: 0.0, seed: 85081, gridSystem: 'swiss-12x6', stylePreset: 'soft-modern', hierarchyMode: 'uniform' },
    { count: 8, heroBias: 0.0, seed: 96097, gridSystem: 'swiss-12x6', stylePreset: 'elevated-cards', hierarchyMode: 'uniform' },
    { count: 9, heroBias: 0.0, seed: 17117, gridSystem: 'swiss-12x6', stylePreset: 'soft-modern', hierarchyMode: 'tonal-ramp' },
  ],
  'matrix-grid': [
    { count: 4, heroBias: 0.5, seed: 12011, gutterPt: 0, radiusPt: 0, gridSystem: 'matrix-4x3', stylePreset: 'dark-surface', hierarchyMode: 'tonal-ramp' },
    { count: 4, heroBias: 0.5, seed: 22019, mirror: 'horizontal', gutterPt: 0, radiusPt: 0, gridSystem: 'matrix-4x3', stylePreset: 'swiss-editorial', hierarchyMode: 'uniform' },
    { count: 5, heroBias: 0.5, seed: 32027, gutterPt: 0, radiusPt: 0, gridSystem: 'matrix-4x3', stylePreset: 'dark-surface', hierarchyMode: 'tonal-ramp' },
    { count: 5, heroBias: 0.5, seed: 42037, mirror: 'vertical', gutterPt: 0, radiusPt: 0, gridSystem: 'matrix-4x3', stylePreset: 'swiss-editorial', hierarchyMode: 'uniform' },
    { count: 6, heroBias: 0.45, seed: 48219, gutterPt: 0, radiusPt: 0, gridSystem: 'matrix-4x3', stylePreset: 'swiss-editorial', hierarchyMode: 'uniform' },
    { count: 6, heroBias: 0.5, seed: 52051, mirror: 'horizontal', gutterPt: 0, radiusPt: 0, gridSystem: 'matrix-4x3', stylePreset: 'dark-surface', hierarchyMode: 'tonal-ramp' },
    { count: 7, heroBias: 0.5, seed: 62063, gutterPt: 0, radiusPt: 0, gridSystem: 'matrix-4x3', stylePreset: 'dark-surface', hierarchyMode: 'tonal-ramp' },
    { count: 8, heroBias: 0.5, seed: 72073, gutterPt: 0, radiusPt: 0, gridSystem: 'matrix-4x3', stylePreset: 'dark-surface', hierarchyMode: 'tonal-ramp' },
    { count: 8, heroBias: 0.5, seed: 82081, mirror: 'horizontal', gutterPt: 0, radiusPt: 0, gridSystem: 'matrix-4x3', stylePreset: 'wireframe', hierarchyMode: 'uniform' },
    { count: 9, heroBias: 0.5, seed: 48219, gutterPt: 0, radiusPt: 0, gridSystem: 'matrix-4x3', stylePreset: 'dark-surface', hierarchyMode: 'tonal-ramp' },
    { count: 9, heroBias: 0.5, seed: 92093, mirror: 'horizontal', gutterPt: 0, radiusPt: 0, gridSystem: 'matrix-4x3', stylePreset: 'swiss-editorial', hierarchyMode: 'tonal-ramp' },
    { count: 10, heroBias: 0.5, seed: 18211, gutterPt: 0, radiusPt: 0, gridSystem: 'matrix-4x3', stylePreset: 'dark-surface', hierarchyMode: 'tonal-ramp' },
  ],
  'brand-collage': [
    { count: 4, heroBias: 0.55, seed: 14101, stylePreset: 'soft-modern', hierarchyMode: 'hero-accent' },
    { count: 5, heroBias: 0.55, seed: 24203, stylePreset: 'soft-modern', hierarchyMode: 'hero-accent' },
    { count: 5, heroBias: 0.6, seed: 34301, mirror: 'vertical', stylePreset: 'dark-surface', hierarchyMode: 'hero-accent' },
    { count: 6, heroBias: 0.5, seed: 64011, radiusPt: 0, stylePreset: 'swiss-editorial', hierarchyMode: 'tonal-ramp' },
    { count: 6, heroBias: 0.58, seed: 44417, mirror: 'horizontal', stylePreset: 'soft-modern', hierarchyMode: 'hero-accent' },
    { count: 7, heroBias: 0.55, seed: 48219, stylePreset: 'soft-modern', hierarchyMode: 'hero-accent' },
    { count: 7, heroBias: 0.62, seed: 54517, mirror: 'vertical', stylePreset: 'elevated-cards', hierarchyMode: 'hero-accent' },
    { count: 7, heroBias: 0.5, seed: 64613, mirror: 'horizontal', stylePreset: 'dark-surface', hierarchyMode: 'tonal-ramp' },
    { count: 8, heroBias: 0.55, seed: 74719, stylePreset: 'soft-modern', hierarchyMode: 'hero-accent' },
    { count: 8, heroBias: 0.6, seed: 84811, mirror: 'horizontal', stylePreset: 'tonal-flat', hierarchyMode: 'hero-accent' },
    { count: 9, heroBias: 0.55, seed: 94907, stylePreset: 'soft-modern', hierarchyMode: 'tonal-ramp' },
    { count: 10, heroBias: 0.55, seed: 19507, stylePreset: 'swiss-editorial', hierarchyMode: 'hero-accent' },
  ],
  creative: [
    { count: 4, heroBias: 0.7, seed: 10001, gridSystem: 'free', stylePreset: 'swiss-editorial', hierarchyMode: 'hero-accent' },
    { count: 4, heroBias: 0.68, seed: 20011, mirror: 'horizontal', gridSystem: 'free', stylePreset: 'tonal-flat', hierarchyMode: 'hero-accent' },
    { count: 5, heroBias: 0.72, seed: 20017, gridSystem: 'swiss-12x6', stylePreset: 'tonal-flat', hierarchyMode: 'hero-accent' },
    { count: 5, heroBias: 0.66, seed: 30029, gridSystem: 'free', stylePreset: 'soft-modern', hierarchyMode: 'hero-accent' },
    { count: 5, heroBias: 0.74, seed: 40037, mirror: 'vertical', gridSystem: 'free', stylePreset: 'dark-surface', hierarchyMode: 'hero-accent' },
    { count: 6, heroBias: 0.7, seed: 10004, gridSystem: 'free', stylePreset: 'swiss-editorial', hierarchyMode: 'hero-accent' },
    { count: 6, heroBias: 0.65, seed: 50047, gridSystem: 'free', stylePreset: 'elevated-cards', hierarchyMode: 'tonal-ramp' },
    { count: 6, heroBias: 0.75, seed: 60059, mirror: 'horizontal', gridSystem: 'swiss-12x6', stylePreset: 'swiss-editorial', hierarchyMode: 'hero-accent' },
    { count: 7, heroBias: 0.7, seed: 70067, gridSystem: 'free', stylePreset: 'soft-modern', hierarchyMode: 'hero-accent' },
    { count: 7, heroBias: 0.68, seed: 80077, mirror: 'vertical', gridSystem: 'free', stylePreset: 'dark-surface', hierarchyMode: 'tonal-ramp' },
    { count: 8, heroBias: 0.72, seed: 90089, gridSystem: 'free', stylePreset: 'swiss-editorial', hierarchyMode: 'hero-accent' },
    { count: 9, heroBias: 0.7, seed: 15107, gridSystem: 'free', stylePreset: 'tonal-flat', hierarchyMode: 'tonal-ramp' },
  ],
  experimental: [
    { count: 4, heroBias: 0.8, seed: 11003, gutterPt: 6, radiusPt: 0, gridSystem: 'free', stylePreset: 'dark-surface', hierarchyMode: 'tonal-ramp' },
    { count: 5, heroBias: 0.78, seed: 21011, gutterPt: 6, radiusPt: 0, gridSystem: 'free', stylePreset: 'swiss-editorial', hierarchyMode: 'hero-accent' },
    { count: 5, heroBias: 0.82, seed: 31019, mirror: 'horizontal', gutterPt: 4, radiusPt: 0, gridSystem: 'free', stylePreset: 'dark-surface', hierarchyMode: 'hero-accent' },
    { count: 6, heroBias: 0.8, seed: 48219, gutterPt: 6, radiusPt: 0, gridSystem: 'free', stylePreset: 'dark-surface', hierarchyMode: 'tonal-ramp' },
    { count: 6, heroBias: 0.76, seed: 41027, mirror: 'vertical', gutterPt: 6, radiusPt: 0, gridSystem: 'free', stylePreset: 'wireframe', hierarchyMode: 'uniform' },
    { count: 6, heroBias: 0.84, seed: 51031, gutterPt: 0, radiusPt: 0, gridSystem: 'free', stylePreset: 'dark-surface', hierarchyMode: 'tonal-ramp' },
    { count: 7, heroBias: 0.75, seed: 91207, gutterPt: 8, radiusPt: 0, gridSystem: 'free', stylePreset: 'swiss-editorial', hierarchyMode: 'hero-accent' },
    { count: 7, heroBias: 0.82, seed: 61043, mirror: 'horizontal', gutterPt: 6, radiusPt: 0, gridSystem: 'free', stylePreset: 'dark-surface', hierarchyMode: 'tonal-ramp' },
    { count: 8, heroBias: 0.8, seed: 71059, gutterPt: 6, radiusPt: 0, gridSystem: 'free', stylePreset: 'dark-surface', hierarchyMode: 'tonal-ramp' },
    { count: 8, heroBias: 0.76, seed: 81071, mirror: 'vertical', gutterPt: 8, radiusPt: 0, gridSystem: 'free', stylePreset: 'swiss-editorial', hierarchyMode: 'hero-accent' },
    { count: 9, heroBias: 0.82, seed: 91081, gutterPt: 4, radiusPt: 0, gridSystem: 'free', stylePreset: 'dark-surface', hierarchyMode: 'tonal-ramp' },
    { count: 10, heroBias: 0.8, seed: 16217, gutterPt: 4, radiusPt: 0, gridSystem: 'free', stylePreset: 'dark-surface', hierarchyMode: 'tonal-ramp' },
  ],
  sculpted: [
    { count: 3, heroBias: 0.6, seed: 10103, gutterPt: 12, radiusPt: 18, stylePreset: 'soft-modern', hierarchyMode: 'hero-accent' },
    { count: 4, heroBias: 0.55, seed: 20207, gutterPt: 12, radiusPt: 18, stylePreset: 'soft-modern', hierarchyMode: 'hero-accent' },
    { count: 4, heroBias: 0.65, seed: 30313, mirror: 'horizontal', gutterPt: 12, radiusPt: 18, stylePreset: 'elevated-cards', hierarchyMode: 'hero-accent' },
    { count: 5, heroBias: 0.6, seed: 40423, gutterPt: 12, radiusPt: 18, stylePreset: 'soft-modern', hierarchyMode: 'hero-accent' },
    { count: 5, heroBias: 0.55, seed: 50527, mirror: 'vertical', gutterPt: 12, radiusPt: 18, stylePreset: 'tonal-flat', hierarchyMode: 'tonal-ramp' },
    { count: 5, heroBias: 0.7, seed: 60631, gutterPt: 10, radiusPt: 18, stylePreset: 'dark-surface', hierarchyMode: 'hero-accent' },
    { count: 6, heroBias: 0.6, seed: 70729, gutterPt: 12, radiusPt: 18, stylePreset: 'soft-modern', hierarchyMode: 'hero-accent' },
    { count: 6, heroBias: 0.5, seed: 80833, mirror: 'horizontal', gutterPt: 12, radiusPt: 18, stylePreset: 'swiss-editorial', hierarchyMode: 'hero-accent' },
    { count: 6, heroBias: 0.68, seed: 90947, gutterPt: 10, radiusPt: 18, stylePreset: 'elevated-cards', hierarchyMode: 'tonal-ramp' },
    { count: 7, heroBias: 0.6, seed: 15137, gutterPt: 10, radiusPt: 16, stylePreset: 'soft-modern', hierarchyMode: 'hero-accent' },
    { count: 7, heroBias: 0.65, seed: 25243, mirror: 'vertical', gutterPt: 10, radiusPt: 16, stylePreset: 'dark-surface', hierarchyMode: 'tonal-ramp' },
    { count: 8, heroBias: 0.6, seed: 35353, gutterPt: 10, radiusPt: 16, stylePreset: 'soft-modern', hierarchyMode: 'tonal-ramp' },
  ],
  puzzle: [
    { count: 3, heroBias: 0.62, seed: 10007, gutterPt: 12, radiusPt: 16, stylePreset: 'elevated-cards', hierarchyMode: 'hero-accent' },
    { count: 3, heroBias: 0.66, seed: 20013, mirror: 'horizontal', gutterPt: 12, radiusPt: 16, stylePreset: 'soft-modern', hierarchyMode: 'hero-accent' },
    { count: 4, heroBias: 0.55, seed: 10002, gutterPt: 12, radiusPt: 16, stylePreset: 'elevated-cards', hierarchyMode: 'hero-accent' },
    { count: 4, heroBias: 0.64, seed: 30019, gutterPt: 12, radiusPt: 16, stylePreset: 'soft-modern', hierarchyMode: 'hero-accent' },
    { count: 4, heroBias: 0.6, seed: 40024, mirror: 'vertical', gutterPt: 12, radiusPt: 16, stylePreset: 'dark-surface', hierarchyMode: 'hero-accent' },
    { count: 5, heroBias: 0.6, seed: 50031, gutterPt: 12, radiusPt: 16, stylePreset: 'soft-modern', hierarchyMode: 'hero-accent' },
    { count: 5, heroBias: 0.68, seed: 60041, mirror: 'horizontal', gutterPt: 12, radiusPt: 16, stylePreset: 'tonal-flat', hierarchyMode: 'hero-accent' },
    { count: 5, heroBias: 0.55, seed: 70048, gutterPt: 12, radiusPt: 16, stylePreset: 'dark-surface', hierarchyMode: 'tonal-ramp' },
    { count: 6, heroBias: 0.62, seed: 80053, gutterPt: 10, radiusPt: 14, stylePreset: 'elevated-cards', hierarchyMode: 'hero-accent' },
    { count: 6, heroBias: 0.58, seed: 90062, mirror: 'vertical', gutterPt: 10, radiusPt: 14, stylePreset: 'soft-modern', hierarchyMode: 'tonal-ramp' },
    { count: 7, heroBias: 0.64, seed: 14117, gutterPt: 10, radiusPt: 14, stylePreset: 'swiss-editorial', hierarchyMode: 'hero-accent' },
    { count: 8, heroBias: 0.6, seed: 24229, gutterPt: 10, radiusPt: 14, stylePreset: 'elevated-cards', hierarchyMode: 'tonal-ramp' },
  ],
  freeform: [
    { count: 3, heroBias: 0.45, seed: 12301, gridSystem: 'deck-6x4', stylePreset: 'soft-modern', hierarchyMode: 'hero-accent' },
    { count: 4, heroBias: 0.5, seed: 23417, gridSystem: 'swiss-12x6', stylePreset: 'soft-modern', hierarchyMode: 'hero-accent' },
    { count: 4, heroBias: 0.0, seed: 34519, gridSystem: 'deck-6x4', stylePreset: 'wireframe', hierarchyMode: 'uniform' },
    { count: 5, heroBias: 0.5, seed: 48219, gridSystem: 'swiss-12x6', stylePreset: 'soft-modern', hierarchyMode: 'hero-accent' },
    { count: 5, heroBias: 0.7, seed: 45613, mirror: 'horizontal', gridSystem: 'swiss-12x6', stylePreset: 'elevated-cards', hierarchyMode: 'hero-accent' },
    { count: 6, heroBias: 0.5, seed: 55102, gridSystem: 'deck-6x4', stylePreset: 'wireframe', hierarchyMode: 'uniform' },
    { count: 6, heroBias: 0.65, seed: 67819, gridSystem: 'swiss-12x6', stylePreset: 'tonal-flat', hierarchyMode: 'tonal-ramp' },
    { count: 6, heroBias: 0.35, seed: 78901, mirror: 'vertical', gridSystem: 'swiss-12x6', stylePreset: 'dark-surface', hierarchyMode: 'tonal-ramp' },
    { count: 7, heroBias: 0.55, seed: 89017, gridSystem: 'swiss-12x6', stylePreset: 'soft-modern', hierarchyMode: 'hero-accent' },
    { count: 7, heroBias: 0.72, seed: 19121, mirror: 'horizontal', gridSystem: 'free', stylePreset: 'swiss-editorial', hierarchyMode: 'hero-accent' },
    { count: 8, heroBias: 0.5, seed: 29231, gridSystem: 'swiss-12x6', stylePreset: 'elevated-cards', hierarchyMode: 'tonal-ramp' },
    { count: 9, heroBias: 0.6, seed: 39341, gridSystem: 'swiss-12x6', stylePreset: 'soft-modern', hierarchyMode: 'tonal-ramp' },
  ],
};

function computeGeometryFingerprint(cells: readonly ResolvedVisualCell[], anchorRect: RectPt): string {
  const w = Math.max(1, anchorRect.width);
  const h = Math.max(1, anchorRect.height);
  return cells
    .map((cell) => {
      const l = Math.round(((cell.rect.left - anchorRect.left) / w) * 50);
      const t = Math.round(((cell.rect.top - anchorRect.top) / h) * 50);
      const rw = Math.round((cell.rect.width / w) * 50);
      const rh = Math.round((cell.rect.height / h) * 50);
      const hasCutout = cell.svgPath && cell.shapeKind === 'rect' ? 'C' : cell.shapeKind[0];
      return `${l},${t},${rw},${rh},${cell.role === 'hero' ? 'H' : 'S'},${hasCutout}`;
    })
    .join('|');
}

const previewCache = new Map<string, TemplatePreviewData>();

function buildDeduplicatedCatalog(): readonly BentoTemplate[] {
  const catalog: BentoTemplate[] = [];

  for (const intentDef of LAYOUT_INTENTS) {
    const intent = intentDef.id;
    const rec = intentDef.recommendedParams;
    const recipes = INTENT_BLUEPRINT_RECIPES[intent];
    const seenFingerprints = new Set<string>();

    recipes.forEach((recipe, idx) => {
      const num = String(idx + 1).padStart(2, '0');
      const baseId = `${intent}-${num}`;

      let chosenSeed = recipe.seed;
      let chosenMirror = recipe.mirror;
      let chosenGrid: GridSystemId = recipe.gridSystem ?? rec.gridSystem ?? 'swiss-12x6';
      let chosenLeaves: ResolvedLeaf[] = [];
      let chosenCells: ResolvedVisualCell[] = [];
      let chosenAnchor: RectPt = DEFAULT_PREVIEW_RECT;

      // Deterministically advance seed/mirror if needed so all 12 blueprints per intent have unique geometry
      for (let attempt = 0; attempt < 24; attempt++) {
        const candidateSeed = chosenSeed + attempt * 7919;
        const candidateMirror =
          attempt === 0
            ? recipe.mirror
            : attempt % 3 === 1
              ? 'horizontal'
              : attempt % 3 === 2
                ? 'vertical'
                : undefined;

        const candidateTemplate: BentoTemplate = {
          id: baseId,
          name: `${intentDef.label} ${idx + 1}`,
          category: INTENT_TO_CATEGORY[intent],
          caption: recipe.caption ?? `${recipe.count} cards`,
          description: `${intentDef.label} blueprint (${recipe.count} cards) — ${intentDef.description}`,
          tags: [
            intent,
            intentDef.label.toLowerCase(),
            INTENT_TO_CATEGORY[intent],
            `${recipe.count} cards`,
            recipe.stylePreset ?? rec.stylePreset,
          ],
          params: {
            intent,
            gridSystem: chosenGrid,
            count: recipe.count,
            gutterPt: recipe.gutterPt ?? rec.gutterPt,
            radiusPt: recipe.radiusPt ?? rec.radiusPt,
            heroBias: recipe.heroBias,
            seed: candidateSeed,
            stylePreset: recipe.stylePreset ?? rec.stylePreset,
            hierarchyMode: recipe.hierarchyMode ?? rec.hierarchyMode,
          },
          ...(candidateMirror ? { mirror: candidateMirror } : {}),
        };

        const built = createDocumentFromTemplate(DEFAULT_PREVIEW_RECT, candidateTemplate);
        if (!built.ok) continue;

        const leaves = sortReadingOrder(
          resolveTreeLayout(built.value.tree, built.value.anchorRect, built.value.params.gutterPt)
        );
        const cells = resolveVisualCells(built.value);
        const fp = computeGeometryFingerprint(cells, built.value.anchorRect);

        chosenLeaves = leaves;
        chosenCells = cells;
        chosenAnchor = built.value.anchorRect;

        if (!seenFingerprints.has(fp) || attempt === 23) {
          seenFingerprints.add(fp);
          chosenSeed = candidateSeed;
          chosenMirror = candidateMirror;
          break;
        }
      }

      const finalTemplate: BentoTemplate = {
        id: baseId,
        name: `${intentDef.label} ${idx + 1}`,
        category: INTENT_TO_CATEGORY[intent],
        caption: `${recipe.count} cards`,
        description: `${intentDef.label} blueprint (${recipe.count} cards) — ${intentDef.description}`,
        tags: [
          intent,
          intentDef.label.toLowerCase(),
          INTENT_TO_CATEGORY[intent],
          `${recipe.count} cards`,
          recipe.stylePreset ?? rec.stylePreset,
        ],
        params: {
          intent,
          gridSystem: chosenGrid,
          count: recipe.count,
          gutterPt: recipe.gutterPt ?? rec.gutterPt,
          radiusPt: recipe.radiusPt ?? rec.radiusPt,
          heroBias: recipe.heroBias,
          seed: chosenSeed,
          stylePreset: recipe.stylePreset ?? rec.stylePreset,
          hierarchyMode: recipe.hierarchyMode ?? rec.hierarchyMode,
        },
        ...(chosenMirror ? { mirror: chosenMirror } : {}),
      };

      catalog.push(finalTemplate);
      previewCache.set(
        `${finalTemplate.id}:${DEFAULT_PREVIEW_RECT.width}x${DEFAULT_PREVIEW_RECT.height}`,
        { leaves: chosenLeaves, cells: chosenCells, anchorRect: chosenAnchor }
      );
    });
  }

  return catalog;
}

function applyCustomSlotHints(
  tree: BspNode,
  anchorRect: RectPt,
  gutterPt: number,
  slotHints?: readonly string[]
): BspNode {
  if (!slotHints || slotHints.length === 0) {
    return tree;
  }
  const sorted = sortReadingOrder(resolveTreeLayout(tree, anchorRect, gutterPt));
  const hintByNodeId = new Map<string, string>();
  sorted.forEach((item, idx) => {
    const custom = slotHints[idx];
    if (custom) {
      hintByNodeId.set(item.leaf.nodeId, custom);
    }
  });

  function visit(node: BspNode): BspNode {
    if (node.kind === 'leaf') {
      const hint = hintByNodeId.get(node.nodeId);
      return hint ? { ...node, contentHint: hint } : node;
    }
    return {
      ...node,
      first: visit(node.first),
      second: visit(node.second),
    };
  }

  return visit(tree);
}

/**
 * Generates a brand-new editable BentoDocumentState from a curated library template.
 */
export function createDocumentFromTemplate(
  anchorRect: RectPt,
  template: BentoTemplate,
  overrides?: Partial<BentoParams>,
  options?: { bentoId?: string; salt?: number }
): BentoResult<BentoDocumentState> {
  const res = createBentoDocument(
    anchorRect,
    {
      ...template.params,
      ...overrides,
    },
    options
  );
  if (!res.ok) {
    return res;
  }

  let doc = res.value;
  if (template.mirror) {
    const mirrored = mirrorBentoLayout(doc, template.mirror);
    if (mirrored.ok) {
      doc = {
        ...mirrored.value,
        revision: doc.revision,
      };
    }
  }

  const nextTree = applyCustomSlotHints(
    doc.tree,
    doc.anchorRect,
    doc.params.gutterPt,
    template.slotHints
  );

  return {
    ...res,
    value: {
      ...doc,
      tree: nextTree,
    },
  };
}

/**
 * Non-destructively swaps an active BentoDocumentState to a library template.
 * Preserves bentoId, morphEnabled, and reading-order slotIds so user text migrates cleanly
 * into the new layout (and overflow cards are safely stashed off-slide by computeLayoutDiff).
 */
export function applyTemplateToDocument(
  existingState: BentoDocumentState,
  template: BentoTemplate,
  options?: { preserveCornerRadius?: boolean; preserveStyle?: boolean }
): BentoResult<BentoDocumentState> {
  const radiusOverride = options?.preserveCornerRadius
    ? { radiusPt: existingState.params.radiusPt }
    : {};
  const styleOverride = options?.preserveStyle
    ? {
        stylePreset: existingState.params.stylePreset,
        hierarchyMode: existingState.params.hierarchyMode,
      }
    : {};

  const fresh = createDocumentFromTemplate(
    existingState.anchorRect,
    template,
    {
      morphEnabled: existingState.params.morphEnabled,
      ...radiusOverride,
      ...styleOverride,
    },
    { bentoId: existingState.bentoId }
  );
  if (!fresh.ok) {
    return fresh;
  }

  const existingSlots = sortReadingOrder(
    resolveTreeLayout(existingState.tree, existingState.anchorRect, existingState.params.gutterPt)
  ).map((item) => item.leaf.slotId);

  const nextSorted = sortReadingOrder(
    resolveTreeLayout(fresh.value.tree, fresh.value.anchorRect, fresh.value.params.gutterPt)
  );

  let nextSeq = existingState.nextSlotSeq;
  const slotMap = new Map<string, string>();
  nextSorted.forEach((item, idx) => {
    const reusable = existingSlots[idx];
    if (reusable) {
      slotMap.set(item.leaf.nodeId, reusable);
    } else {
      slotMap.set(item.leaf.nodeId, formatSlotId(nextSeq));
      nextSeq += 1;
    }
  });

  function remapSlots(node: BspNode): BspNode {
    if (node.kind === 'leaf') {
      return {
        ...node,
        slotId: slotMap.get(node.nodeId) ?? node.slotId,
      };
    }
    return {
      ...node,
      first: remapSlots(node.first),
      second: remapSlots(node.second),
    };
  }

  return {
    ...fresh,
    value: {
      ...fresh.value,
      bentoId: existingState.bentoId,
      revision: existingState.revision + 1,
      tree: remapSlots(fresh.value.tree),
      nextSlotSeq: nextSeq,
    },
  };
}

export const BENTO_TEMPLATES: readonly BentoTemplate[] = buildDeduplicatedCatalog();

export function getTemplateById(templateId: string): BentoTemplate | undefined {
  return BENTO_TEMPLATES.find((t) => t.id === templateId);
}

export function getTemplatesByIntent(intent: LayoutIntent): readonly BentoTemplate[] {
  return BENTO_TEMPLATES.filter((t) => t.params.intent === intent).sort(
    (a, b) => a.params.count - b.params.count
  );
}

export function filterTemplatesByIntent(
  intent: LayoutIntent | 'all',
  query?: string
): readonly BentoTemplate[] {
  const normalizedQuery = query?.trim().toLowerCase() ?? '';
  return BENTO_TEMPLATES.filter((t) => {
    if (intent !== 'all' && t.params.intent !== intent) {
      return false;
    }
    if (!normalizedQuery) {
      return true;
    }
    return (
      t.name.toLowerCase().includes(normalizedQuery) ||
      t.caption.toLowerCase().includes(normalizedQuery) ||
      t.description.toLowerCase().includes(normalizedQuery) ||
      t.tags.some((tag) => tag.toLowerCase().includes(normalizedQuery))
    );
  });
}

export function filterTemplates(
  category: TemplateCategory | 'all',
  query?: string
): readonly BentoTemplate[] {
  const normalizedQuery = query?.trim().toLowerCase() ?? '';
  return BENTO_TEMPLATES.filter((t) => {
    if (category !== 'all' && t.category !== category) {
      return false;
    }
    if (!normalizedQuery) {
      return true;
    }
    return (
      t.name.toLowerCase().includes(normalizedQuery) ||
      t.caption.toLowerCase().includes(normalizedQuery) ||
      t.description.toLowerCase().includes(normalizedQuery) ||
      t.tags.some((tag) => tag.toLowerCase().includes(normalizedQuery))
    );
  });
}

/**
 * Pure deterministic layout resolver for rendering live SVG thumbnails in the Library UI.
 * Memoized by (template.id, width, height) so rendering all 120 swatches is instantaneous.
 */
export function previewTemplateLayout(
  template: BentoTemplate,
  previewRect: RectPt = DEFAULT_PREVIEW_RECT
): TemplatePreviewData {
  const key = `${template.id}:${Math.round(previewRect.width)}x${Math.round(previewRect.height)}`;
  const cached = previewCache.get(key);
  if (cached) {
    return cached;
  }

  const res = createDocumentFromTemplate(previewRect, template);
  if (!res.ok) {
    return { leaves: [], cells: [], anchorRect: previewRect };
  }
  const data: TemplatePreviewData = {
    leaves: sortReadingOrder(
      resolveTreeLayout(res.value.tree, res.value.anchorRect, res.value.params.gutterPt)
    ),
    cells: resolveVisualCells(res.value),
    anchorRect: res.value.anchorRect,
  };
  if (previewCache.size > 600) {
    previewCache.clear();
  }
  previewCache.set(key, data);
  return data;
}
