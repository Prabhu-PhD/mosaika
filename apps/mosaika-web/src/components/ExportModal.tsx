import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Code2,
  Copy,
  Download,
  FileCode,
  FileText,
  Film,
  Image as ImageIcon,
  Link2,
  Presentation,
  Sparkles,
  X,
} from 'lucide-react';
import {
  encodeSharePayload,
  exportDeckToPrintHtml,
  exportToHtmlTailwind,
  exportToPngBlob,
  exportToReactFramerMotion,
  exportToSvg,
  triggerFileDownload,
} from '../exporters.js';
import type { ShareableStudioPayload, StudioSnapshot, WebStudioHost } from '../studioHost.js';

export interface ExportModalProps {
  open: boolean;
  host: WebStudioHost;
  snapshot: StudioSnapshot;
  sharePayload: ShareableStudioPayload | null;
  isDarkTheme: boolean;
  onClose: () => void;
}

export function ExportModal({
  open,
  host,
  snapshot,
  sharePayload,
  isDarkTheme,
  onClose,
}: ExportModalProps) {
  const [activeTab, setActiveTab] = useState<'visual' | 'code'>('visual');
  const [codeFormat, setCodeFormat] = useState<'react' | 'html'>('react');
  const [pngScale, setPngScale] = useState<1 | 2 | 3>(2);
  const [exportingPng, setExportingPng] = useState(false);
  const [pngError, setPngError] = useState<string | null>(null);
  const [exportingPptx, setExportingPptx] = useState(false);
  const [pptxError, setPptxError] = useState<string | null>(null);
  const [exportingVideo, setExportingVideo] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const reactCode = useMemo(
    () => (open ? exportToReactFramerMotion(snapshot) : ''),
    [open, snapshot]
  );

  const htmlTailwindCode = useMemo(
    () => (open ? exportToHtmlTailwind(snapshot) : ''),
    [open, snapshot]
  );

  if (!open) return null;

  const slideCount = snapshot.slides.length;
  const baseFilename = `mosaika-${snapshot.canvasWidth}x${snapshot.canvasHeight}`;
  const activeCode = codeFormat === 'react' ? reactCode : htmlTailwindCode;

  const handleDownloadPptx = async () => {
    setExportingPptx(true);
    setPptxError(null);
    try {
      const { exportDeckToPptxBlob } = await import('../pptxExporter.js');
      const deckSnapshots = host.getAllSlideSnapshots();
      const blob = await exportDeckToPptxBlob(deckSnapshots);
      triggerFileDownload(
        blob,
        deckSnapshots.length > 1 ? `${baseFilename}-${deckSnapshots.length}slides.pptx` : `${baseFilename}.pptx`
      );
    } catch (err) {
      setPptxError(err instanceof Error ? err.message : 'PPTX export failed.');
    } finally {
      setExportingPptx(false);
    }
  };

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

  const handleDownloadVideo = async () => {
    setExportingVideo(true);
    setVideoProgress(0);
    setVideoError(null);
    try {
      const { exportDeckToWebmBlob } = await import('../videoExporter.js');
      const deckSnapshots = host.getAllSlideSnapshots();
      const blob = await exportDeckToWebmBlob(deckSnapshots, {
        fps: 60,
        slideDurationSec: 3.0,
        onProgress: (r) => setVideoProgress(Math.round(r * 100)),
      });
      triggerFileDownload(blob, `${baseFilename}-motion.webm`);
    } catch (err) {
      setVideoError(err instanceof Error ? err.message : 'Video export failed.');
    } finally {
      setExportingVideo(false);
    }
  };

  const handleDownloadPdfDeck = () => {
    const deckSnapshots = host.getAllSlideSnapshots();
    const html = exportDeckToPrintHtml(deckSnapshots);
    const printWin = window.open('', '_blank', 'noopener,noreferrer');
    if (printWin) {
      printWin.document.open();
      printWin.document.write(html);
      printWin.document.close();
      setTimeout(() => printWin.print(), 350);
    } else {
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      triggerFileDownload(blob, `${baseFilename}-print-deck.html`);
    }
  };

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(activeCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 1800);
    } catch {
      // Clipboard may be unavailable in restricted contexts
    }
  };

  const handleDownloadCode = () => {
    const ext = codeFormat === 'react' ? 'tsx' : 'html';
    const mime = codeFormat === 'react' ? 'text/plain;charset=utf-8' : 'text/html;charset=utf-8';
    const blob = new Blob([activeCode], { type: mime });
    triggerFileDownload(blob, codeFormat === 'react' ? 'MosaikaBento.tsx' : `${baseFilename}.${ext}`);
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

  const surface = isDarkTheme ? '#131419' : '#FFFFFF';
  const well = isDarkTheme ? '#1B1D24' : '#F4F5F8';
  const border = isDarkTheme ? 'rgba(255,255,255,0.09)' : 'rgba(15,23,42,0.09)';
  const fg = isDarkTheme ? '#F4F4F5' : '#18181B';
  const muted = isDarkTheme ? '#9CA3AF' : '#64748B';
  const primaryBg = isDarkTheme ? '#F4F4F5' : '#18181B';
  const primaryFg = isDarkTheme ? '#111216' : '#FFFFFF';

  return (
    <div
      data-testid="export-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(9,10,13,0.48)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Export Mosaika Layout"
        data-testid="export-modal"
        className="w-full max-w-[780px] rounded-2xl flex flex-col max-h-[88vh] overflow-hidden shadow-2xl"
        style={{
          backgroundColor: surface,
          color: fg,
          border: `1px solid ${border}`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Serene Modal Header */}
        <div
          className="flex items-center justify-between gap-4 px-5 py-4 shrink-0"
          style={{ borderBottom: `1px solid ${border}` }}
        >
          <div>
            <h2 className="text-[15px] font-semibold tracking-tight">Export Mosaika</h2>
            <p className="text-[11.5px] font-mono mt-0.5" style={{ color: muted }}>
              {snapshot.canvasWidth} × {snapshot.canvasHeight} px · {snapshot.cards.length} cards
              {slideCount > 1 ? ` · ${slideCount} slides` : ''}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* 2-Tab Switch: Visual | Code */}
            <div
              className="inline-flex items-center rounded-xl p-1"
              style={{ backgroundColor: well }}
            >
              <button
                type="button"
                data-testid="export-tab-visual"
                onClick={() => setActiveTab('visual')}
                className="h-7 px-3 rounded-lg text-[12px] font-medium inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                style={{
                  backgroundColor: activeTab === 'visual' ? surface : 'transparent',
                  color: activeTab === 'visual' ? fg : muted,
                  boxShadow: activeTab === 'visual' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                }}
              >
                <Download className="w-3.5 h-3.5" />
                <span>Visual &amp; Video</span>
              </button>
              <button
                type="button"
                data-testid="export-tab-code"
                onClick={() => setActiveTab('code')}
                className="h-7 px-3 rounded-lg text-[12px] font-medium inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                style={{
                  backgroundColor: activeTab === 'code' ? surface : 'transparent',
                  color: activeTab === 'code' ? fg : muted,
                  boxShadow: activeTab === 'code' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                }}
              >
                <Code2 className="w-3.5 h-3.5" />
                <span>React &amp; HTML</span>
              </button>
            </div>

            <button
              type="button"
              data-testid="export-modal-close"
              onClick={onClose}
              className="w-8 h-8 rounded-lg inline-flex items-center justify-center cursor-pointer"
              style={{ backgroundColor: well, color: muted }}
              aria-label="Close export modal"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 overflow-y-auto">
          {activeTab === 'visual' ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {/* PowerPoint (.pptx) */}
                <div
                  className="p-3.5 rounded-xl flex flex-col justify-between"
                  style={{ backgroundColor: well, border: `1px solid ${border}` }}
                >
                  <div>
                    <div className="flex items-center gap-2 text-[12.5px] font-semibold">
                      <Presentation className="w-3.5 h-3.5" />
                      <span>PowerPoint .pptx</span>
                    </div>
                    <p className="text-[11px] mt-1 leading-relaxed" style={{ color: muted }}>
                      {slideCount > 1
                        ? `Native editable ${slideCount}-slide PowerPoint deck with KPIs, charts & photos.`
                        : 'Editable native shapes, KPI metrics, checklists & embedded photos.'}
                    </p>
                    {pptxError && <p className="text-[11px] text-red-500 mt-1">{pptxError}</p>}
                  </div>
                  <button
                    type="button"
                    data-testid="btn-download-pptx"
                    disabled={exportingPptx}
                    onClick={() => void handleDownloadPptx()}
                    className="mt-3 w-full h-8 px-3 rounded-lg text-[12px] font-semibold flex items-center justify-center gap-1.5 cursor-pointer hover:opacity-90 disabled:opacity-50"
                    style={{ backgroundColor: primaryBg, color: primaryFg }}
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>
                      {exportingPptx
                        ? 'Building...'
                        : slideCount > 1
                          ? `Export ${slideCount} Slides`
                          : 'Download .pptx'}
                    </span>
                  </button>
                </div>

                {/* Motion Video (.webm) — Wave 4 #10 */}
                <div
                  className="p-3.5 rounded-xl flex flex-col justify-between"
                  style={{ backgroundColor: well, border: `1px solid ${border}` }}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-[12.5px] font-semibold">
                        <Film className="w-3.5 h-3.5" />
                        <span>Motion Video</span>
                      </div>
                      <span
                        className="px-1.5 py-0.5 rounded-full text-[9.5px] font-mono font-semibold"
                        style={{ backgroundColor: surface, color: muted }}
                      >
                        60fps .webm
                      </span>
                    </div>
                    <p className="text-[11px] mt-1 leading-relaxed" style={{ color: muted }}>
                      {slideCount > 1
                        ? `Looping ${slideCount}-slide animated reel for LinkedIn, X & launches.`
                        : 'Silky staggered entrance loop ready for LinkedIn, X & Product Hunt.'}
                    </p>
                    {videoError && <p className="text-[11px] text-red-500 mt-1">{videoError}</p>}
                  </div>
                  <button
                    type="button"
                    data-testid="btn-download-video"
                    disabled={exportingVideo}
                    onClick={() => void handleDownloadVideo()}
                    className="mt-3 w-full h-8 px-3 rounded-lg text-[12px] font-medium flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60"
                    style={{
                      backgroundColor: surface,
                      color: fg,
                      border: `1px solid ${border}`,
                    }}
                  >
                    <Film className="w-3.5 h-3.5" />
                    <span>
                      {exportingVideo ? `Recording ${videoProgress}%...` : 'Record .webm Loop'}
                    </span>
                  </button>
                </div>

                {/* Retina PNG */}
                <div
                  className="p-3.5 rounded-xl flex flex-col justify-between"
                  style={{ backgroundColor: well, border: `1px solid ${border}` }}
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-[12.5px] font-semibold">
                        <ImageIcon className="w-3.5 h-3.5" />
                        <span>Retina PNG</span>
                      </div>
                      <div
                        className="inline-flex rounded-md overflow-hidden text-[10px] font-mono"
                        style={{ border: `1px solid ${border}` }}
                      >
                        {([1, 2, 3] as const).map((s) => {
                          const active = pngScale === s;
                          return (
                            <button
                              key={s}
                              type="button"
                              onClick={() => setPngScale(s)}
                              className="px-1.5 py-0.5 cursor-pointer"
                              style={{
                                backgroundColor: active ? primaryBg : 'transparent',
                                color: active ? primaryFg : muted,
                              }}
                            >
                              {s}×
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <p className="text-[11px] mt-1 leading-relaxed" style={{ color: muted }}>
                      Crisp raster at {snapshot.canvasWidth * pngScale} ×{' '}
                      {snapshot.canvasHeight * pngScale} px.
                    </p>
                    {pngError && <p className="text-[11px] text-red-500 mt-1">{pngError}</p>}
                  </div>
                  <button
                    type="button"
                    data-testid="btn-download-png"
                    disabled={exportingPng}
                    onClick={() => void handleDownloadPng()}
                    className="mt-3 w-full h-8 px-3 rounded-lg text-[12px] font-medium flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                    style={{
                      backgroundColor: surface,
                      color: fg,
                      border: `1px solid ${border}`,
                    }}
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>{exportingPng ? 'Rendering...' : `Download @${pngScale}x .png`}</span>
                  </button>
                </div>

                {/* Vector SVG */}
                <div
                  className="p-3.5 rounded-xl flex flex-col justify-between"
                  style={{ backgroundColor: well, border: `1px solid ${border}` }}
                >
                  <div>
                    <div className="flex items-center gap-2 text-[12.5px] font-semibold">
                      <FileCode className="w-3.5 h-3.5" />
                      <span>Vector SVG</span>
                    </div>
                    <p className="text-[11px] mt-1 leading-relaxed" style={{ color: muted }}>
                      Pure vector primitives for Figma, Illustrator, or Framer.
                    </p>
                  </div>
                  <button
                    type="button"
                    data-testid="btn-download-svg"
                    onClick={handleDownloadSvg}
                    className="mt-3 w-full h-8 px-3 rounded-lg text-[12px] font-medium flex items-center justify-center gap-1.5 cursor-pointer"
                    style={{
                      backgroundColor: surface,
                      color: fg,
                      border: `1px solid ${border}`,
                    }}
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download .svg</span>
                  </button>
                </div>

                {/* Multi-Page Print / PDF Deck */}
                <div
                  className="p-3.5 rounded-xl flex flex-col justify-between sm:col-span-2"
                  style={{ backgroundColor: well, border: `1px solid ${border}` }}
                >
                  <div>
                    <div className="flex items-center gap-2 text-[12.5px] font-semibold">
                      <FileText className="w-3.5 h-3.5" />
                      <span>{slideCount > 1 ? `Multi-Slide PDF (${slideCount} Pages)` : 'Print-Ready Vector PDF'}</span>
                    </div>
                    <p className="text-[11px] mt-1 leading-relaxed" style={{ color: muted }}>
                      Opens an exact-sized vector print sheet ready for Save as PDF — ideal for LinkedIn document carousels &amp; executive handouts.
                    </p>
                  </div>
                  <button
                    type="button"
                    data-testid="btn-download-pdf"
                    onClick={handleDownloadPdfDeck}
                    className="mt-3 w-full sm:w-auto self-start h-8 px-3.5 rounded-lg text-[12px] font-medium inline-flex items-center justify-center gap-1.5 cursor-pointer"
                    style={{
                      backgroundColor: surface,
                      color: fg,
                      border: `1px solid ${border}`,
                    }}
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Print / Save as PDF</span>
                  </button>
                </div>
              </div>
            </>
          ) : (
            /* Code Tab: React + Framer Motion (.tsx) & Responsive HTML + Tailwind */
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div
                  className="inline-flex items-center rounded-xl p-1"
                  style={{ backgroundColor: well }}
                >
                  <button
                    type="button"
                    data-testid="code-format-react"
                    onClick={() => setCodeFormat('react')}
                    className="h-7 px-3 rounded-lg text-[11.5px] font-medium inline-flex items-center gap-1.5 cursor-pointer"
                    style={{
                      backgroundColor: codeFormat === 'react' ? surface : 'transparent',
                      color: codeFormat === 'react' ? fg : muted,
                      boxShadow: codeFormat === 'react' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                    }}
                  >
                    <Sparkles className="w-3 h-3" />
                    <span>React + Framer Motion (.tsx)</span>
                  </button>
                  <button
                    type="button"
                    data-testid="code-format-html"
                    onClick={() => setCodeFormat('html')}
                    className="h-7 px-3 rounded-lg text-[11.5px] font-medium inline-flex items-center gap-1.5 cursor-pointer"
                    style={{
                      backgroundColor: codeFormat === 'html' ? surface : 'transparent',
                      color: codeFormat === 'html' ? fg : muted,
                      boxShadow: codeFormat === 'html' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                    }}
                  >
                    <Code2 className="w-3 h-3" />
                    <span>Responsive HTML + Tailwind</span>
                  </button>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    data-testid="btn-download-code"
                    onClick={handleDownloadCode}
                    className="h-8 px-3 rounded-lg text-[11.5px] font-medium inline-flex items-center gap-1.5 cursor-pointer"
                    style={{ backgroundColor: well, color: fg, border: `1px solid ${border}` }}
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>{codeFormat === 'react' ? 'Download .tsx' : 'Download .html'}</span>
                  </button>
                  <button
                    type="button"
                    data-testid="btn-copy-code"
                    onClick={() => void handleCopyCode()}
                    className="h-8 px-3 rounded-lg text-[11.5px] font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                    style={{
                      backgroundColor: copiedCode ? '#059669' : primaryBg,
                      color: copiedCode ? '#FFFFFF' : primaryFg,
                    }}
                  >
                    {copiedCode ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedCode ? 'Copied' : 'Copy Code'}</span>
                  </button>
                </div>
              </div>

              <pre
                data-testid="export-code-preview"
                className="p-3.5 rounded-xl text-[11px] font-mono leading-relaxed overflow-auto max-h-[340px]"
                style={{
                  backgroundColor: isDarkTheme ? '#0A0B0F' : '#F8FAFC',
                  color: isDarkTheme ? '#E2E8F0' : '#0F172A',
                  border: `1px solid ${border}`,
                }}
              >
                <code>{activeCode}</code>
              </pre>
            </div>
          )}

          {/* Shareable Link Footer */}
          <div
            className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl"
            style={{ backgroundColor: well, border: `1px solid ${border}` }}
          >
            <div className="min-w-0">
              <p className="text-[12px] font-semibold">Zero-Backend Share Link</p>
              <p className="text-[11px] truncate" style={{ color: muted }}>
                Encodes your complete grid, widgets, backdrop &amp; Hover FX right in the URL hash.
              </p>
            </div>
            <button
              type="button"
              data-testid="btn-copy-share-link"
              onClick={() => void handleCopyShareLink()}
              className="h-8 px-3 rounded-lg text-[11.5px] font-semibold inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
              style={{
                backgroundColor: copiedLink ? '#059669' : surface,
                color: copiedLink ? '#FFFFFF' : fg,
                border: `1px solid ${border}`,
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
