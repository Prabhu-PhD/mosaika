import { useMemo, useState } from 'react';
import type { BentoTemplate, LayoutIntent, RectPt, SavedBentoBlueprint } from '@bento/contract';
import {
  buildCellRenderSpecs,
  getTemplatesByIntent,
  instantiateSavedBlueprint,
  LAYOUT_INTENTS,
  previewTemplateLayout,
} from '@bento/core';
import { Bookmark, ChevronRight, X } from 'lucide-react';

const DEFAULT_PREVIEW_RECT: RectPt = { left: 0, top: 0, width: 864, height: 390 };

function normalizePreviewRect(selectionBounds?: RectPt): RectPt {
  if (!selectionBounds || selectionBounds.width < 40 || selectionBounds.height < 40) {
    return DEFAULT_PREVIEW_RECT;
  }
  const rawAr = selectionBounds.width / selectionBounds.height;
  const clampedAr = Math.max(0.95, Math.min(2.4, rawAr));
  const height = 390;
  return {
    left: 0,
    top: 0,
    width: Math.round(height * clampedAr),
    height,
  };
}

function TemplateSwatch({
  template,
  previewRect,
  isBusy,
  onSelect,
}: {
  template: BentoTemplate;
  previewRect: RectPt;
  isBusy: boolean;
  onSelect: (template: BentoTemplate) => void;
}) {
  const { cells, anchorRect } = useMemo(
    () => previewTemplateLayout(template, previewRect),
    [template, previewRect]
  );

  const isZeroGutter = template.params.gutterPt === 0;

  const viewW = 94;
  const viewH = 56;
  const pad = 4;
  const innerW = viewW - pad * 2;
  const innerH = viewH - pad * 2;

  const scale = Math.min(innerW / anchorRect.width, innerH / anchorRect.height);
  const drawW = anchorRect.width * scale;
  const drawH = anchorRect.height * scale;
  const offsetX = pad + (innerW - drawW) / 2;
  const offsetY = pad + (innerH - drawH) / 2;

  const actualGutterPx = template.params.gutterPt * scale;
  const desiredGutterPx = isZeroGutter ? 0 : 2.6;
  const halfTrim = Math.max(0, (desiredGutterPx - actualGutterPx) / 2);
  const rx = isZeroGutter ? 0 : Math.min(2.2, Math.max(1, template.params.radiusPt * scale * 1.1));

  return (
    <button
      type="button"
      disabled={isBusy}
      title={`${template.name} · ${template.params.count} cards`}
      aria-label={`${template.name}, ${template.params.count} cards`}
      data-testid={`library-template-${template.id}`}
      onClick={() => onSelect(template)}
      className="group relative flex h-[56px] w-full items-center justify-center overflow-hidden rounded-[2px] border border-[var(--bento-border)] bg-[var(--bento-bg)] p-0 transition-all hover:z-10 hover:border-[var(--bento-fg)] hover:shadow-[0_0_0_1px_var(--bento-fg)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--bento-fg)] disabled:cursor-not-allowed disabled:opacity-45"
    >
      <svg viewBox={`0 0 ${viewW} ${viewH}`} className="h-full w-full" aria-hidden="true">
        {cells.map((cell) => {
          const { rect } = cell;
          const rawX = offsetX + (rect.left - anchorRect.left) * scale;
          const rawY = offsetY + (rect.top - anchorRect.top) * scale;
          const rawW = rect.width * scale;
          const rawH = rect.height * scale;

          if (cell.svgPath) {
            return (
              <path
                key={cell.slotId}
                d={cell.svgPath}
                transform={`translate(${rawX} ${rawY}) scale(${scale})`}
                fill="var(--bento-fg)"
                fillOpacity={0.13}
                stroke={isZeroGutter ? 'var(--bento-bg)' : 'var(--bento-border-strong)'}
                strokeWidth={0.65}
                vectorEffect="non-scaling-stroke"
              />
            );
          }

          const isFlushLeft = Math.abs(rect.left - anchorRect.left) < 0.5;
          const isFlushTop = Math.abs(rect.top - anchorRect.top) < 0.5;
          const isFlushRight =
            Math.abs(rect.left + rect.width - (anchorRect.left + anchorRect.width)) < 0.5;
          const isFlushBottom =
            Math.abs(rect.top + rect.height - (anchorRect.top + anchorRect.height)) < 0.5;

          const trimL = isFlushLeft ? 0 : Math.min(halfTrim, rawW * 0.2);
          const trimR = isFlushRight ? 0 : Math.min(halfTrim, rawW * 0.2);
          const trimT = isFlushTop ? 0 : Math.min(halfTrim, rawH * 0.2);
          const trimB = isFlushBottom ? 0 : Math.min(halfTrim, rawH * 0.2);

          const x = rawX + trimL;
          const y = rawY + trimT;
          const w = Math.max(2, rawW - trimL - trimR);
          const h = Math.max(2, rawH - trimT - trimB);

          return (
            <rect
              key={cell.slotId}
              x={x}
              y={y}
              width={w}
              height={h}
              rx={rx}
              fill="var(--bento-fg)"
              fillOpacity={0.13}
              stroke={isZeroGutter ? 'var(--bento-bg)' : 'var(--bento-border-strong)'}
              strokeWidth={isZeroGutter ? 0.9 : 0.65}
            />
          );
        })}
      </svg>
    </button>
  );
}

