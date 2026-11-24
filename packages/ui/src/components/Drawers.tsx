import { useState } from 'react';
import type {
  BentoDocumentState,
  EntranceAnimationPreset,
  HierarchyMode,
  HostCapabilities,
  MultiSlideMode,
  StylePresetId,
} from '@bento/contract';
import { ENTRANCE_ANIMATION_PRESETS, STYLE_PRESETS } from '@bento/core';
import { ArrowUpDown, Bookmark, Pipette, Play, RotateCcw, Unlink } from 'lucide-react';

export interface DrawersProps {
  state: BentoDocumentState;
  capabilities: HostCapabilities;
  hasSingleSelectedCard: boolean;
  activeMotionPreset: EntranceAnimationPreset;
  onSelectPreset: (presetId: StylePresetId) => void;
  onSelectHierarchy: (mode: HierarchyMode) => void;
  onSyncStyleFromSelected: () => void;
  onApplyEntranceAnimation: (preset: EntranceAnimationPreset) => void;
  onSaveToLibrary: () => void;
  onGenerateMultiSlides: (
    mode: MultiSlideMode,
    slideCount: number,
    morphNamingEnabled: boolean
  ) => void;
  onReorderReadingOrder: () => void;
  onDetachBento: () => void;
}

type DrawerKey = 'styles' | 'motion' | 'multislide' | 'cleanup';

const HIERARCHY_OPTIONS: ReadonlyArray<{ id: HierarchyMode; label: string }> = [
  { id: 'uniform', label: 'Uniform' },
  { id: 'hero-accent', label: 'Hero Accent' },
  { id: 'tonal-ramp', label: 'Tonal Ramp' },
];

