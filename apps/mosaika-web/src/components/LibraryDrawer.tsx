import { useMemo, useState } from 'react';
import type { BentoTemplate, LayoutIntent, RectPt, SavedBentoBlueprint } from '@bento/contract';
import {
  buildCellRenderSpecs,
  getTemplatesByIntent,
  instantiateSavedBlueprint,
  LAYOUT_INTENTS,
  previewTemplateLayout,
} from '@bento/core';
import { Bookmark, X } from 'lucide-react';
import type { StudioSnapshot, WebStudioHost } from '../studioHost.js';

export interface LibraryDrawerProps {
  open: boolean;
  host: WebStudioHost;
  snapshot: StudioSnapshot;
  isDarkTheme: boolean;
  onClose: () => void;
  onToast: (message: string) => void;
}

const PREVIEW_RECT: RectPt = { left: 0, top: 0, width: 864, height: 486 };

function BlueprintPreviewSvg({
  cells,
  anchorRect,
  isZeroGutter,
  isDarkTheme,
}: {
  cells: ReturnType<typeof buildCellRenderSpecs>;
  anchorRect: RectPt;
  isZeroGutter: boolean;
  isDarkTheme: boolean;
}) {
  const viewW = 144;
  const viewH = 84;
  const pad = 6;
  const scale = Math.min((viewW - pad * 2) / anchorRect.width, (viewH - pad * 2) / anchorRect.height);
  const drawW = anchorRect.width * scale;
  const drawH = anchorRect.height * scale;
  const ox = pad + (viewW - pad * 2 - drawW) / 2;
  const oy = pad + (viewH - pad * 2 - drawH) / 2;
  const fillCol = isDarkTheme ? '#E4E4E7' : '#18181B';
  const strokeCol = isDarkTheme ? 'rgba(255,255,255,0.22)' : 'rgba(24,24,27,0.22)';

  return (
    <svg viewBox={`0 0 ${viewW} ${viewH}`} className="w-full h-full block" aria-hidden="true">
      {cells.map((cell) => {
        const x = ox + (cell.rect.left - anchorRect.left) * scale;
        const y = oy + (cell.rect.top - anchorRect.top) * scale;
        const w = Math.max(3, cell.rect.width * scale);
        const h = Math.max(3, cell.rect.height * scale);
        const opacity = cell.role === 'hero' ? 0.24 : 0.1;

        if (cell.svgPath) {
          return (
            <path
              key={cell.slotId}
              d={cell.svgPath}
              transform={`translate(${x} ${y}) scale(${scale})`}
              fill={fillCol}
              fillOpacity={opacity}
              stroke={strokeCol}
              strokeWidth={0.8}
              vectorEffect="non-scaling-stroke"
            />
          );
        }

        return (
          <rect
            key={cell.slotId}
            x={x}
            y={y}
            width={w}
            height={h}
            rx={isZeroGutter ? 0 : 2.5}
            fill={fillCol}
            fillOpacity={opacity}
            stroke={strokeCol}
            strokeWidth={0.8}
          />
        );
      })}
    </svg>
  );
}