function SavedBlueprintSwatch({
  blueprint,
  previewRect,
  isBusy,
  onSelect,
  onDelete,
}: {
  blueprint: SavedBentoBlueprint;
  previewRect: RectPt;
  isBusy: boolean;
  onSelect: (bp: SavedBentoBlueprint) => void;
  onDelete?: (id: string) => void;
}) {
  const { cells, anchorRect } = useMemo(() => {
    const inst = instantiateSavedBlueprint(blueprint, previewRect);
    return {
      cells: buildCellRenderSpecs(inst, { supportsCustomGeometry: true }),
      anchorRect: inst.anchorRect,
    };
  }, [blueprint, previewRect]);

  const isZeroGutter = blueprint.docSnapshot.params.gutterPt === 0;
  const viewW = 94;
  const viewH = 56;
  const pad = 4;
  const innerW = viewW - pad * 2;
  const innerH = viewH - pad * 2;
  const scale = Math.min(innerW / anchorRect.width, innerH / anchorRect.height);
  const drawW = anchorRect.width * scale;
  const drawH = anchorRect.height * scale;
  const offsetX = pad + (innerW - drawW) / 2;
  const offsetY = pad + (innerH - drawH) / 2;
  const rx = isZeroGutter
    ? 0
    : Math.min(2.2, Math.max(1, blueprint.docSnapshot.params.radiusPt * scale * 1.1));

  return (
    <div className="group relative flex flex-col">
      <button
        type="button"
        disabled={isBusy}
        title={`${blueprint.name} · ${blueprint.cellCount} cards`}
        aria-label={`Apply saved layout ${blueprint.name}`}
        data-testid={`library-saved-${blueprint.id}`}
        onClick={() => onSelect(blueprint)}
        className="relative flex h-[56px] w-full items-center justify-center overflow-hidden rounded-[2px] border border-[var(--bento-border)] bg-[var(--bento-bg)] p-0 transition-all hover:z-10 hover:border-[var(--bento-fg)] hover:shadow-[0_0_0_1px_var(--bento-fg)] disabled:cursor-not-allowed disabled:opacity-45"
      >
        <svg viewBox={`0 0 ${viewW} ${viewH}`} className="h-full w-full" aria-hidden="true">
          {cells.map((cell) => {
            const rawX = offsetX + (cell.rect.left - anchorRect.left) * scale;
            const rawY = offsetY + (cell.rect.top - anchorRect.top) * scale;
            const rawW = cell.rect.width * scale;
            const rawH = cell.rect.height * scale;

            if (cell.svgPath) {
              return (
                <path
                  key={cell.slotId}
                  d={cell.svgPath}
                  transform={`translate(${rawX} ${rawY}) scale(${scale})`}
                  fill="var(--bento-fg)"
                  fillOpacity={0.15}
                  stroke={isZeroGutter ? 'var(--bento-bg)' : 'var(--bento-border-strong)'}
                  strokeWidth={0.65}
                  vectorEffect="non-scaling-stroke"
                />
              );
            }

            return (
              <rect
                key={cell.slotId}
                x={rawX}
                y={rawY}
                width={Math.max(2, rawW)}
                height={Math.max(2, rawH)}
                rx={rx}
                fill="var(--bento-fg)"
                fillOpacity={0.15}
                stroke={isZeroGutter ? 'var(--bento-bg)' : 'var(--bento-border-strong)'}
                strokeWidth={0.65}
              />
            );
          })}
        </svg>
      </button>
      <span className="mt-0.5 truncate text-center text-[9.5px] font-medium text-[var(--bento-fg-muted)]">
        {blueprint.name}
      </span>
      {onDelete && (
        <button
          type="button"
          title="Delete saved layout"
          aria-label={`Delete ${blueprint.name}`}
          data-testid={`delete-saved-${blueprint.id}`}
          onClick={(e) => {
            e.stopPropagation();
            onDelete(blueprint.id);
          }}
          className="absolute right-0.5 top-0.5 z-20 flex h-4 w-4 items-center justify-center rounded-[2px] bg-[var(--bento-bg)]/90 text-[var(--bento-fg-muted)] opacity-0 transition-opacity hover:bg-red-600 hover:text-white group-hover:opacity-100"
        >
          <X className="h-2.5 w-2.5" />
        </button>
      )}
    </div>
  );
}

