import { useMemo, useState } from 'react';
import type { BentoTemplate, LayoutIntent, RectPt } from '@bento/contract';
import { getTemplatesByIntent, LAYOUT_INTENTS, previewTemplateLayout } from '@bento/core';
import { ChevronRight } from 'lucide-react';

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

export interface LibraryViewProps {
  mode: 'insert' | 'swap';
  activeIntent?: LayoutIntent;
  selectionBounds?: RectPt;
  isBusy: boolean;
  onSelectTemplate: (template: BentoTemplate) => void;
}

export function LibraryView({
  activeIntent,
  selectionBounds,
  isBusy,
  onSelectTemplate,
}: LibraryViewProps) {
  // All 10 intent rows start collapsed by default so users aren't overwhelmed
  const [openIntent, setOpenIntent] = useState<LayoutIntent | null>(null);

  const previewRect = useMemo(
    () => normalizePreviewRect(selectionBounds),
    [selectionBounds?.width, selectionBounds?.height]
  );

  const openTemplates = useMemo(
    () => (openIntent ? getTemplatesByIntent(openIntent) : []),
    [openIntent]
  );

  return (
    <div
      className="flex flex-col divide-y divide-[var(--bento-border)] border-b border-[var(--bento-border)]"
      data-testid="bento-library-view"
    >
      {LAYOUT_INTENTS.map((def) => {
        const isOpen = openIntent === def.id;
        const isCurrent = activeIntent === def.id;
        return (
          <section key={def.id} aria-label={`${def.label} layouts`}>
            <button
              type="button"
              aria-expanded={isOpen}
              data-testid={`library-accordion-${def.id}`}
              onClick={() => setOpenIntent((prev) => (prev === def.id ? null : def.id))}
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
