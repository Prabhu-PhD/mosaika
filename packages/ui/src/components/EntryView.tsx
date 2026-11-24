import { useState } from 'react';
import type {
  BentoTemplate,
  LayoutIntent,
  SavedBentoBlueprint,
  SelectionContext,
} from '@bento/contract';
import { computeAutoFitRect, getIntentDefinition } from '@bento/core';
import { Sparkles } from 'lucide-react';
import { IntentGrid } from './IntentPicker.js';
import { LibraryView } from './LibraryView.js';

export interface EntryViewProps {
  selection: SelectionContext | null;
  selectedIntent: LayoutIntent;
  supportsMosaikafy: boolean;
  savedBlueprints: readonly SavedBentoBlueprint[];
  isBusy: boolean;
  onSelectIntent: (intent: LayoutIntent) => void;
  onCreateInSelected: () => void;
  onMosaikafySelected: () => void;
  onAutoFitSlide: () => void;
  onInsertTemplate: (template: BentoTemplate) => void;
  onInsertSavedBlueprint: (blueprint: SavedBentoBlueprint) => void;
  onDeleteSavedBlueprint: (id: string) => void;
}

export function EntryView({
  selection,
  selectedIntent,
  supportsMosaikafy,
  savedBlueprints,
  isBusy,
  onSelectIntent,
  onCreateInSelected,
  onMosaikafySelected,
  onAutoFitSlide,
  onInsertTemplate,
  onInsertSavedBlueprint,
  onDeleteSavedBlueprint,
}: EntryViewProps) {
  const [activeTab, setActiveTab] = useState<'intents' | 'library'>('intents');

  const hasSingleShape =
    selection !== null &&
    selection.selectedShapeCount === 1 &&
    selection.selectedShapeBounds !== undefined;

  const canMosaikafy =
    supportsMosaikafy &&
    selection !== null &&
    selection.selectedShapeCount >= 2 &&
    (selection.selectedShapes?.length ?? 0) >= 2;

  const autoRect = computeAutoFitRect(
    selection?.slideBounds ?? { left: 0, top: 0, width: 960, height: 540 }
  );

  const dimsLabel =
    hasSingleShape && selection?.selectedShapeBounds
      ? `Selected · ${Math.round(selection.selectedShapeBounds.width)} × ${Math.round(selection.selectedShapeBounds.height)} pt`
      : canMosaikafy && selection
        ? `${selection.selectedShapeCount} shapes · Ready to Mosaika-fy`
        : selection && selection.selectedShapeCount > 1
          ? `${selection.selectedShapeCount} shapes · Auto-Fit`
          : `Auto-Fit · ${Math.round(autoRect.width)} × ${Math.round(autoRect.height)} pt`;

  const intentDef = getIntentDefinition(selectedIntent);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* Pinned Target Bounds + Intents / Library Switcher */}
      <div className="shrink-0">
        <div className="flex items-center justify-between border-b border-[var(--bento-border)] bg-[var(--bento-well)] px-3 py-1.5">
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-[var(--bento-fg-muted)]">
            Target
          </span>
          <span
            data-testid="selection-dims"
            className="font-mono text-[10.5px] font-medium tabular-nums text-[var(--bento-fg)]"
          >
            {dimsLabel}
          </span>
        </div>

        <div className="border-b border-[var(--bento-border)] bg-[var(--bento-bg)] px-3 py-2">
          <div
            className="bento-segmented grid-cols-2"
            role="tablist"
            aria-label="Creation mode"
            data-testid="entry-mode-tabs"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'intents'}
              data-testid="tab-entry-intents"
              onClick={() => setActiveTab('intents')}
              className={`bento-seg-btn text-[11.5px] ${activeTab === 'intents' ? 'is-active' : ''}`}
              data-active={activeTab === 'intents'}
            >
              Intents
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'library'}
              data-testid="tab-entry-library"
              onClick={() => setActiveTab('library')}
              className={`bento-seg-btn text-[11.5px] ${activeTab === 'library' ? 'is-active' : ''}`}
              data-active={activeTab === 'library'}
            >
              Library
            </button>
          </div>
        </div>
      </div>

      {activeTab === 'library' ? (
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
          <LibraryView
            mode="insert"
            selectionBounds={hasSingleShape ? selection?.selectedShapeBounds : undefined}
            savedBlueprints={savedBlueprints}
            isBusy={isBusy}
            onSelectTemplate={onInsertTemplate}
            onSelectSavedBlueprint={onInsertSavedBlueprint}
            onDeleteSavedBlueprint={onDeleteSavedBlueprint}
          />
        </div>
      ) : (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
            {/* Question-Driven Intent Gallery (InfoGen GalleryView rhythm) */}
            <div className="space-y-2 px-3 py-2.5">
              <div className="flex items-baseline justify-between">
                <span className="text-[11.5px] font-medium text-[var(--bento-fg-muted)]">
                  What do you want to show?
                </span>
              </div>

              <IntentGrid value={selectedIntent} variant="gallery" onChange={onSelectIntent} />

              <p className="pt-0.5 text-[11px] leading-snug text-[var(--bento-fg-muted)]">
                {intentDef.description}
              </p>
            </div>
          </div>

          {/* InfoGen Sticky Action Footer (1px solid --bento-fg anchor rule) */}
          <footer className="sticky bottom-0 z-10 flex shrink-0 flex-col gap-1.5 border-t border-[var(--bento-fg)] bg-[var(--bento-bg)] px-3 py-2.5">
            {canMosaikafy && selection ? (
              <button
                type="button"
                disabled={isBusy}
                onClick={onMosaikafySelected}
                data-testid="btn-mosaikafy-selected"
                className="flex h-[34px] w-full items-center justify-center gap-1.5 rounded-[2px] bg-[var(--bento-fg)] px-3 text-[12.5px] font-semibold text-[var(--bento-accent-fg)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span>Mosaika-fy {selection.selectedShapeCount} Selected Shapes</span>
              </button>
            ) : (
              <button
                type="button"
                disabled={isBusy}
                onClick={onCreateInSelected}
                data-testid="btn-create-bento"
                className="flex h-[34px] w-full items-center justify-center rounded-[2px] bg-[var(--bento-fg)] px-3 text-[12.5px] font-semibold text-[var(--bento-accent-fg)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Create {intentDef.label} Layout
              </button>
            )}

            <button
              type="button"
              disabled={isBusy}
              onClick={onAutoFitSlide}
              data-testid="btn-autofit-slide"
              className="flex h-[30px] w-full items-center justify-center rounded-[2px] border border-[var(--bento-border-strong)] bg-[var(--bento-bg)] px-3 text-[12px] font-medium text-[var(--bento-fg)] transition-colors hover:bg-[var(--bento-well)] disabled:opacity-40"
            >
              Auto-Fit Slide Content Area
            </button>
          </footer>
        </>
      )}
    </div>
  );
}