export interface LibraryViewProps {
  mode: 'insert' | 'swap';
  activeIntent?: LayoutIntent;
  selectionBounds?: RectPt;
  savedBlueprints?: readonly SavedBentoBlueprint[];
  canSaveCurrent?: boolean;
  isBusy: boolean;
  onSelectTemplate: (template: BentoTemplate) => void;
  onSelectSavedBlueprint?: (blueprint: SavedBentoBlueprint) => void;
  onDeleteSavedBlueprint?: (id: string) => void;
  onSaveCurrentLayout?: (name: string) => void;
}

export function LibraryView({
  activeIntent,
  selectionBounds,
  savedBlueprints = [],
  canSaveCurrent = false,
  isBusy,
  onSelectTemplate,
  onSelectSavedBlueprint,
  onDeleteSavedBlueprint,
  onSaveCurrentLayout,
}: LibraryViewProps) {
  // Exclusive accordion: either '__saved__' or one of the 12 LayoutIntents
  const [openKey, setOpenKey] = useState<LayoutIntent | '__saved__' | null>(null);
  const [saveName, setSaveName] = useState('');

  const previewRect = useMemo(
    () => normalizePreviewRect(selectionBounds),
    [selectionBounds?.width, selectionBounds?.height]
  );

  const openTemplates = useMemo(
    () => (openKey && openKey !== '__saved__' ? getTemplatesByIntent(openKey) : []),
    [openKey]
  );

  const handleSaveSubmit = () => {
    if (!onSaveCurrentLayout) return;
    onSaveCurrentLayout(saveName);
    setSaveName('');
    setOpenKey('__saved__');
  };

  return (
    <div
      className="flex flex-col divide-y divide-[var(--bento-border)] border-b border-[var(--bento-border)]"
      data-testid="bento-library-view"
    >
      {/* Save Current Layout Strip (visible when editing an active Bento) */}
      {canSaveCurrent && onSaveCurrentLayout && (
        <div className="flex items-center gap-1.5 bg-[var(--bento-well)] px-3 py-2">
          <input
            type="text"
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSaveSubmit();
            }}
            placeholder="Save current layout name..."
            aria-label="Saved layout name"
            data-testid="input-save-blueprint-name"
            className="h-7 min-w-0 flex-1 rounded-[2px] border border-[var(--bento-border-strong)] bg-[var(--bento-bg)] px-2 text-[11px] text-[var(--bento-fg)] outline-none focus:border-[var(--bento-fg)]"
          />
          <button
            type="button"
            disabled={isBusy}
            onClick={handleSaveSubmit}
            data-testid="btn-save-blueprint"
            className="flex h-7 shrink-0 items-center gap-1 rounded-[2px] bg-[var(--bento-fg)] px-2.5 text-[11px] font-semibold text-[var(--bento-accent-fg)] hover:opacity-90 disabled:opacity-45"
          >
            <Bookmark className="h-3 w-3" />
            <span>Save</span>
          </button>
        </div>
      )}

      {/* Personal Saved Blueprints Group */}
      {savedBlueprints.length > 0 && onSelectSavedBlueprint && (
        <section aria-label="My Saved layouts">
          <button
            type="button"
            aria-expanded={openKey === '__saved__'}
            data-testid="library-accordion-saved"
            onClick={() => setOpenKey((prev) => (prev === '__saved__' ? null : '__saved__'))}
            className={`flex h-[34px] w-full items-center justify-between px-3 text-left transition-colors ${
              openKey === '__saved__'
                ? 'bg-[var(--bento-well)] text-[var(--bento-fg)]'
                : 'bg-[var(--bento-bg)] text-[var(--bento-fg)] hover:bg-[var(--bento-well)]'
            }`}
          >
            <span className="flex min-w-0 items-center gap-2">
              <ChevronRight
                className={`h-3.5 w-3.5 shrink-0 text-[var(--bento-fg-muted)] transition-transform ${
                  openKey === '__saved__' ? 'rotate-90 text-[var(--bento-fg)]' : ''
                }`}
              />
              <Bookmark className="h-3 w-3 shrink-0 text-[var(--bento-fg)]" />
              <span className="truncate text-[11.5px] font-semibold">My Saved</span>
            </span>
            <span className="font-mono text-[10px] tabular-nums text-[var(--bento-fg-muted)]">
              {savedBlueprints.length}
            </span>
          </button>

          {openKey === '__saved__' && (
            <div
              className="border-t border-[var(--bento-border)] bg-[var(--bento-well)] px-3 py-2.5"
              data-testid="library-panel-saved"
            >
              <div className="grid grid-cols-3 gap-1.5" data-testid="library-saved-grid">
                {savedBlueprints.map((bp) => (
                  <SavedBlueprintSwatch
                    key={bp.id}
                    blueprint={bp}
                    previewRect={previewRect}
                    isBusy={isBusy}
                    onSelect={onSelectSavedBlueprint}
                    onDelete={onDeleteSavedBlueprint}
                  />
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {LAYOUT_INTENTS.map((def) => {
        const isOpen = openKey === def.id;
        const isCurrent = activeIntent === def.id;
        return (
          <section key={def.id} aria-label={`${def.label} layouts`}>
            <button
              type="button"
              aria-expanded={isOpen}
              data-testid={`library-accordion-${def.id}`}
              onClick={() => setOpenKey((prev) => (prev === def.id ? null : def.id))}
              className={`flex h-[34px] w-full items-center justify-between px-3 text-left transition-colors ${
                isOpen
                  ? 'bg-[var(--bento-well)] text-[var(--bento-fg)]'
                  : 'bg-[var(--bento-bg)] text-[var(--bento-fg)] hover:bg-[var(--bento-well)]'
              }`}
            >
              <span className="flex min-w-0 items-center gap-2">
                <ChevronRight
                  className={`h-3.5 w-3.5 shrink-0 text-[var(--bento-fg-muted)] transition-transform ${
                    isOpen ? 'rotate-90 text-[var(--bento-fg)]' : ''
                  }`}
                />
                <span className="truncate text-[11.5px] font-semibold">{def.label}</span>
                {isCurrent && (
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--bento-fg)]"
                    title="Current intent"
                  />
                )}
              </span>
              <span className="truncate pl-2 text-[10px] text-[var(--bento-fg-muted)]">
                {def.shortCaption}
              </span>
            </button>

            {isOpen && (
              <div
                className="border-t border-[var(--bento-border)] bg-[var(--bento-well)] px-3 py-2.5"
                data-testid={`library-panel-${def.id}`}
              >
                <div
                  className="grid grid-cols-3 gap-1.5"
                  data-testid="library-template-grid"
                >
                  {openTemplates.map((template) => (
                    <TemplateSwatch
                      key={template.id}
                      template={template}
                      previewRect={previewRect}
                      isBusy={isBusy}
                      onSelect={onSelectTemplate}
                    />
                  ))}
                </div>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
