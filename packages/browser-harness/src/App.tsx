import { useEffect, useMemo, useState } from 'react';
import { BentoTaskPane, MosaikaLogo } from '@bento/ui';
import { Grid3x3, Moon, RotateCcw, Sun } from 'lucide-react';
import { SlideCanvas } from './components/SlideCanvas.js';
import { SlideThumbnails } from './components/SlideThumbnails.js';
import { MockBentoHost, type CapabilityProfileId } from './mockHost.js';

const SIMULATOR_MODES: ReadonlyArray<{ id: CapabilityProfileId; label: string }> = [
  { id: 'vsto', label: 'VSTO' },
  { id: 'officejs-110', label: 'Office.js 1.10' },
  { id: 'officejs-14', label: 'Office.js 1.4 Legacy' },
];

export function App() {
  const host = useMemo(() => new MockBentoHost(), []);
  const [snapshot, setSnapshot] = useState(() => host.getSnapshot());
  const [capabilitiesRev, setCapabilitiesRev] = useState(0);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [showGridOverlay, setShowGridOverlay] = useState(true);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = document.activeElement?.tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;
      if (e.key.toLowerCase() === 'g' && !e.ctrlKey && !e.metaKey) {
        setShowGridOverlay((v) => !v);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    return host.subscribeDeck(() => {
      setSnapshot(host.getSnapshot());
    });
  }, [host]);

  const handleSelectProfile = (profile: CapabilityProfileId) => {
    host.setCapabilityProfile(profile);
    setCapabilitiesRev((v) => v + 1);
  };

  const activeSlide = snapshot.slides[snapshot.activeSlideIndex] ?? snapshot.slides[0]!;
  const isDark = theme === 'dark';

  return (
    <div className={isDark ? 'dark h-full w-full' : 'h-full w-full'}>
      <div className="flex h-full w-full flex-col bg-[#F4F5F4] text-[#1B1D1E] dark:bg-[#0D0F0F] dark:text-[#E6E9E7]">
        {/* Top Capability Simulator Bar (InfoGen quiet neutral bench) */}
        <header className="flex h-11 shrink-0 items-center justify-between border-b border-[#DADDDB] bg-white px-4 dark:border-[#2B302E] dark:bg-[#171A1A]">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-[2px] bg-[#1B1D1E] text-white dark:bg-[#E6E9E7] dark:text-[#111313]">
              <MosaikaLogo className="h-3.5 w-3.5" />
            </span>
            <span className="text-[13px] font-semibold tracking-tight">
              Mosaika — Browser QA Harness
            </span>
            <span className="rounded-[2px] border border-[#DADDDB] px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-[#5B6164] dark:border-[#2B302E] dark:text-[#9DA4A1]">
              Phase 0
            </span>
          </div>

          <div className="flex items-center gap-2">
            <div
              role="group"
              aria-label="Capability Simulator"
              className="flex items-center border border-[#1B1D1E] dark:border-[#E6E9E7]"
            >
              {SIMULATOR_MODES.map((mode, idx) => {
                const active = snapshot.profile === mode.id;
                return (
                  <button
                    key={mode.id}
                    type="button"
                    data-testid={`sim-mode-${mode.id}`}
                    onClick={() => handleSelectProfile(mode.id)}
                    className={`h-7 px-2.5 text-[11px] font-medium transition-colors ${
                      idx > 0 ? 'border-l border-[#1B1D1E] dark:border-[#E6E9E7]' : ''
                    } ${
                      active
                        ? 'bg-[#1B1D1E] font-semibold text-white dark:bg-[#E6E9E7] dark:text-[#111313]'
                        : 'bg-white text-[#1B1D1E] hover:bg-[#F4F5F4] dark:bg-[#171A1A] dark:text-[#E6E9E7] dark:hover:bg-[#1E2221]'
                    }`}
                  >
                    {mode.label}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => setShowGridOverlay((v) => !v)}
              title="Toggle Swiss Grid Overlay (Shortcut: G)"
              data-testid="btn-toggle-grid-overlay"
              className={`flex h-7 items-center gap-1.5 rounded-[2px] border px-2.5 text-[11px] font-medium transition-colors ${
                showGridOverlay
                  ? 'border-[#1B1D1E] bg-[#1B1D1E] text-white dark:border-[#E6E9E7] dark:bg-[#E6E9E7] dark:text-[#111313]'
                  : 'border-[#B9BDBB] bg-white text-[#1B1D1E] hover:bg-[#F4F5F4] dark:border-[#434B48] dark:bg-[#171A1A] dark:text-[#E6E9E7]'
              }`}
            >
              <Grid3x3 className="h-3.5 w-3.5" />
              <span>Grid</span>
            </button>

            <button
              type="button"
              onClick={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
              title="Toggle Light / Dark UI Theme"
              aria-label="Toggle Theme"
              data-testid="btn-toggle-theme"
              className="flex h-7 w-7 items-center justify-center rounded-[2px] border border-[#B9BDBB] bg-white text-[#1B1D1E] hover:bg-[#F4F5F4] dark:border-[#434B48] dark:bg-[#171A1A] dark:text-[#E6E9E7]"
            >
              {isDark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
            </button>

            <button
              type="button"
              onClick={() => {
                host.resetDeck();
                setCapabilitiesRev((v) => v + 1);
              }}
              data-testid="btn-reset-deck"
              className="flex h-7 items-center gap-1.5 rounded-[2px] border border-[#B9BDBB] bg-white px-2.5 text-[11px] font-medium text-[#1B1D1E] hover:bg-[#F4F5F4] dark:border-[#434B48] dark:bg-[#171A1A] dark:text-[#E6E9E7]"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Reset Slide</span>
            </button>
          </div>
        </header>

        {/* Main Workbench Split: Interactive Slide Canvas (Left) + 320px Task Pane Rail (Right) */}
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <SlideCanvas
              slide={activeSlide}
              capabilities={snapshot.capabilities}
              isDarkTheme={isDark}
              showGridOverlay={showGridOverlay}
              onDrawPlaceholder={(rect) => host.addPlaceholderRect(rect)}
              onSelectShapes={(ids) => host.selectShapes(ids)}
              onUpdateShapeText={(shapeId, text) => host.updateShapeText(shapeId, text)}
              onDeleteShape={(shapeId) => host.deleteShapeById(shapeId)}
              onDeleteSelected={() => host.deleteSelectedShapes()}
              onResizeSplit={(bentoId, nodeId, nextRatio, snapHarmonic, commit) => {
                host.resizeActiveBentoSplit(bentoId, nodeId, nextRatio, snapHarmonic, commit);
                if (commit) {
                  setCapabilitiesRev((v) => v + 1);
                }
              }}
            />

            <SlideThumbnails
              slides={snapshot.slides}
              activeSlideIndex={snapshot.activeSlideIndex}
              isDarkTheme={isDark}
              onSelectSlide={(idx) => {
                host.setActiveSlide(idx);
                setCapabilitiesRev((v) => v + 1);
              }}
            />
          </main>

          <div className="flex h-full shrink-0 border-l border-slate-200 shadow-lg dark:border-zinc-800">
            <BentoTaskPane
              host={host}
              theme={theme}
              capabilitiesRevision={capabilitiesRev}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
