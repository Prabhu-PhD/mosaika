import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { BentoTaskPane, MosaikaLogo } from '@bento/ui';
import { Check, Download, Grid3X3, Link2, Moon, Sun, Trash2 } from 'lucide-react';
import { ExportModal } from './components/ExportModal.js';
import { StudioCanvas } from './components/StudioCanvas.js';
import { decodeSharePayload, encodeSharePayload } from './exporters.js';
import { BRAND_ACCENT_SWATCHES, CANVAS_PRESETS } from './presets.js';
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
  const [exportOpen, setExportOpen] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);

  const [widthInput, setWidthInput] = useState(String(snapshot.canvasWidth));
  const [heightInput, setHeightInput] = useState(String(snapshot.canvasHeight));
  const [padInput, setPadInput] = useState(String(snapshot.canvasPadding));

  useEffect(() => {
    setWidthInput(String(snapshot.canvasWidth));
    setHeightInput(String(snapshot.canvasHeight));
    setPadInput(String(snapshot.canvasPadding));
  }, [snapshot.canvasWidth, snapshot.canvasHeight, snapshot.canvasPadding]);

  // Global G shortcut to toggle Swiss Grid Overlay
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = document.activeElement?.tagName.toLowerCase();
      if (tag === 'textarea' || tag === 'input' || tag === 'select') return;
      if (e.key === 'g' || e.key === 'G') {
        setShowGridOverlay((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const isDark = theme === 'dark';

  const commitDimensions = (nextWStr: string, nextHStr: string, nextPadStr: string) => {
    const w = Number.parseInt(nextWStr, 10);
    const h = Number.parseInt(nextHStr, 10);
    const p = Number.parseInt(nextPadStr, 10);
    if (!Number.isFinite(w) || !Number.isFinite(h)) return;
    host.setCanvasDimensions(w, h, Number.isFinite(p) ? p : snapshot.canvasPadding);
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
      setTimeout(() => setShareCopied(false), 1800);
    } catch {
      // Ignore clipboard permission denials
    }
  };

  return (
    <div
      className="h-screen w-screen flex flex-col overflow-hidden"
      style={{
        backgroundColor: isDark ? '#0B0C0D' : '#FFFFFF',
        color: isDark ? '#F4F4F5' : '#111214',
      }}
    >
      {/* Top Studio Bar (44px Swiss Monochrome) */}
      <header
        className="h-11 shrink-0 px-3 flex items-center justify-between gap-2 overflow-x-auto"
        style={{
          backgroundColor: isDark ? '#111214' : '#FFFFFF',
          borderBottom: `1px solid ${isDark ? '#27272A' : '#E4E4E7'}`,
        }}
      >
        {/* Brand Mark */}
        <div className="flex items-center gap-2 shrink-0">
          <MosaikaLogo className="h-5 w-5" />
          <div className="flex items-baseline gap-1.5">
            <span className="text-[13px] font-semibold tracking-tight">Mosaika</span>
            <span
              className="text-[10px] font-mono uppercase tracking-wider px-1 py-0.5"
              style={{
                border: `1px solid ${isDark ? '#2E3035' : '#D4D4D8'}`,
                color: isDark ? '#A1A1AA' : '#52525B',
              }}
            >
              Studio
            </span>
          </div>
        </div>

        {/* Center Canvas Preset + Dimensions + Brand Accent */}
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
            className="h-7 px-2 text-[11px] font-medium outline-none cursor-pointer"
            style={{
              backgroundColor: isDark ? '#18181B' : '#FAFAFA',
              color: isDark ? '#F4F4F5' : '#18181B',
              border: `1px solid ${isDark ? '#2E3035' : '#D4D4D8'}`,
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

          {/* Compact W × H + Pad */}
          <div
            className="hidden lg:flex items-center gap-1 h-7 px-1.5 text-[11px] font-mono"
            style={{
              border: `1px solid ${isDark ? '#2E3035' : '#D4D4D8'}`,
              backgroundColor: isDark ? '#18181B' : '#FAFAFA',
            }}
          >
            <input
              aria-label="Canvas Width"
              data-testid="canvas-width-input"
              type="number"
              min={320}
              max={3840}
              value={widthInput}
              onChange={(e) => setWidthInput(e.target.value)}
              onBlur={() => commitDimensions(widthInput, heightInput, padInput)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitDimensions(widthInput, heightInput, padInput);
              }}
              className="w-12 bg-transparent text-right outline-none"
            />
            <span className="opacity-45">×</span>
            <input
              aria-label="Canvas Height"
              data-testid="canvas-height-input"
              type="number"
              min={240}
              max={3840}
              value={heightInput}
              onChange={(e) => setHeightInput(e.target.value)}
              onBlur={() => commitDimensions(widthInput, heightInput, padInput)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitDimensions(widthInput, heightInput, padInput);
              }}
              className="w-12 bg-transparent text-right outline-none"
            />
            <span className="opacity-35 px-0.5">|</span>
            <span className="opacity-55 text-[10px]">Pad</span>
            <input
              aria-label="Canvas Padding"
              type="number"
              min={0}
              max={200}
              value={padInput}
              onChange={(e) => setPadInput(e.target.value)}
              onBlur={() => commitDimensions(widthInput, heightInput, padInput)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitDimensions(widthInput, heightInput, padInput);
              }}
              className="w-9 bg-transparent text-right outline-none"
            />
          </div>

          {/* Brand Accent Swatches */}
          <div
            className="hidden md:flex items-center gap-1 h-7 px-2"
            style={{
              border: `1px solid ${isDark ? '#2E3035' : '#D4D4D8'}`,
            }}
          >
            <span className="text-[10px] font-mono uppercase opacity-60 mr-0.5">Accent</span>
            {BRAND_ACCENT_SWATCHES.map((swatch) => {
              const active = snapshot.brandAccentHex.toLowerCase() === swatch.hex.toLowerCase();
              return (
                <button
                  key={swatch.hex}
                  type="button"
                  title={`Brand Accent: ${swatch.label} (${swatch.hex})`}
                  data-testid={`accent-swatch-${swatch.label.toLowerCase()}`}
                  onClick={() => host.setBrandAccent(swatch.hex)}
                  className="w-4 h-4 rounded-full cursor-pointer transition-transform hover:scale-110"
                  style={{
                    backgroundColor: swatch.hex,
                    boxShadow: active
                      ? isDark
                        ? '0 0 0 1.5px #111214, 0 0 0 3px #F4F4F5'
                        : '0 0 0 1.5px #FFFFFF, 0 0 0 3px #111214'
                      : 'inset 0 0 0 1px rgba(0,0,0,0.18)',
                  }}
                />
              );
            })}
            <input
              aria-label="Custom Brand Accent Color"
              type="color"
              value={snapshot.brandAccentHex}
              onChange={(e) => host.setBrandAccent(e.target.value)}
              className="w-4 h-4 ml-0.5 cursor-pointer bg-transparent border-0 p-0"
              title="Custom Brand Accent"
            />
          </div>
        </div>

        {/* Right Actions: Grid, Theme, Clear, Share, Export */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            title="Toggle Swiss Grid Overlay (G)"
            data-testid="btn-toggle-grid"
            onClick={() => setShowGridOverlay((v) => !v)}
            className="h-7 px-2 inline-flex items-center gap-1 text-[11px] font-medium cursor-pointer"
            style={{
              border: `1px solid ${
                showGridOverlay ? (isDark ? '#F4F4F5' : '#111214') : isDark ? '#2E3035' : '#D4D4D8'
              }`,
              backgroundColor: showGridOverlay
                ? isDark
                  ? '#F4F4F5'
                  : '#111214'
                : 'transparent',
              color: showGridOverlay
                ? isDark
                  ? '#111214'
                  : '#FFFFFF'
                : isDark
                  ? '#E4E4E7'
                  : '#27272A',
            }}
          >
            <Grid3X3 className="w-3.5 h-3.5" />
            <span className="hidden xl:inline">Grid</span>
          </button>

          <button
            type="button"
            title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            data-testid="btn-toggle-theme"
            onClick={handleToggleTheme}
            className="h-7 w-7 inline-flex items-center justify-center cursor-pointer"
            style={{ border: `1px solid ${isDark ? '#2E3035' : '#D4D4D8'}` }}
          >
            {isDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
          </button>

          <button
            type="button"
            title="Clear Artboard"
            data-testid="btn-clear-canvas"
            onClick={() => host.clearCanvas()}
            className="h-7 w-7 inline-flex items-center justify-center cursor-pointer hover:text-red-500"
            style={{ border: `1px solid ${isDark ? '#2E3035' : '#D4D4D8'}` }}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            data-testid="btn-share-url"
            onClick={() => void handleCopyShareUrl()}
            className="h-7 px-2.5 inline-flex items-center gap-1 text-[11px] font-medium cursor-pointer"
            style={{
              border: `1px solid ${isDark ? '#2E3035' : '#D4D4D8'}`,
              backgroundColor: shareCopied ? '#059669' : 'transparent',
              color: shareCopied ? '#FFFFFF' : isDark ? '#F4F4F5' : '#18181B',
            }}
          >
            {shareCopied ? <Check className="w-3.5 h-3.5" /> : <Link2 className="w-3.5 h-3.5" />}
            <span>{shareCopied ? 'Copied' : 'Share'}</span>
          </button>

          <button
            type="button"
            data-testid="btn-open-export"
            onClick={() => setExportOpen(true)}
            className="h-7 px-3 inline-flex items-center gap-1.5 text-[11px] font-semibold cursor-pointer hover:opacity-90"
            style={{
              backgroundColor: isDark ? '#F4F4F5' : '#111214',
              color: isDark ? '#111214' : '#FFFFFF',
            }}
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export</span>
          </button>
        </div>
      </header>

      {/* Main Split Workbench: Left Artboard + Right Mosaika Inspector */}
      <main className="flex-1 min-h-0 flex overflow-hidden">
        <StudioCanvas
          snapshot={snapshot}
          isDarkTheme={isDark}
          showGridOverlay={showGridOverlay}
          onSelectCards={(ids) => host.selectCards(ids)}
          onUpdateCardText={(cardId, text) => host.updateCardText(cardId, text)}
          onSetCardBlockType={(cardId, bt) => host.setCardBlockType(cardId, bt)}
          onSetCardSurfaceTreatment={(cardId, surf) => host.setCardSurfaceTreatment(cardId, surf)}
          onSetCardImage={(cardId, dataUrl) => host.setCardImageDataUrl(cardId, dataUrl, true)}
          onDeleteCard={(cardId) => host.deleteCardById(cardId)}
          onResizeSplit={(nodeId, ratio, snap, commit) =>
            host.resizeActiveSplit(nodeId, ratio, snap, commit)
          }
        />

        <aside
          className="w-[336px] shrink-0 h-full overflow-hidden"
          style={{
            borderLeft: `1px solid ${isDark ? '#27272A' : '#E4E4E7'}`,
          }}
        >
          <BentoTaskPane host={host} theme={theme} fullWidth />
        </aside>
      </main>

      <ExportModal
        open={exportOpen}
        snapshot={snapshot}
        sharePayload={host.toSharePayload()}
        isDarkTheme={isDark}
        onClose={() => setExportOpen(false)}
      />
    </div>
  );
}
