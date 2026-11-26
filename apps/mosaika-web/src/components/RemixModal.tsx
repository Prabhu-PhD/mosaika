import { useEffect, useMemo, useState } from 'react';
import { FileText, Sparkles, Wand2, X } from 'lucide-react';
import {
  parseNotesToBentoPlan,
  SAMPLE_NOTE_PROMPTS,
} from '../notesToBento.js';
import {
  STUDIO_SHOWCASES,
  type ShowcaseCategory,
  type StudioShowcase,
} from '../showcases.js';
import type { WebStudioHost } from '../studioHost.js';

interface RemixModalProps {
  open: boolean;
  host: WebStudioHost;
  isDarkTheme: boolean;
  onThemeSync: (isDark: boolean) => void;
  onClose: () => void;
  onToast: (message: string) => void;
}

const CATEGORIES: ReadonlyArray<'All' | ShowcaseCategory> = [
  'All',
  'Product',
  'Executive',
  'Social',
  'Dev',
  'Print',
];

function formatIntentLabel(intent: string): string {
  return intent
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function RemixModal({
  open,
  host,
  isDarkTheme,
  onThemeSync,
  onClose,
  onToast,
}: RemixModalProps) {
  const [tab, setTab] = useState<'showcases' | 'notes'>('showcases');
  const [category, setCategory] = useState<'All' | ShowcaseCategory>('All');
  const [notesText, setNotesText] = useState<string>(SAMPLE_NOTE_PROMPTS[0]!.markdown);

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

  const filteredShowcases = useMemo(() => {
    if (category === 'All') return STUDIO_SHOWCASES;
    return STUDIO_SHOWCASES.filter((s) => s.category === category);
  }, [category]);

  const liveNotesPlan = useMemo(() => parseNotesToBentoPlan(notesText), [notesText]);

  if (!open) return null;

  const surface = isDarkTheme ? '#131419' : '#FFFFFF';
  const well = isDarkTheme ? '#1B1D24' : '#F4F5F8';
  const border = isDarkTheme ? 'rgba(255,255,255,0.09)' : 'rgba(15,23,42,0.09)';
  const fg = isDarkTheme ? '#F4F4F5' : '#18181B';
  const muted = isDarkTheme ? '#9CA3AF' : '#64748B';
  const accentBg = isDarkTheme ? '#F4F4F5' : '#18181B';
  const accentFg = isDarkTheme ? '#111216' : '#FFFFFF';

  const handleApplyShowcase = (showcase: StudioShowcase) => {
    const { isDark } = host.applyShowcase(showcase);
    onThemeSync(isDark);
    onClose();
    onToast(`Loaded "${showcase.name}" showcase.`);
  };

  const handleGenerateFromNotes = () => {
    if (liveNotesPlan.cards.length === 0) return;
    const applied = host.applyNotesPlan(liveNotesPlan);
    if (applied) {
      onClose();
      onToast(`Generated ${liveNotesPlan.cards.length}-card bento from notes.`);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(9,10,13,0.48)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Remix Studio"
        data-testid="remix-modal"
        className="w-full max-w-[860px] max-h-[86vh] rounded-2xl flex flex-col overflow-hidden shadow-2xl"
        style={{
          backgroundColor: surface,
          color: fg,
          border: `1px solid ${border}`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Serene Modal Header */}
        <div
          className="px-5 py-4 flex items-center justify-between gap-4 shrink-0"
          style={{ borderBottom: `1px solid ${border}` }}
        >
          <div className="flex items-center gap-3">
            <span
              className="w-8 h-8 rounded-xl inline-flex items-center justify-center"
              style={{ backgroundColor: well }}
            >
              <Sparkles className="w-4 h-4" />
            </span>
            <div>
              <h2 className="text-[15px] font-semibold tracking-tight leading-tight">
                Remix Studio
              </h2>
              <p className="text-[11.5px]" style={{ color: muted }}>
                Start from a crafted showcase or paste raw notes to auto-compose a grid.
              </p>
            </div>
          </div>

          {/* 2-Tab Segmented Switch */}
          <div className="flex items-center gap-2">
            <div
              className="inline-flex items-center rounded-xl p-1"
              style={{ backgroundColor: well }}
            >
              <button
                type="button"
                data-testid="remix-tab-showcases"
                onClick={() => setTab('showcases')}
                className="h-7 px-3 rounded-lg text-[12px] font-medium inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                style={{
                  backgroundColor: tab === 'showcases' ? surface : 'transparent',
                  color: tab === 'showcases' ? fg : muted,
                  boxShadow: tab === 'showcases' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                }}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Showcases ({STUDIO_SHOWCASES.length})</span>
              </button>
              <button
                type="button"
                data-testid="remix-tab-notes"
                onClick={() => setTab('notes')}
                className="h-7 px-3 rounded-lg text-[12px] font-medium inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                style={{
                  backgroundColor: tab === 'notes' ? surface : 'transparent',
                  color: tab === 'notes' ? fg : muted,
                  boxShadow: tab === 'notes' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                }}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>From Notes</span>
              </button>
            </div>

            <button
              type="button"
              aria-label="Close Remix Studio"
              data-testid="btn-close-remix"
              onClick={onClose}
              className="w-8 h-8 rounded-lg inline-flex items-center justify-center cursor-pointer"
              style={{ backgroundColor: well, color: muted }}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        {tab === 'showcases' ? (
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            {/* Category Filter Pills */}
            <div className="px-5 pt-3.5 pb-2.5 flex items-center gap-1.5 flex-wrap shrink-0">
              {CATEGORIES.map((cat) => {
                const active = category === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    data-testid={`showcase-filter-${cat.toLowerCase()}`}
                    onClick={() => setCategory(cat)}
                    className="h-7 px-3 rounded-full text-[11.5px] font-medium cursor-pointer transition-colors"
                    style={{
                      backgroundColor: active ? accentBg : well,
                      color: active ? accentFg : muted,
                    }}
                  >
                    {cat}
                  </button>
                );
              })}
            </div>

            {/* 3-Column Showcase Gallery */}
            <div className="flex-1 overflow-y-auto px-5 pb-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredShowcases.map((sc) => {
                  const previewBg = sc.isDark
                    ? `linear-gradient(135deg, #111318 0%, ${sc.brandAccentHex}40 100%)`
                    : `linear-gradient(135deg, ${sc.brandAccentHex}18 0%, ${sc.brandAccentHex}08 100%)`;
                  return (
                    <button
                      key={sc.id}
                      type="button"
                      data-testid={`showcase-${sc.id}`}
                      onClick={() => handleApplyShowcase(sc)}
                      className="group text-left rounded-xl overflow-hidden flex flex-col cursor-pointer transition-transform hover:-translate-y-0.5"
                      style={{
                        backgroundColor: well,
                        border: `1px solid ${border}`,
                      }}
                    >
                      {/* Miniature Bento Mood Preview */}
                      <div
                        className="h-[74px] w-full p-2.5 flex flex-col justify-between relative overflow-hidden"
                        style={{ background: previewBg }}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider"
                            style={{
                              backgroundColor: sc.isDark
                                ? 'rgba(255,255,255,0.12)'
                                : 'rgba(255,255,255,0.85)',
                              color: sc.isDark ? '#F4F4F5' : '#18181B',
                            }}
                          >
                            {sc.category}
                          </span>
                          <span className="flex items-center gap-1">
                            <span
                              className="w-2.5 h-2.5 rounded-full"
                              style={{ backgroundColor: sc.brandAccentHex }}
                            />
                            <span
                              className="text-[10px] font-mono"
                              style={{ color: sc.isDark ? 'rgba(255,255,255,0.72)' : '#475569' }}
                            >
                              {sc.count} tiles
                            </span>
                          </span>
                        </div>

                        {/* Stylized Swiss Mini-Bento Silhouette */}
                        <div className="grid grid-cols-4 gap-1 h-7">
                          <div
                            className="col-span-2 rounded-md"
                            style={{ backgroundColor: sc.brandAccentHex, opacity: 0.92 }}
                          />
                          <div
                            className="col-span-1 rounded-md"
                            style={{
                              backgroundColor: sc.isDark
                                ? 'rgba(255,255,255,0.16)'
                                : 'rgba(255,255,255,0.88)',
                            }}
                          />
                          <div
                            className="col-span-1 rounded-md"
                            style={{
                              backgroundColor: sc.isDark
                                ? 'rgba(255,255,255,0.10)'
                                : 'rgba(255,255,255,0.72)',
                            }}
                          />
                        </div>
                      </div>

                      {/* Card Meta */}
                      <div className="p-3 flex flex-col gap-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[13px] font-semibold tracking-tight truncate">
                            {sc.name}
                          </span>
                          <span
                            className="text-[10.5px] font-medium opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                            style={{ color: sc.brandAccentHex }}
                          >
                            Use →
                          </span>
                        </div>
                        <span
                          className="text-[11px] leading-snug line-clamp-2"
                          style={{ color: muted }}
                        >
                          {sc.caption}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 min-h-0 flex flex-col p-5 gap-3.5 overflow-y-auto">
            {/* Quick Sample Chips */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <span className="text-[12px]" style={{ color: muted }}>
                Try a sample brief or paste your own Markdown, KPIs, bullets, code, quotes, or URL:
              </span>
              <div className="flex items-center gap-1.5 flex-wrap">
                {SAMPLE_NOTE_PROMPTS.map((sample, idx) => (
                  <button
                    key={sample.label}
                    type="button"
                    data-testid={`sample-note-${idx}`}
                    onClick={() => setNotesText(sample.markdown)}
                    className="h-7 px-2.5 rounded-full text-[11px] font-medium cursor-pointer transition-colors"
                    style={{
                      backgroundColor: well,
                      color: fg,
                      border: `1px solid ${border}`,
                    }}
                  >
                    {sample.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Distraction-free Notes Editor */}
            <textarea
              aria-label="Paste raw notes or markdown"
              data-testid="notes-markdown-input"
              rows={10}
              value={notesText}
              onChange={(e) => setNotesText(e.target.value)}
              placeholder={`# Product Launch\nConcise hero subtitle here.\n\n## $4.8M (+164% YoY)\nAnnual Recurring Revenue\n\n## Growth\n18, 28, 42, 65, 88`}
              className="w-full rounded-xl p-3.5 text-[12.5px] font-mono leading-relaxed outline-none resize-none"
              style={{
                backgroundColor: well,
                color: fg,
                border: `1px solid ${border}`,
              }}
            />

            {/* Live Heuristic Detection Footer + Generate CTA */}
            <div
              className="rounded-xl px-4 py-3 flex items-center justify-between gap-3 flex-wrap"
              style={{ backgroundColor: well, border: `1px solid ${border}` }}
            >
              <div className="flex flex-col gap-0.5 min-w-0">
                <span
                  data-testid="notes-plan-summary"
                  className="text-[12px] font-medium truncate"
                >
                  {liveNotesPlan.summary}
                </span>
                <span className="text-[11px]" style={{ color: muted }}>
                  Auto-selected intent:{' '}
                  <strong style={{ color: fg }}>
                    {formatIntentLabel(liveNotesPlan.intent)}
                  </strong>{' '}
                  · 100% local &amp; instant
                </span>
              </div>

              <button
                type="button"
                data-testid="btn-generate-from-notes"
                disabled={liveNotesPlan.cards.length === 0}
                onClick={handleGenerateFromNotes}
                className="h-9 px-4 rounded-xl text-[12.5px] font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-40 hover:opacity-90 shrink-0"
                style={{ backgroundColor: accentBg, color: accentFg }}
              >
                <Wand2 className="w-3.5 h-3.5" />
                <span>Generate Bento</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