export function Drawers({
  state,
  capabilities,
  hasSingleSelectedCard,
  activeMotionPreset,
  onSelectPreset,
  onSelectHierarchy,
  onSyncStyleFromSelected,
  onApplyEntranceAnimation,
  onSaveToLibrary,
  onGenerateMultiSlides,
  onReorderReadingOrder,
  onDetachBento,
}: DrawersProps) {
  // InfoGen EditView rule: exclusive single-open accordion (all collapsed at start; opening one closes others)
  const [openRow, setOpenRow] = useState<DrawerKey | null>(null);
  const [multiMode, setMultiMode] = useState<MultiSlideMode>('exploration');
  const [slideCount, setSlideCount] = useState(4);
  const [morphNaming, setMorphNaming] = useState(true);

  const toggle = (key: DrawerKey) => setOpenRow((prev) => (prev === key ? null : key));

  const activePresetLabel =
    STYLE_PRESETS.find((p) => p.id === state.params.stylePreset)?.label ?? 'Soft Modern';
  const activeHierarchyLabel =
    HIERARCHY_OPTIONS.find((h) => h.id === state.params.hierarchyMode)?.label ?? 'Hero Accent';
  const activeMotionLabel =
    activeMotionPreset === 'none'
      ? 'None'
      : (ENTRANCE_ANIMATION_PRESETS.find((p) => p.id === activeMotionPreset)?.label ?? 'Fade Cascade');

  const stylesOpen = openRow === 'styles';
  const motionOpen = openRow === 'motion';
  const multiOpen = openRow === 'multislide';
  const cleanupOpen = openRow === 'cleanup';

  return (
    <div className="divide-y divide-[var(--bento-border)] bg-[var(--bento-bg)]">
      {/* Row 1: Styles & Hierarchy */}
      <section aria-label="Styles and Hierarchy">
        <button
          type="button"
          onClick={() => toggle('styles')}
          data-testid="drawer-toggle-styles"
          aria-expanded={stylesOpen}
          className="flex h-[36px] w-full items-center justify-between px-3 text-left transition-colors hover:bg-[var(--bento-well)]"
        >
          <span className="shrink-0 text-[10.5px] font-semibold uppercase tracking-[0.05em] text-[var(--bento-fg-muted)]">
            Style
          </span>
          <span className="ml-3 flex min-w-0 items-center gap-1.5 text-[11.5px] text-[var(--bento-fg-muted)]">
            <span className="truncate">
              {activePresetLabel} · {activeHierarchyLabel}
            </span>
            <span aria-hidden="true" className="shrink-0 text-[12px]">
              {stylesOpen ? '▴' : '›'}
            </span>
          </span>
        </button>

        {stylesOpen && (
          <div className="space-y-2.5 border-t border-[var(--bento-border)] px-3 py-2.5">
            <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Style presets">
              {STYLE_PRESETS.map((preset) => {
                const active = state.params.stylePreset === preset.id;
                const showShadowPreview =
                  preset.id === 'elevated-cards' && capabilities.supportsShadows;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    data-testid={`preset-${preset.id}`}
                    onClick={() => onSelectPreset(preset.id)}
                    className={`flex flex-col gap-1 border bg-[var(--bento-bg)] p-1.5 text-left transition-colors ${
                      active
                        ? 'border-[var(--bento-fg)] shadow-[inset_0_0_0_1px_var(--bento-fg)]'
                        : 'border-[var(--bento-border)] hover:border-[var(--bento-border-strong)]'
                    }`}
                  >
                    <div
                      className={`grid h-7 w-full grid-cols-3 gap-1 p-1 ${
                        preset.swatchDark ? 'bg-zinc-950' : 'bg-[var(--bento-well)]'
                      }`}
                    >
                      <div
                        className="col-span-2 h-full"
                        style={{
                          backgroundColor:
                            state.params.hierarchyMode === 'hero-accent' &&
                            preset.id !== 'wireframe'
                              ? preset.swatchAccentHex
                              : preset.swatchFillHex,
                          border:
                            preset.id === 'tonal-flat'
                              ? 'none'
                              : `1px ${preset.swatchDashed ? 'dashed' : 'solid'} ${preset.swatchBorderHex}`,
                          borderRadius: Math.min(
                            4,
                            Math.max(0, Math.round(preset.defaultRadiusPt / 4))
                          ),
                          boxShadow: showShadowPreview ? '0 2px 4px rgba(15,23,42,0.14)' : 'none',
                        }}
                      />
                      <div
                        className="col-span-1 h-full"
                        style={{
                          backgroundColor: preset.swatchFillHex,
                          border:
                            preset.id === 'tonal-flat'
                              ? 'none'
                              : `1px ${preset.swatchDashed ? 'dashed' : 'solid'} ${preset.swatchBorderHex}`,
                          borderRadius: Math.min(
                            4,
                            Math.max(0, Math.round(preset.defaultRadiusPt / 4))
                          ),
                          boxShadow: showShadowPreview ? '0 2px 4px rgba(15,23,42,0.14)' : 'none',
                        }}
                      />
                    </div>
                    <span className="truncate text-[10.5px] font-semibold text-[var(--bento-fg)]">
                      {preset.label}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="space-y-1">
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-[var(--bento-fg-muted)]">
                Hierarchy
              </span>
              <div className="bento-segmented grid-cols-3">
                {HIERARCHY_OPTIONS.map((opt) => {
                  const active = state.params.hierarchyMode === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      data-testid={`hierarchy-${opt.id}`}
                      onClick={() => onSelectHierarchy(opt.id)}
                      className={`bento-seg-btn text-[10.5px] ${active ? 'is-active' : ''}`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              type="button"
              onClick={onSyncStyleFromSelected}
              data-testid="btn-sync-style"
              title={
                hasSingleSelectedCard
                  ? 'Propagate fill, border, and margins from selected card to standard cards'
                  : 'Select a single bento card first to copy its style'
              }
              className="flex h-[30px] w-full items-center justify-center gap-1.5 rounded-[2px] border border-[var(--bento-border-strong)] bg-[var(--bento-bg)] px-2 text-[11.5px] font-medium text-[var(--bento-fg)] transition-colors hover:bg-[var(--bento-well)]"
            >
              <Pipette className="h-3 w-3 text-[var(--bento-fg-muted)]" />
              <span>Sync Style from Selected Card</span>
            </button>
          </div>
        )}
      </section>

      {/* Row 2: Staggered Entrance Motion (strictly capability-gated per Rule 3) */}
      {capabilities.supportsEntranceAnimations && (
        <section aria-label="Staggered Entrance Motion">
          <button
            type="button"
            onClick={() => toggle('motion')}
            data-testid="drawer-toggle-motion"
            aria-expanded={motionOpen}
            className="flex h-[36px] w-full items-center justify-between px-3 text-left transition-colors hover:bg-[var(--bento-well)]"
          >
            <span className="shrink-0 text-[10.5px] font-semibold uppercase tracking-[0.05em] text-[var(--bento-fg-muted)]">
              Motion
            </span>
            <span className="ml-3 flex min-w-0 items-center gap-1.5 text-[11.5px] text-[var(--bento-fg-muted)]">
              <span className="truncate">{activeMotionLabel}</span>
              <span aria-hidden="true" className="shrink-0 text-[12px]">
                {motionOpen ? '▴' : '›'}
              </span>
            </span>
          </button>

          {motionOpen && (
            <div className="space-y-2 border-t border-[var(--bento-border)] px-3 py-2.5">
              <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Entrance animations">
                {ENTRANCE_ANIMATION_PRESETS.map((preset) => {
                  const active = activeMotionPreset === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      data-testid={`motion-${preset.id}`}
                      onClick={() => onApplyEntranceAnimation(preset.id)}
                      className={`flex flex-col gap-0.5 rounded-[2px] border px-2 py-1.5 text-left transition-colors ${
                        active
                          ? 'border-[var(--bento-fg)] bg-[var(--bento-well)] shadow-[inset_0_0_0_1px_var(--bento-fg)]'
                          : 'border-[var(--bento-border)] bg-[var(--bento-bg)] hover:border-[var(--bento-border-strong)]'
                      }`}
                    >
                      <span className="text-[11px] font-semibold text-[var(--bento-fg)]">
                        {preset.label}
                      </span>
                      <span className="font-mono text-[9.5px] text-[var(--bento-fg-muted)]">
                        {preset.durationSec}s · +{Math.round(preset.staggerSec * 1000)}ms
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  disabled={activeMotionPreset === 'none'}
                  onClick={() => onApplyEntranceAnimation(activeMotionPreset)}
                  data-testid="btn-motion-replay"
                  className="flex h-[28px] items-center justify-center gap-1 rounded-[2px] border border-[var(--bento-border-strong)] bg-[var(--bento-bg)] text-[11px] font-medium text-[var(--bento-fg)] hover:bg-[var(--bento-well)] disabled:opacity-40"
                >
                  <Play className="h-3 w-3" />
                  <span>Replay</span>
                </button>
                <button
                  type="button"
                  onClick={() => onApplyEntranceAnimation('none')}
                  data-testid="btn-motion-clear"
                  className="flex h-[28px] items-center justify-center gap-1 rounded-[2px] border border-[var(--bento-border-strong)] bg-[var(--bento-bg)] text-[11px] font-medium text-[var(--bento-fg)] hover:bg-[var(--bento-well)]"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span>Clear</span>
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Row 3: Multi-Slide Generator */}
      <section aria-label="Multi-Slide Generator">
        <button
          type="button"
          onClick={() => toggle('multislide')}
          data-testid="drawer-toggle-multislide"
          aria-expanded={multiOpen}
          className="flex h-[36px] w-full items-center justify-between px-3 text-left transition-colors hover:bg-[var(--bento-well)]"
        >
          <span className="shrink-0 text-[10.5px] font-semibold uppercase tracking-[0.05em] text-[var(--bento-fg-muted)]">
            Multi-Slide
          </span>
          <span className="ml-3 flex min-w-0 items-center gap-1.5 text-[11.5px] text-[var(--bento-fg-muted)]">
            <span className="truncate font-mono tabular-nums">
              {slideCount} slides · {multiMode === 'exploration' ? 'Explore' : 'Deck arc'}
            </span>
            <span aria-hidden="true" className="shrink-0 text-[12px]">
              {multiOpen ? '▴' : '›'}
            </span>
          </span>
        </button>

        {multiOpen && (
          <div className="space-y-2.5 border-t border-[var(--bento-border)] px-3 py-2.5">
            <div className="bento-segmented grid-cols-2">
              <button
                type="button"
                data-testid="multislide-mode-exploration"
                onClick={() => setMultiMode('exploration')}
                className={`bento-seg-btn text-[11px] ${multiMode === 'exploration' ? 'is-active' : ''}`}
              >
                Exploration
              </button>
              <button
                type="button"
                data-testid="multislide-mode-deck-builder"
                onClick={() => setMultiMode('deck-builder')}
                className={`bento-seg-btn text-[11px] ${multiMode === 'deck-builder' ? 'is-active' : ''}`}
              >
                Deck Builder
              </button>
            </div>

            {multiMode === 'deck-builder' && (
              <p className="border-l-2 border-[var(--bento-fg)] bg-[var(--bento-well)] px-2 py-1 text-[10.5px] leading-snug text-[var(--bento-fg-muted)]">
                Story arc: <strong className="font-semibold text-[var(--bento-fg)]">Executive → KPI → Showcase → Editorial → Compare</strong>
              </p>
            )}

            {/* InfoGen tactile stepper for Slide Count */}
            <div className="flex items-center justify-between text-[12px]">
              <label htmlFor="bento-slider-slides" className="font-medium text-[var(--bento-fg)]">
                Slides
              </label>
              <div className="flex items-center">
                <button
                  type="button"
                  aria-label="Fewer slides"
                  disabled={slideCount <= 2}
                  onClick={() => setSlideCount((c) => Math.max(2, c - 1))}
                  className="flex h-7 w-7 items-center justify-center rounded-l-[2px] border border-[var(--bento-border-strong)] bg-[var(--bento-bg)] text-[14px] text-[var(--bento-fg)] hover:bg-[var(--bento-well)] disabled:opacity-35"
                >
                  −
                </button>
                <span
                  data-testid="readout-slide-count"
                  className="flex h-7 min-w-[34px] items-center justify-center border-y border-[var(--bento-border-strong)] bg-[var(--bento-bg)] font-mono text-[12px] font-semibold tabular-nums text-[var(--bento-fg)]"
                >
                  {slideCount}
                </span>
                <button
                  type="button"
                  aria-label="More slides"
                  disabled={slideCount >= 12}
                  onClick={() => setSlideCount((c) => Math.min(12, c + 1))}
                  className="flex h-7 w-7 items-center justify-center rounded-r-[2px] border border-[var(--bento-border-strong)] bg-[var(--bento-bg)] text-[14px] text-[var(--bento-fg)] hover:bg-[var(--bento-well)] disabled:opacity-35"
                >
                  +
                </button>
              </div>
              <input
                id="bento-slider-slides"
                data-testid="slider-slide-count"
                type="range"
                min={2}
                max={12}
                step={1}
                value={slideCount}
                onChange={(e) => setSlideCount(Number(e.target.value))}
                className="sr-only"
              />
            </div>

            {/* Auto-Morph Naming (!!) stays enabled on all hosts; supportsAutoMorph gates applyMorphTransition & hint */}
            <div className="space-y-1 border border-[var(--bento-border)] bg-[var(--bento-well)] p-2">
              <label className="flex cursor-pointer items-center justify-between gap-2 text-[11.5px] font-medium text-[var(--bento-fg)]">
                <span>Auto-Morph Naming (!!)</span>
                <input
                  type="checkbox"
                  checked={morphNaming}
                  onChange={(e) => setMorphNaming(e.target.checked)}
                  data-testid="toggle-auto-morph"
                  className="h-3.5 w-3.5 accent-[var(--bento-fg)]"
                />
              </label>
              {!capabilities.supportsAutoMorph && (
                <p
                  data-testid="morph-manual-hint"
                  className="text-[10.5px] leading-snug text-[var(--bento-fg-muted)]"
                >
                  Names shapes with !! — apply Morph transition manually
                </p>
              )}
              <p className="text-[10.5px] leading-snug text-[var(--bento-fg-muted)]">
                {capabilities.supportsSlideDuplication
                  ? 'Duplicates active slide chrome & clears existing bento cards.'
                  : 'Inserts new slides matching the active slide master & layout.'}
              </p>
            </div>

            <button
              type="button"
              onClick={() => onGenerateMultiSlides(multiMode, slideCount, morphNaming)}
              data-testid="btn-generate-slides"
              className="flex h-[32px] w-full items-center justify-center rounded-[2px] bg-[var(--bento-fg)] px-3 text-[12px] font-semibold text-[var(--bento-accent-fg)] transition-opacity hover:opacity-90"
            >
              Generate {slideCount} Slides
            </button>
          </div>
        )}
      </section>

      {/* Row 3: Deck Cleanup */}
      <section aria-label="Deck Cleanup">
        <button
          type="button"
          onClick={() => toggle('cleanup')}
          data-testid="drawer-toggle-cleanup"
          aria-expanded={cleanupOpen}
          className="flex h-[36px] w-full items-center justify-between px-3 text-left transition-colors hover:bg-[var(--bento-well)]"
        >
          <span className="shrink-0 text-[10.5px] font-semibold uppercase tracking-[0.05em] text-[var(--bento-fg-muted)]">
            Cleanup
          </span>
          <span className="ml-3 flex min-w-0 items-center gap-1.5 text-[11.5px] text-[var(--bento-fg-muted)]">
            <span className="truncate">Order · Detach</span>
            <span aria-hidden="true" className="shrink-0 text-[12px]">
              {cleanupOpen ? '▴' : '›'}
            </span>
          </span>
        </button>

        {cleanupOpen && (
          <div className="space-y-1.5 border-t border-[var(--bento-border)] px-3 py-2.5">
            <button
              type="button"
              onClick={onSaveToLibrary}
              data-testid="btn-save-layout-cleanup"
              className="flex h-[30px] w-full items-center justify-center gap-1.5 rounded-[2px] border border-[var(--bento-border-strong)] bg-[var(--bento-bg)] px-2 text-[11.5px] font-medium text-[var(--bento-fg)] hover:bg-[var(--bento-well)]"
            >
              <Bookmark className="h-3 w-3 text-[var(--bento-fg-muted)]" />
              <span>Save Layout to My Library</span>
            </button>

            <button
              type="button"
              onClick={onReorderReadingOrder}
              data-testid="btn-reorder-reading"
              className="flex h-[30px] w-full items-center justify-center gap-1.5 rounded-[2px] border border-[var(--bento-border-strong)] bg-[var(--bento-bg)] px-2 text-[11.5px] font-medium text-[var(--bento-fg)] hover:bg-[var(--bento-well)]"
            >
              <ArrowUpDown className="h-3 w-3 text-[var(--bento-fg-muted)]" />
              <span>Re-Sort Reading Order</span>
            </button>

            <button
              type="button"
              onClick={onDetachBento}
              data-testid="btn-detach-bento"
              style={{
                borderColor: 'var(--bento-danger)',
                color: 'var(--bento-danger)',
              }}
              className="flex h-[30px] w-full items-center justify-center gap-1.5 rounded-[2px] border bg-[var(--bento-bg)] px-2 text-[11.5px] font-medium transition-colors hover:bg-[var(--bento-well)]"
            >
              <Unlink className="h-3 w-3" />
              <span>Finalize / Detach Grid</span>
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
