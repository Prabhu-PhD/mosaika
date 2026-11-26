import { Copy, Plus, Trash2 } from 'lucide-react';
import type { StudioSnapshot, WebStudioHost } from '../studioHost.js';

export interface SlideFilmstripProps {
  host: WebStudioHost;
  snapshot: StudioSnapshot;
  isDarkTheme: boolean;
  onToast: (message: string) => void;
}

/**
 * Wave 4 (#12): Opt-in Multi-Slide Carousel Filmstrip.
 * Stays completely hidden for single-slide designs (zero visual clutter) and
 * appears gently above the FloatingDock once the user clicks "+ Slide".
 */
export function SlideFilmstrip({
  host,
  snapshot,
  isDarkTheme,
  onToast,
}: SlideFilmstripProps) {
  if (snapshot.slides.length <= 1) return null;

  const border = isDarkTheme ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.10)';
  const fg = isDarkTheme ? '#F4F4F5' : '#18181B';
  const muted = isDarkTheme ? '#9CA3AF' : '#64748B';

  return (
    <div
      data-testid="slide-filmstrip"
      className="absolute bottom-[68px] left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 px-2.5 py-1.5 rounded-2xl shadow-md max-w-[92%] overflow-x-auto"
      style={{
        backgroundColor: isDarkTheme ? 'rgba(20, 22, 27, 0.88)' : 'rgba(255, 255, 255, 0.90)',
        backdropFilter: 'blur(16px)',
        border: `1px solid ${border}`,
        color: fg,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {snapshot.slides.map((slide, idx) => {
        const active = idx === snapshot.activeSlideIndex;
        return (
          <div
            key={slide.id}
            data-testid={`slide-pill-${idx}`}
            onClick={() => host.selectSlide(idx)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                host.selectSlide(idx);
              }
            }}
            className="group flex items-center gap-2 pl-2.5 pr-1.5 py-1 rounded-xl text-[11.5px] cursor-pointer transition-all shrink-0"
            style={{
              backgroundColor: active
                ? isDarkTheme
                  ? 'rgba(255,255,255,0.14)'
                  : '#18181B'
                : isDarkTheme
                  ? 'rgba(255,255,255,0.04)'
                  : 'rgba(15,23,42,0.04)',
              color: active ? '#FFFFFF' : fg,
            }}
          >
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: slide.accentHex }}
            />
            <span className="font-mono text-[10.5px] opacity-65">{idx + 1}</span>
            <span className="font-medium max-w-[100px] truncate">{slide.title}</span>

            <span className="inline-flex items-center gap-0.5 ml-0.5 opacity-70 group-hover:opacity-100">
              <button
                type="button"
                title="Duplicate slide"
                data-testid={`btn-duplicate-slide-${idx}`}
                onClick={(e) => {
                  e.stopPropagation();
                  host.duplicateSlide(idx);
                  onToast(`Duplicated slide ${idx + 1}.`);
                }}
                className="w-5 h-5 rounded-md inline-flex items-center justify-center hover:bg-black/15 cursor-pointer"
              >
                <Copy className="w-3 h-3" />
              </button>
              {snapshot.slides.length > 1 && (
                <button
                  type="button"
                  title="Delete slide"
                  data-testid={`btn-delete-slide-${idx}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    host.deleteSlide(idx);
                    onToast(`Removed slide ${idx + 1}.`);
                  }}
                  className="w-5 h-5 rounded-md inline-flex items-center justify-center hover:bg-red-500/20 cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </span>
          </div>
        );
      })}

      <button
        type="button"
        data-testid="filmstrip-add-slide"
        onClick={() => {
          host.addSlide(false);
          onToast(`Added slide ${snapshot.slides.length + 1}.`);
        }}
        title="Add another slide to carousel"
        className="h-7 px-2.5 rounded-xl text-[11.5px] font-medium inline-flex items-center gap-1 cursor-pointer shrink-0 hover:opacity-80"
        style={{
          color: muted,
          border: `1px dashed ${border}`,
        }}
      >
        <Plus className="w-3.5 h-3.5" />
        <span>Add</span>
      </button>
    </div>
  );
}
