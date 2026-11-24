import { useMemo, useState } from 'react';
import { Check, Code2, Copy, Download, FileCode, Image as ImageIcon, Link2, X } from 'lucide-react';
import {
  encodeSharePayload,
  exportToHtmlTailwind,
  exportToPngBlob,
  exportToSvg,
  triggerFileDownload,
} from '../exporters.js';
import type { ShareableStudioPayload, StudioSnapshot } from '../studioHost.js';

export interface ExportModalProps {
  open: boolean;
  snapshot: StudioSnapshot;
  sharePayload: ShareableStudioPayload | null;
  isDarkTheme: boolean;
  onClose: () => void;
}

export function ExportModal({
  open,
  snapshot,
  sharePayload,
  isDarkTheme,
  onClose,
}: ExportModalProps) {
  const [pngScale, setPngScale] = useState<1 | 2 | 3>(2);
  const [exportingPng, setExportingPng] = useState(false);
  const [pngError, setPngError] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const htmlTailwindCode = useMemo(
    () => (open ? exportToHtmlTailwind(snapshot) : ''),
    [open, snapshot]
  );

  if (!open) return null;

  const baseFilename = `mosaika-${snapshot.canvasWidth}x${snapshot.canvasHeight}`;

  const handleDownloadSvg = () => {
    const svg = exportToSvg(snapshot);
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    triggerFileDownload(blob, `${baseFilename}.svg`);
  };

  const handleDownloadPng = async () => {
    setExportingPng(true);
    setPngError(null);
    try {
      const blob = await exportToPngBlob(snapshot, pngScale);
      triggerFileDownload(blob, `${baseFilename}@${pngScale}x.png`);
    } catch (err) {
      setPngError(err instanceof Error ? err.message : 'PNG export failed.');
    } finally {
      setExportingPng(false);
    }
  };

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(htmlTailwindCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 1800);
    } catch {
      // Clipboard may be unavailable in restricted contexts
    }
  };

  const handleCopyShareLink = async () => {
    if (!sharePayload) return;
    try {
      const encoded = encodeSharePayload(sharePayload);
      const shareUrl = `${window.location.origin}${window.location.pathname}#mosaika=${encoded}`;
      window.history.replaceState(null, '', `#mosaika=${encoded}`);
      await navigator.clipboard.writeText(shareUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 1800);
    } catch {
      // Ignore clipboard failures
    }
  };

  const panelBg = isDarkTheme ? '#111214' : '#FFFFFF';
  const panelFg = isDarkTheme ? '#F4F4F5' : '#111214';
  const borderCol = isDarkTheme ? '#2E3035' : '#18181B';
  const mutedBorder = isDarkTheme ? '#27272A' : '#E4E4E7';
  const subText = isDarkTheme ? '#A1A1AA' : '#52525B';

  return (
    <div
      data-testid="export-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 backdrop-blur-[1px]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Export Mosaika Layout"
        data-testid="export-modal"
        className="w-full max-w-2xl flex flex-col max-h-[88vh] overflow-hidden shadow-2xl"
        style={{
          backgroundColor: panelBg,
          color: panelFg,
          border: `1px solid ${borderCol}`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: `1px solid ${mutedBorder}` }}
        >
          <div>
            <h2 className="text-sm font-semibold tracking-tight">Export Mosaika Layout</h2>
            <p className="text-[11px] font-mono mt-0.5" style={{ color: subText }}>
              {snapshot.canvasWidth} × {snapshot.canvasHeight} px · {snapshot.cards.length} cards
            </p>
          </div>
          <button
            type="button"
            data-testid="export-modal-close"
            onClick={onClose}
            className="p-1.5 hover:opacity-70 cursor-pointer"
            aria-label="Close export modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 space-y-4 overflow-y-auto">
          {/* Vector + Raster Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* SVG Card */}
            <div className="p-3 flex flex-col justify-between" style={{ border: `1px solid ${mutedBorder}` }}>
              <div>
                <div className="flex items-center gap-2 text-xs font-semibold">
                  <FileCode className="w-3.5 h-3.5" />
                  <span>Vector SVG</span>
                </div>
                <p className="text-[11px] mt-1 leading-relaxed" style={{ color: subText }}>
                  Pure vector primitives ready for Figma, Illustrator, Framer, or web embedding.
                </p>
              </div>
              <button
                type="button"
                data-testid="btn-download-svg"
                onClick={handleDownloadSvg}
                className="mt-3 w-full py-2 px-3 text-xs font-medium flex items-center justify-center gap-1.5 cursor-pointer transition-opacity hover:opacity-90"
                style={{
                  backgroundColor: isDarkTheme ? '#F4F4F5' : '#111214',
                  color: isDarkTheme ? '#111214' : '#FFFFFF',
                }}
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download .svg</span>
              </button>
            </div>

            {/* PNG Card */}
            <div className="p-3 flex flex-col justify-between" style={{ border: `1px solid ${mutedBorder}` }}>
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-semibold">
                    <ImageIcon className="w-3.5 h-3.5" />
                    <span>Retina PNG</span>
                  </div>
                  <div
                    className="inline-flex text-[10px] font-mono"
                    style={{ border: `1px solid ${mutedBorder}` }}
                  >
                    {([1, 2, 3] as const).map((s) => {
                      const active = pngScale === s;
                      return (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setPngScale(s)}
                          className="px-2 py-0.5 cursor-pointer"
                          style={{
                            backgroundColor: active
                              ? isDarkTheme
                                ? '#F4F4F5'
                                : '#111214'
                              : 'transparent',
                            color: active
                              ? isDarkTheme
                                ? '#111214'
                                : '#FFFFFF'
                              : subText,
                          }}
                        >
                          {s}×
                        </button>
                      );
                    })}
                  </div>
                </div>
                <p className="text-[11px] mt-1 leading-relaxed" style={{ color: subText }}>
                  Crisp raster output at {snapshot.canvasWidth * pngScale} ×{' '}
                  {snapshot.canvasHeight * pngScale} px.
                </p>
                {pngError && <p className="text-[11px] text-red-500 mt-1">{pngError}</p>}
              </div>
              <button
                type="button"
                data-testid="btn-download-png"
                disabled={exportingPng}
                onClick={() => void handleDownloadPng()}
                className="mt-3 w-full py-2 px-3 text-xs font-medium flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                style={{
                  border: `1px solid ${borderCol}`,
                  backgroundColor: 'transparent',
                  color: panelFg,
                }}
              >
                <Download className="w-3.5 h-3.5" />
                <span>{exportingPng ? 'Rendering PNG...' : `Download @${pngScale}x .png`}</span>
              </button>
            </div>
          </div>

          {/* HTML + Tailwind Code Preview */}
          <div style={{ border: `1px solid ${mutedBorder}` }}>
            <div
              className="flex items-center justify-between px-3 py-2"
              style={{ borderBottom: `1px solid ${mutedBorder}` }}
            >
              <div className="flex items-center gap-1.5 text-xs font-semibold">
                <Code2 className="w-3.5 h-3.5" />
                <span>Responsive HTML + Tailwind CSS</span>
              </div>
              <button
                type="button"
                data-testid="btn-copy-tailwind"
                onClick={() => void handleCopyCode()}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium cursor-pointer"
                style={{
                  border: `1px solid ${mutedBorder}`,
                  backgroundColor: copiedCode ? '#059669' : 'transparent',
                  color: copiedCode ? '#FFFFFF' : panelFg,
                }}
              >
                {copiedCode ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                <span>{copiedCode ? 'Copied' : 'Copy Code'}</span>
              </button>
            </div>
            <pre
              data-testid="export-html-preview"
              className="p-3 text-[11px] font-mono overflow-x-auto max-h-52 leading-relaxed"
              style={{
                backgroundColor: isDarkTheme ? '#090A0B' : '#FAFAFA',
                color: isDarkTheme ? '#D4D4D8' : '#27272A',
              }}
            >
              <code>{htmlTailwindCode}</code>
            </pre>
          </div>

          {/* Zero-Backend Share Link */}
          <div
            className="flex items-center justify-between gap-3 px-3 py-2.5"
            style={{ border: `1px solid ${mutedBorder}` }}
          >
            <div className="min-w-0">
              <div className="text-xs font-semibold flex items-center gap-1.5">
                <Link2 className="w-3.5 h-3.5" />
                <span>Zero-Backend Shareable URL</span>
              </div>
              <p className="text-[11px] mt-0.5 truncate" style={{ color: subText }}>
                Encodes your exact artboard size, brand accent, layout tree & card copy into `#mosaika=...`.
              </p>
            </div>
            <button
              type="button"
              data-testid="btn-copy-share-modal"
              disabled={!sharePayload}
              onClick={() => void handleCopyShareLink()}
              className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium cursor-pointer disabled:opacity-40"
              style={{
                border: `1px solid ${borderCol}`,
                backgroundColor: copiedLink ? '#059669' : 'transparent',
                color: copiedLink ? '#FFFFFF' : panelFg,
              }}
            >
              {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Link2 className="w-3.5 h-3.5" />}
              <span>{copiedLink ? 'Link Copied' : 'Copy Link'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