export function LibraryDrawer({
  open,
  host,
  snapshot,
  isDarkTheme,
  onClose,
  onToast,
}: LibraryDrawerProps) {
  const [selectedTab, setSelectedTab] = useState<LayoutIntent | '__saved__'>(
    snapshot.activeDoc?.params.intent ?? 'executive-brief'
  );
  const [saveName, setSaveName] = useState('');

  const templates = useMemo(() => {
    if (!open || selectedTab === '__saved__') return [];
    return getTemplatesByIntent(selectedTab);
  }, [open, selectedTab]);

  if (!open) return null;

  const bg = isDarkTheme ? '#111216' : '#FFFFFF';
  const well = isDarkTheme ? '#181A20' : '#F6F7F9';
  const border = isDarkTheme ? 'rgba(255,255,255,0.09)' : 'rgba(15,23,42,0.09)';
  const fg = isDarkTheme ? '#F4F4F5' : '#18181B';
  const muted = isDarkTheme ? '#9CA3AF' : '#64748B';
  const activeBg = isDarkTheme ? '#F4F4F5' : '#18181B';
  const activeFg = isDarkTheme ? '#111216' : '#FFFFFF';

  const handleSaveCurrent = () => {
    const saved = host.saveCurrentBlueprint(saveName);
    if (saved) {
      setSaveName('');
      setSelectedTab('__saved__');
      onToast(`Saved "${saved.name}" to My Library.`);
    }
  };

  const handlePickTemplate = (tpl: BentoTemplate) => {
    host.applyTemplate(tpl);
    onClose();
  };

  const handlePickSaved = (bp: SavedBentoBlueprint) => {
    host.applySavedBlueprint(bp);
    onClose();
  };

  return (
    <div
      data-testid="library-drawer-backdrop"
      className="fixed inset-0 z-50 flex justify-end bg-black/35 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Mosaika Blueprint Library"
        data-testid="library-drawer"
        className="w-full max-w-xl h-full flex flex-col shadow-2xl"
        style={{ backgroundColor: bg, color: fg, borderLeft: `1px solid ${border}` }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="px-5 py-4 flex items-center justify-between shrink-0"
          style={{ borderBottom: `1px solid ${border}` }}
        >
          <div>
            <h2 className="text-sm font-semibold tracking-tight">Layout Library</h2>
            <p className="text-[11.5px] mt-0.5" style={{ color: muted }}>
              144 curated Swiss blueprints across 12 intents + your personal saved layouts.
            </p>
          </div>
          <button
            type="button"
            data-testid="library-drawer-close"
            onClick={onClose}
            className="p-1.5 rounded-lg cursor-pointer hover:opacity-70"
            aria-label="Close library"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Save Current Layout Strip */}
        {snapshot.activeDoc && (
          <div
            className="px-5 py-3 flex items-center gap-2 shrink-0"
            style={{ backgroundColor: well, borderBottom: `1px solid ${border}` }}
          >
            <input
              type="text"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveCurrent();
              }}
              placeholder="Save current layout to My Saved..."
              data-testid="input-save-blueprint-name"
              className="flex-1 h-8 px-3 rounded-lg text-[12px] outline-none"
              style={{ backgroundColor: bg, color: fg, border: `1px solid ${border}` }}
            />
            <button
              type="button"
              data-testid="btn-save-blueprint"
              onClick={handleSaveCurrent}
              className="h-8 px-3 rounded-lg text-[12px] font-semibold inline-flex items-center gap-1.5 cursor-pointer"
              style={{ backgroundColor: activeBg, color: activeFg }}
            >
              <Bookmark className="w-3.5 h-3.5" />
              <span>Save</span>
            </button>
          </div>
        )}

        {/* Calm Intent Filter Pills */}
        <div
          className="px-5 py-3 flex flex-wrap gap-1.5 shrink-0"
          style={{ borderBottom: `1px solid ${border}` }}
        >
          <button
            type="button"
            data-testid="library-pill-saved"
            onClick={() => setSelectedTab('__saved__')}
            className="px-2.5 py-1 rounded-full text-[11.5px] font-medium inline-flex items-center gap-1 cursor-pointer transition-colors"
            style={{
              backgroundColor: selectedTab === '__saved__' ? activeBg : well,
              color: selectedTab === '__saved__' ? activeFg : fg,
            }}
          >
            <Bookmark className="w-3 h-3" />
            <span>My Saved ({snapshot.savedBlueprints.length})</span>
          </button>

          {LAYOUT_INTENTS.map((def) => {
            const active = selectedTab === def.id;
            return (
              <button
                key={def.id}
                type="button"
                data-testid={`library-pill-${def.id}`}
                onClick={() => setSelectedTab(def.id)}
                className="px-2.5 py-1 rounded-full text-[11.5px] font-medium cursor-pointer transition-colors"
                style={{
                  backgroundColor: active ? activeBg : well,
                  color: active ? activeFg : fg,
                }}
              >
                {def.label}
              </button>
            );
          })}
        </div>

        {/* Spacious 3-Column Swatch Grid */}
        <div className="flex-1 min-h-0 overflow-y-auto p-5">
          {selectedTab === '__saved__' ? (
            snapshot.savedBlueprints.length === 0 ? (
              <div className="h-44 flex flex-col items-center justify-center text-center" style={{ color: muted }}>
                <Bookmark className="w-6 h-6 mb-2 opacity-40" />
                <p className="text-xs font-medium">No saved layouts yet</p>
                <p className="text-[11px] mt-1 opacity-75">
                  Name your current grid above and click Save to keep it here.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-3" data-testid="library-saved-grid">
                {snapshot.savedBlueprints.map((bp) => {
                  const inst = instantiateSavedBlueprint(bp, PREVIEW_RECT, null);
                  const cells = buildCellRenderSpecs(inst, { supportsCustomGeometry: true });
                  return (
                    <div key={bp.id} className="group relative flex flex-col gap-1.5">
                      <button
                        type="button"
                        data-testid={`library-saved-${bp.id}`}
                        onClick={() => handlePickSaved(bp)}
                        className="h-24 rounded-xl overflow-hidden transition-all cursor-pointer hover:scale-[1.02]"
                        style={{ backgroundColor: well, border: `1px solid ${border}` }}
                      >
                        <BlueprintPreviewSvg
                          cells={cells}
                          anchorRect={inst.anchorRect}
                          isZeroGutter={bp.docSnapshot.params.gutterPt === 0}
                          isDarkTheme={isDarkTheme}
                        />
                      </button>
                      <span className="text-[11px] font-medium truncate text-center">{bp.name}</span>
                      <button
                        type="button"
                        aria-label={`Delete ${bp.name}`}
                        onClick={() => host.deleteSavedBlueprint(bp.id)}
                        className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer bg-zinc-900/80 text-white hover:bg-red-600"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )
          ) : (
            <div className="grid grid-cols-3 gap-3" data-testid="library-template-grid">
              {templates.map((tpl) => {
                const preview = previewTemplateLayout(tpl, PREVIEW_RECT);
                return (
                  <button
                    key={tpl.id}
                    type="button"
                    data-testid={`library-template-${tpl.id}`}
                    onClick={() => handlePickTemplate(tpl)}
                    title={`${tpl.name} · ${tpl.params.count} cards`}
                    className="group flex flex-col gap-1.5 text-left cursor-pointer"
                  >
                    <div
                      className="h-24 w-full rounded-xl overflow-hidden transition-all group-hover:scale-[1.02]"
                      style={{ backgroundColor: well, border: `1px solid ${border}` }}
                    >
                      <BlueprintPreviewSvg
                        cells={preview.cells}
                        anchorRect={preview.anchorRect}
                        isZeroGutter={tpl.params.gutterPt === 0}
                        isDarkTheme={isDarkTheme}
                      />
                    </div>
                    <div className="flex items-center justify-between px-0.5">
                      <span className="text-[11px] font-medium truncate">{tpl.name}</span>
                      <span className="text-[10px] font-mono" style={{ color: muted }}>
                        {preview.cells.length}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
