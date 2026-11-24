import { Sparkles } from 'lucide-react';
import { SLIDE_BOUNDS, type MockSlide } from '../mockHost.js';

export interface SlideThumbnailsProps {
  slides: readonly MockSlide[];
  activeSlideIndex: number;
  isDarkTheme: boolean;
  onSelectSlide: (index: number) => void;
}

export function SlideThumbnails({
  slides,
  activeSlideIndex,
  isDarkTheme,
  onSelectSlide,
}: SlideThumbnailsProps) {
  return (
    <div
      data-testid="slide-thumbnails-strip"
      className="flex h-[106px] shrink-0 items-center gap-3 overflow-x-auto border-t border-slate-200 bg-white px-4 py-2 dark:border-zinc-800 dark:bg-zinc-950"
    >
      {slides.map((slide, index) => {
        const active = index === activeSlideIndex;
        const onSlideShapes = slide.shapes.filter((s) => s.kind !== 'stashed');
        const hasMorphNames = onSlideShapes.some((s) => s.shapeName.startsWith('!!'));

        return (
          <button
            key={slide.id}
            type="button"
            data-testid={`slide-thumb-${index}`}
            onClick={() => onSelectSlide(index)}
            className={`group flex shrink-0 flex-col gap-1 rounded-lg border p-1.5 text-left transition-all ${
              active
                ? 'border-blue-600 bg-blue-50/70 ring-1 ring-blue-600 dark:bg-blue-950/40'
                : 'border-slate-200 bg-slate-50 hover:border-slate-300 dark:border-zinc-800 dark:bg-zinc-900'
            }`}
          >
            <div className="relative h-[58px] w-[104px] overflow-hidden rounded border border-slate-200 bg-white dark:border-zinc-700 dark:bg-zinc-950">
              <svg
                viewBox={`0 0 ${SLIDE_BOUNDS.width} ${SLIDE_BOUNDS.height}`}
                className="h-full w-full"
              >
                <rect
                  x={0}
                  y={0}
                  width={SLIDE_BOUNDS.width}
                  height={SLIDE_BOUNDS.height}
                  fill={isDarkTheme ? '#09090b' : '#ffffff'}
                />
                {onSlideShapes.map((sh) => {
                  if (sh.svgPath) {
                    return (
                      <path
                        key={sh.id}
                        d={sh.svgPath}
                        transform={`translate(${sh.rect.left} ${sh.rect.top})`}
                        fill={sh.style.fillHex ?? 'transparent'}
                        stroke={sh.style.borderColorHex ?? '#94a3b8'}
                        strokeWidth={4}
                      />
                    );
                  }
                  const rx = sh.cornerAdjustment * Math.min(sh.rect.width, sh.rect.height);
                  return (
                    <rect
                      key={sh.id}
                      x={sh.rect.left}
                      y={sh.rect.top}
                      width={sh.rect.width}
                      height={sh.rect.height}
                      rx={rx}
                      ry={rx}
                      fill={sh.style.fillHex ?? 'transparent'}
                      stroke={sh.style.borderColorHex ?? '#94a3b8'}
                      strokeWidth={4}
                    />
                  );
                })}
              </svg>
              {(slide.hasMorphTransition || hasMorphNames) && (
                <span
                  title={
                    slide.hasMorphTransition
                      ? 'Auto-Morph Transition + !! Naming'
                      : '!! Morph Shape Naming'
                  }
                  className="absolute bottom-1 right-1 flex items-center gap-0.5 rounded bg-slate-900/80 px-1 py-0.5 text-[8px] font-semibold text-white"
                >
                  <Sparkles className="h-2 w-2" />
                  <span>{slide.hasMorphTransition ? 'Morph' : '!!'}</span>
                </span>
              )}
            </div>
            <div className="flex items-center justify-between px-0.5 text-[10px]">
              <span className="font-mono font-semibold tabular-nums text-slate-700 dark:text-zinc-200">
                Slide {index + 1}
              </span>
              <span className="font-mono text-[9px] tabular-nums text-slate-500 dark:text-zinc-400">
                {onSlideShapes.length}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
