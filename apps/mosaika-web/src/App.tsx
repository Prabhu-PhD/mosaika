import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { MosaikaLogo } from '@bento/ui';
import {
  Check,
  Download,
  LayoutGrid,
  Link2,
  Moon,
  Redo2,
  Sparkles,
  Sun,
  Undo2,
} from 'lucide-react';
import { ExportModal } from './components/ExportModal.js';
import { FloatingDock } from './components/FloatingDock.js';
import { LibraryDrawer } from './components/LibraryDrawer.js';
import { RemixModal } from './components/RemixModal.js';
import { SlideFilmstrip } from './components/SlideFilmstrip.js';
import { StudioCanvas } from './components/StudioCanvas.js';
import { StudioInspector } from './components/StudioInspector.js';
import { decodeSharePayload, encodeSharePayload } from './exporters.js';
import { CANVAS_PRESETS } from './presets.js';
import { WebStudioHost } from './studioHost.js';

const PRESET_GROUPS = ['Web', 'Social', 'Print'] as const;

export function App() {
  const host = useMemo(() => {
    const hash = typeof window !== 'undefined' ? window.location.hash : '';
    const initialSharePayload = hash.startsWith('#mosaika=') ? decodeSharePayload(hash) : null;
    return new WebStudioHost({ initialSharePayload });
  }, []);

  const snapshot = useSyncExternalStore(
    (cb) => host.subscribe(cb),
    () => host.getSnapshot()
  );

  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [showGridOverlay, setShowGridOverlay] = useState(false);
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop');
  const [exportOpen, setExportOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [remixOpen, setRemixOpen] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const [widthInput, setWidthInput] = useState(String(snapshot.canvasWidth));
  const [heightInput, setHeightInput] = useState(String(snapshot.canvasHeight));

  useEffect(() => {
    setWidthInput(String(snapshot.canvasWidth));
    setHeightInput(String(snapshot.canvasHeight));
  }, [snapshot.canvasWidth, snapshot.canvasHeight]);

  const showToast = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => {
      setToast((prev) => (prev === message ? null : prev));
    }, 2600);
  }, []);

  // Global Studio Keyboard Shortcuts (G = Grid, Space = Shuffle, Ctrl/Cmd+Z/Y = Undo/Redo)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = document.activeElement?.tagName.toLowerCase();
      const isEditingText = tag === 'textarea' || tag === 'input' || tag === 'select';

      if ((e.ctrlKey || e.metaKey) && !isEditingText) {
        const key = e.key.toLowerCase();
        if (key === 'z' && !e.shiftKey) {
          e.preventDefault();
          host.undo();
          return;
        }
        if ((key === 'z' && e.shiftKey) || key === 'y') {
          e.preventDefault();
          host.redo();
          return;
        }
      }

      if (isEditingText) return;
      if (e.key === 'g' || e.key === 'G') {
        setShowGridOverlay((prev) => !prev);
      } else if (e.code === 'Space' && !exportOpen && !libraryOpen && !remixOpen) {
        e.preventDefault();
        host.randomizeSeed();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [exportOpen, host, libraryOpen, remixOpen]);

  // Global Ctrl+V Clipboard Image Paste into selected card (#17)
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        const item = items[i]!;
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (!file) continue;
          const snap = host.getSnapshot();
          const targetId = snap.selectedCardIds[0] ?? snap.cards[0]?.id;
          if (!targetId) return;
          e.preventDefault();
          const reader = new FileReader();
          reader.onload = () => {
            if (typeof reader.result === 'string') {
              host.setCardImageDataUrl(targetId, reader.result, true);
              showToast('Pasted image into card.');
            }
          };
          reader.readAsDataURL(file);
          break;
        }
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [host, showToast]);

  const isDark = theme === 'dark';

  const commitDimensions = (nextWStr: string, nextHStr: string) => {
    const w = Number.parseInt(nextWStr, 10);
    const h = Number.parseInt(nextHStr, 10);
    if (!Number.isFinite(w) || !Number.isFinite(h)) return;
    host.setCanvasDimensions(w, h, snapshot.canvasPadding);
  };

  const handleToggleTheme = () => {
    const nextDark = !isDark;
    setTheme(nextDark ? 'dark' : 'light');
    host.setTheme(nextDark);
  };

  const handleCopyShareUrl = async () => {
    const payload = host.toSharePayload();
    if (!payload) return;
    const encoded = encodeSharePayload(payload);
    const url = `${window.location.origin}${window.location.pathname}#mosaika=${encoded}`;
    window.history.replaceState(null, '', `#mosaika=${encoded}`);
    try {
      await navigator.clipboard.writeText(url);
      setShareCopied(true);
      showToast('Copied zero-backend share link.');
      setTimeout(() => setShareCopied(false), 1800);
    } catch {
      // Ignore clipboard permission denials
    }
  };

  const border = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)';
  const well = isDark ? '#181A20' : '#F4F5F8';
  const fg = isDark ? '#F4F4F5' : '#18181B';
  const muted = isDark ? '#9CA3AF' : '#64748B';

  return (
    <div
      className="h-screen w-screen flex flex-col overflow-hidden"
      style={{
        backgroundColor: isDark ? '#090A0D' : '#EEF0F4',
        color: fg,
      }}
    >
      {/* Calm 52px Top Studio Bar — 3 quiet clusters */}
      <header
        className="h-[52px] shrink-0 px-4 flex items-center justify-between gap-3"
        style={{
          backgroundColor: isDark ? '#111216' : '#FFFFFF',
          borderBottom: `1px solid ${border}`,
        }}
      >
        {/* Left: Brand + Library Trigger */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <span
              className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{
                backgroundColor: isDark ? '#F4F4F5' : '#18181B',
                color: isDark ? '#111216' : '#FFFFFF',
              }}
            >
              <MosaikaLogo className="h-4 w-4" />
            </span>
            <span className="text-[14px] font-semibold tracking-tight">Mosaika</span>
          </div>

          <button
            type="button"
            data-testid="topbar-btn-library"
            onClick={() => setLibraryOpen(true)}
            className="h-8 px-3 rounded-lg text-[12px] font-medium inline-flex items-center gap-1.5 cursor-pointer transition-colors"
            style={{ backgroundColor: well, color: fg }}
          >
            <LayoutGrid className="w-3.5 h-3.5" style={{ color: muted }} />
            <span>Library</span>
          </button>

          <button
            type="button"
            data-testid="topbar-btn-remix"
            onClick={() => setRemixOpen(true)}
            className="h-8 px-3 rounded-lg text-[12px] font-medium inline-flex items-center gap-1.5 cursor-pointer transition-colors"
            style={{ backgroundColor: well, color: fg }}
          >
            <Sparkles className="w-3.5 h-3.5" style={{ color: snapshot.brandAccentHex }} />
            <span>Remix</span>
          </button>
        </div>

        {/* Center: Format Preset Pill + Compact W × H */}
        <div className="flex items-center gap-2 shrink-0">
          <select
            aria-label="Canvas Preset"
            data-testid="canvas-preset-select"
            value={snapshot.presetId}
            onChange={(e) => {
              if (e.target.value !== 'custom') {
                host.selectPreset(e.target.value);
              }
            }}
            className="h-8 px-3 rounded-lg text-[12px] font-medium outline-none cursor-pointer"
            style={{
              backgroundColor: well,
              color: fg,
              border: `1px solid ${border}`,
            }}
          >
            {PRESET_GROUPS.map((group) => (
              <optgroup key={group} label={group}>
                {CANVAS_PRESETS.filter((p) => p.group === group).map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label}
                  </option>
                ))}
              </optgroup>
            ))}
            {snapshot.presetId === 'custom' && <option value="custom">Custom Size</option>}
          </select>

          <div
            className="hidden lg:flex items-center gap-1 h-8 px-2.5 rounded-lg text-[11.5px] font-mono"
            style={{ backgroundColor: well, border: `1px solid ${border}` }}
          >
            <input
              aria-label="Canvas Width"
              data-testid="canvas-width-input"
              type="number"
              min={320}
              max={3840}
              value={widthInput}
              onChange={(e) => setWidthInput(e.target.value)}
              onBlur={() => commitDimensions(widthInput, heightInput)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitDimensions(widthInput, heightInput);
              }}
              className="w-11 bg-transparent text-right outline-none"
            />
            <span style={{ color: muted }}>×</span>
            <input
              aria-label="Canvas Height"
              data-testid="canvas-height-input"
              type="number"
              min={240}
              max={3840}
              value={heightInput}
              onChange={(e) => setHeightInput(e.target.value)}
              onBlur={() => commitDimensions(widthInput, heightInput)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitDimensions(widthInput, heightInput);
              }}
              className="w-11 bg-transparent text-right outline-none"
            />
          </div>
        </div>

        {/* Right: Undo/Redo, Theme, Share, Export */}
        <div className="flex items-center gap-1.5 shrink-0">
          <div
            className="inline-flex items-center rounded-lg p-0.5"
            style={{ backgroundColor: well }}
          >
            <button
              type="button"
              data-testid="btn-studio-undo"
              disabled={!snapshot.canUndo}
              onClick={() => host.undo()}
              title="Undo (Ctrl+Z)"
              className="w-7 h-7 rounded-md inline-flex items-center justify-center cursor-pointer disabled:opacity-30"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              data-testid="btn-studio-redo"
              disabled={!snapshot.canRedo}
              onClick={() => host.redo()}
              title="Redo (Ctrl+Shift+Z)"
              className="w-7 h-7 rounded-md inline-flex items-center justify-center cursor-pointer disabled:opacity-30"
            >
              <Redo2 className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            type="button"
            title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            data-testid="btn-toggle-theme"
            onClick={handleToggleTheme}
            className="w-8 h-8 rounded-lg inline-flex items-center justify-center cursor-pointer"
            style={{ backgroundColor: well }}
          >
            {isDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
          </button>

          <button
            type="button"
            data-testid="btn-share-url"
            onClick={() => void handleCopyShareUrl()}
            className="h-8 px-3 rounded-lg inline-flex items-center gap-1.5 text-[12px] font-medium cursor-pointer"
            style={{
              backgroundColor: shareCopied ? '#059669' : well,
              color: shareCopied ? '#FFFFFF' : fg,
            }}
          >
            {shareCopied ? <Check className="w-3.5 h-3.5" /> : <Link2 className="w-3.5 h-3.5" />}
            <span>{shareCopied ? 'Copied' : 'Share'}</span>
          </button>

          <button
            type="button"
            data-testid="btn-open-export"
            onClick={() => setExportOpen(true)}
            className="h-8 px-3.5 rounded-lg inline-flex items-center gap-1.5 text-[12px] font-semibold cursor-pointer hover:opacity-90"
            style={{
              backgroundColor: isDark ? '#F4F4F5' : '#18181B',
              color: isDark ? '#111216' : '#FFFFFF',
            }}
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export</span>
          </button>
        </div>
      </header>

      {/* Main Split Workbench: Spacious Artboard + Serene Contextual Inspector */}
      <main className="relative flex-1 min-h-0 flex overflow-hidden">
        <StudioCanvas
          snapshot={snapshot}
          isDarkTheme={isDark}
          showGridOverlay={showGridOverlay}
          previewMode={previewMode}
          onSelectCards={(ids) => host.selectCards(ids)}
          onUpdateCardText={(cardId, text) => host.updateCardText(cardId, text)}
          onSetCardImage={(cardId, dataUrl) => host.setCardImageDataUrl(cardId, dataUrl, true)}
          onSwapCardContents={(src, dst) => {
            host.swapCardContents(src, dst);
            showToast('Swapped tile contents.');
          }}
          onDeleteCard={(cardId) => host.deleteCardAndReflow(cardId)}
          onResizeSplit={(nodeId, ratio, snap, commit) =>
            host.resizeActiveSplit(nodeId, ratio, snap, commit)
          }
        >
          <SlideFilmstrip
            host={host}
            snapshot={snapshot}
            isDarkTheme={isDark}
            onToast={showToast}
          />
          <FloatingDock
            host={host}
            snapshot={snapshot}
            isDarkTheme={isDark}
            showGridOverlay={showGridOverlay}
            previewMode={previewMode}
            onToggleGrid={() => setShowGridOverlay((v) => !v)}
            onSetPreviewMode={(mode) => setPreviewMode(mode)}
            onAddSlide={() => {
              host.addSlide(false);
              showToast(`Added slide ${snapshot.slides.length + 1} to carousel.`);
            }}
          />
        </StudioCanvas>

        <StudioInspector
          host={host}
          snapshot={snapshot}
          isDarkTheme={isDark}
          onOpenLibrary={() => setLibraryOpen(true)}
          onToast={showToast}
        />

        {/* Quiet Floating Toast */}
        {toast && (
          <div
            role="status"
            data-testid="studio-toast"
            className="fixed top-16 left-1/2 -translate-x-1/2 z-40 px-3.5 py-2 rounded-full text-[12px] font-medium shadow-lg"
            style={{
              backgroundColor: isDark ? '#F4F4F5' : '#18181B',
              color: isDark ? '#111216' : '#FFFFFF',
            }}
          >
            {toast}
          </div>
        )}
      </main>

      <LibraryDrawer
        open={libraryOpen}
        host={host}
        snapshot={snapshot}
        isDarkTheme={isDark}
        onClose={() => setLibraryOpen(false)}
        onToast={showToast}
      />

      <RemixModal
        open={remixOpen}
        host={host}
        isDarkTheme={isDark}
        onThemeSync={(nextDark) => setTheme(nextDark ? 'dark' : 'light')}
        onClose={() => setRemixOpen(false)}
        onToast={showToast}
      />

      <ExportModal
        open={exportOpen}
        host={host}
        snapshot={snapshot}
        sharePayload={host.toSharePayload()}
        isDarkTheme={isDark}
        onClose={() => setExportOpen(false)}
      />
    </div>
  );
}
