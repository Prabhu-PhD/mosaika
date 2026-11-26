import { formatSeedCode } from '@bento/core';
import {
  ArrowLeft,
  ArrowRight,
  FlipHorizontal2,
  FlipVertical2,
  Grid3X3,
  Layers,
  Monitor,
  Shuffle,
  Smartphone,
} from 'lucide-react';
import type { StudioSnapshot, WebStudioHost } from '../studioHost.js';

export interface FloatingDockProps {
  host: WebStudioHost;
  snapshot: StudioSnapshot;
  isDarkTheme: boolean;
  showGridOverlay: boolean;
  previewMode: 'desktop' | 'mobile';
  onToggleGrid: () => void;
  onSetPreviewMode: (mode: 'desktop' | 'mobile') => void;
  onAddSlide: () => void;
}

export function FloatingDock({
  host,
  snapshot,
  isDarkTheme,
  showGridOverlay,
  previewMode,
  onToggleGrid,
  onSetPreviewMode,
  onAddSlide,
}: FloatingDockProps) {
  const doc = snapshot.activeDoc;
  if (!doc) return null;

  const seedCode = formatSeedCode(doc.params.count, doc.params.seed);

  return (
    <div
      data-testid="studio-floating-dock"
      className="absolute bottom-5 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 px-2 py-1.5 rounded-full shadow-lg"
      style={{
        backgroundColor: isDarkTheme ? 'rgba(20, 22, 27, 0.86)' : 'rgba(255, 255, 255, 0.88)',
        backdropFilter: 'blur(16px)',
        border: `1px solid ${isDarkTheme ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.10)'}`,
        color: isDarkTheme ? '#F4F4F5' : '#18181B',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        data-testid="dock-btn-shuffle"
        onClick={() => host.randomizeSeed()}
        title="Shuffle layout variation (Space)"
        className="h-8 px-3.5 rounded-full text-[12px] font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-opacity hover:opacity-90"
        style={{
          backgroundColor: isDarkTheme ? '#F4F4F5' : '#18181B',
          color: isDarkTheme ? '#111216' : '#FFFFFF',
        }}
      >
        <Shuffle className="w-3.5 h-3.5" />
        <span>Shuffle</span>
      </button>

      <div className="flex items-center">
        <button
          type="button"
          disabled={!snapshot.canSeedBack}
          onClick={() => host.prevSeed()}
          title="Previous variation"
          className="w-7 h-7 rounded-full inline-flex items-center justify-center cursor-pointer disabled:opacity-30 hover:bg-black/5 dark:hover:bg-white/10"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          disabled={!snapshot.canSeedForward}
          onClick={() => host.nextSeed()}
          title="Next variation"
          className="w-7 h-7 rounded-full inline-flex items-center justify-center cursor-pointer disabled:opacity-30 hover:bg-black/5 dark:hover:bg-white/10"
        >
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      <span
        className="h-4 w-px mx-0.5"
        style={{ backgroundColor: isDarkTheme ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.12)' }}
      />

      <button
        type="button"
        onClick={() => host.mirrorLayout('horizontal')}
        title="Flip horizontally"
        className="w-8 h-8 rounded-full inline-flex items-center justify-center cursor-pointer hover:bg-black/5 dark:hover:bg-white/10"
      >
        <FlipHorizontal2 className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        onClick={() => host.mirrorLayout('vertical')}
        title="Flip vertically"
        className="w-8 h-8 rounded-full inline-flex items-center justify-center cursor-pointer hover:bg-black/5 dark:hover:bg-white/10"
      >
        <FlipVertical2 className="w-3.5 h-3.5" />
      </button>

      <button
        type="button"
        data-testid="btn-toggle-grid"
        onClick={onToggleGrid}
        title="Toggle Swiss Grid Overlay (G)"
        className="h-8 px-2.5 rounded-full text-[11.5px] font-medium inline-flex items-center gap-1 cursor-pointer transition-colors"
        style={{
          backgroundColor: showGridOverlay
            ? isDarkTheme
              ? 'rgba(255,255,255,0.15)'
              : 'rgba(15,23,42,0.08)'
            : 'transparent',
        }}
      >
        <Grid3X3 className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Grid</span>
      </button>

      <span
        className="h-4 w-px mx-0.5"
        style={{ backgroundColor: isDarkTheme ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.12)' }}
      />

      {/* Wave 4 (#13): Quiet Desktop | Mobile Responsive Preview Switch */}
      <div
        className="inline-flex items-center rounded-full p-0.5"
        style={{
          backgroundColor: isDarkTheme ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.05)',
        }}
      >
        <button
          type="button"
          data-testid="dock-preview-desktop"
          onClick={() => onSetPreviewMode('desktop')}
          title="Desktop Artboard"
          className="w-7 h-7 rounded-full inline-flex items-center justify-center cursor-pointer transition-colors"
          style={{
            backgroundColor:
              previewMode === 'desktop'
                ? isDarkTheme
                  ? '#F4F4F5'
                  : '#18181B'
                : 'transparent',
            color:
              previewMode === 'desktop'
                ? isDarkTheme
                  ? '#111216'
                  : '#FFFFFF'
                : 'inherit',
          }}
        >
          <Monitor className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          data-testid="dock-preview-mobile"
          onClick={() => onSetPreviewMode('mobile')}
          title="Mobile Responsive Preview (390px)"
          className="w-7 h-7 rounded-full inline-flex items-center justify-center cursor-pointer transition-colors"
          style={{
            backgroundColor:
              previewMode === 'mobile'
                ? isDarkTheme
                  ? '#F4F4F5'
                  : '#18181B'
                : 'transparent',
            color:
              previewMode === 'mobile'
                ? isDarkTheme
                  ? '#111216'
                  : '#FFFFFF'
                : 'inherit',
          }}
        >
          <Smartphone className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Wave 4 (#12): Opt-in Multi-Slide Carousel trigger */}
      <button
        type="button"
        data-testid="dock-add-slide"
        onClick={onAddSlide}
        title="Add slide to build a multi-slide carousel deck"
        className="h-8 px-2.5 rounded-full text-[11.5px] font-medium inline-flex items-center gap-1 cursor-pointer transition-colors hover:bg-black/5 dark:hover:bg-white/10"
      >
        <Layers className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">
          {snapshot.slides.length > 1 ? `${snapshot.slides.length} Slides` : '+ Slide'}
        </span>
      </button>

      <span
        className="hidden lg:inline-block px-2 font-mono text-[10.5px] opacity-55 tabular-nums"
        title="Deterministic seed code"
      >
        {seedCode}
      </span>
    </div>
  );
}
