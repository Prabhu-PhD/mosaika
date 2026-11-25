import { useRef, useState } from 'react';
import type {
  CellShapeKind,
  EntranceAnimationPreset,
  LayoutIntent,
  StylePresetId,
} from '@bento/contract';
import {
  CELL_SHAPE_KINDS,
  CELL_SHAPE_LABELS,
  ENTRANCE_ANIMATION_PRESETS,
  LAYOUT_INTENTS,
  STYLE_PRESETS,
} from '@bento/core';
import {
  AlignCenter,
  AlignLeft,
  ArrowDownLeft,
  ArrowUpDown,
  Columns2,
  ImagePlus,
  LayoutGrid,
  Lock,
  Play,
  RotateCcw,
  Rows2,
  Sparkles,
  Star,
  Trash2,
  Unlock,
  Upload,
  X,
} from 'lucide-react';
import {
  CARD_BLOCK_OPTIONS,
  CARD_PATTERN_OPTIONS,
  type CardBlockType,
  type CardPatternKind,
  type CardSurfaceTreatment,
  type ChartVariant,
  type MockupDeviceKind,
} from '../cardBlocks.js';
import { BRAND_ACCENT_SWATCHES } from '../presets.js';
import type { StudioCard, StudioSnapshot, WebStudioHost } from '../studioHost.js';
import {
  BACKDROP_OPTIONS,
  CARD_ICON_OPTIONS,
  extractBrandFromImageFile,
  FONT_PAIRINGS,
  type CardTextAlign,
} from '../visualCraft.js';
import { CardIcon } from './CardIcon.js';

export interface StudioInspectorProps {
  host: WebStudioHost;
  snapshot: StudioSnapshot;
  isDarkTheme: boolean;
  onOpenLibrary: () => void;
  onToast: (message: string) => void;
}

function readImageDataUrl(file: File): Promise<string | null> {
  if (!file.type.startsWith('image/')) return Promise.resolve(null);
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

const ALIGN_OPTIONS: ReadonlyArray<{ id: CardTextAlign; label: string; icon: typeof AlignLeft }> = [
  { id: 'tl', label: 'Top', icon: AlignLeft },
  { id: 'bl', label: 'Bottom', icon: ArrowDownLeft },
  { id: 'center', label: 'Center', icon: AlignCenter },
  { id: 'split', label: 'Split', icon: ArrowUpDown },
];

export function StudioInspector({
  host,
  snapshot,
  isDarkTheme,
  onOpenLibrary,
  onToast,
}: StudioInspectorProps) {
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const wallpaperInputRef = useRef<HTMLInputElement | null>(null);
  const cardPhotoInputRef = useRef<HTMLInputElement | null>(null);
  const [extractingLogo, setExtractingLogo] = useState(false);

  const selectedCard: StudioCard | null =
    snapshot.selectedCardIds.length === 1
      ? snapshot.cards.find((c) => c.id === snapshot.selectedCardIds[0]) ?? null
      : null;

  const mode: 'canvas' | 'card' = selectedCard ? 'card' : 'canvas';
  const doc = snapshot.activeDoc;

  const bg = isDarkTheme ? '#111216' : '#FFFFFF';
  const well = isDarkTheme ? '#181A20' : '#F6F7F9';
  const border = isDarkTheme ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)';
  const fg = isDarkTheme ? '#F4F4F5' : '#18181B';
  const muted = isDarkTheme ? '#9CA3AF' : '#64748B';
  const activeBg = isDarkTheme ? '#F4F4F5' : '#18181B';
  const activeFg = isDarkTheme ? '#111216' : '#FFFFFF';

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setExtractingLogo(true);
    try {
      const extracted = await extractBrandFromImageFile(file);
      if (extracted) {
        host.setBrandAccent(extracted.accentHex);
        onToast(`Extracted brand accent ${extracted.accentHex} from logo.`);
      } else {
        onToast('Could not read image colors from that file.');
      }
    } finally {
      setExtractingLogo(false);
    }
  };

  const handleWallpaperUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const dataUrl = await readImageDataUrl(file);
    if (dataUrl) {
      host.setBackdropImage(dataUrl);
      onToast('Applied custom photo backdrop with glass cards.');
    }
  };

  const handleCardPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !selectedCard) return;
    const dataUrl = await readImageDataUrl(file);
    if (dataUrl) {
      host.setCardImageDataUrl(selectedCard.id, dataUrl, true);
    }
  };

  return (
    <aside
      data-testid="studio-inspector"
      className="w-[296px] shrink-0 h-full flex flex-col overflow-hidden select-none"
      style={{
        backgroundColor: bg,
        color: fg,
        borderLeft: `1px solid ${border}`,
      }}
    >
      <input
        ref={logoInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => void handleLogoUpload(e)}
      />
      <input
        ref={wallpaperInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => void handleWallpaperUpload(e)}
      />
      <input
        ref={cardPhotoInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => void handleCardPhotoUpload(e)}
      />

      {/* Calm Contextual Mode Switcher (Canvas | Card) */}
      <div className="px-4 pt-3.5 pb-3 shrink-0" style={{ borderBottom: `1px solid ${border}` }}>
        <div
          className="grid grid-cols-2 p-1 rounded-lg text-[12px] font-medium"
          style={{ backgroundColor: well }}
        >
          <button
            type="button"
            data-testid="inspector-tab-canvas"
            onClick={() => host.selectCards([])}
            className="py-1.5 rounded-md transition-all cursor-pointer"
            style={{
              backgroundColor: mode === 'canvas' ? bg : 'transparent',
              color: mode === 'canvas' ? fg : muted,
              boxShadow: mode === 'canvas' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
            }}
          >
            Canvas
          </button>
          <button
            type="button"
            data-testid="inspector-tab-card"
            disabled={!selectedCard && snapshot.cards.length === 0}
            onClick={() => {
              if (!selectedCard && snapshot.cards[0]) {
                host.selectCards([snapshot.cards[0].id]);
              }
            }}
            className="py-1.5 rounded-md transition-all cursor-pointer disabled:opacity-40"
            style={{
              backgroundColor: mode === 'card' ? bg : 'transparent',
              color: mode === 'card' ? fg : muted,
              boxShadow: mode === 'card' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
            }}
          >
            {selectedCard ? `Card · ${selectedCard.slotId.replace('slot_', '#')}` : 'Card'}
          </button>
        </div>
      </div>

      {/* Scrollable Calm Body */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-6">
        {mode === 'canvas' ? (
          <>
            {/* Section 1: Layout */}
            <section className="space-y-3.5" aria-label="Layout settings">
              <div className="flex items-center justify-between">
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: muted }}>
                  Layout
                </h3>
                <button
                  type="button"
                  data-testid="btn-open-library-drawer"
                  onClick={onOpenLibrary}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11.5px] font-medium transition-colors cursor-pointer"
                  style={{ backgroundColor: well, color: fg }}
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span>Library</span>
                </button>
              </div>

              {doc ? (
                <>
                  {/* Intent Picker */}
                  <div className="space-y-1.5">
                    <label htmlFor="studio-intent-select" className="text-[12px] font-medium" style={{ color: muted }}>
                      Structure
                    </label>
                    <select
                      id="studio-intent-select"
                      data-testid="studio-intent-select"
                      value={doc.params.intent}
                      onChange={(e) => host.setIntent(e.target.value as LayoutIntent)}
                      className="w-full h-9 px-2.5 rounded-lg text-[12.5px] font-medium outline-none cursor-pointer"
                      style={{
                        backgroundColor: well,
                        color: fg,
                        border: `1px solid ${border}`,
                      }}
                    >
                      {LAYOUT_INTENTS.map((def) => (
                        <option key={def.id} value={def.id}>
                          {def.label} — {def.shortCaption}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Boxes Stepper */}
                  <div className="flex items-center justify-between">
                    <span className="text-[12.5px] font-medium">Cards</span>
                    <div
                      className="inline-flex items-center rounded-lg p-0.5"
                      style={{ backgroundColor: well, border: `1px solid ${border}` }}
                    >
                      <button
                        type="button"
                        data-testid="studio-boxes-minus"
                        disabled={doc.params.count <= 2}
                        onClick={() => host.setBoxCount(Math.max(2, doc.params.count - 1))}
                        className="w-7 h-7 rounded-md text-sm font-medium cursor-pointer disabled:opacity-35"
                      >
                        −
                      </button>
                      <span
                        data-testid="studio-boxes-value"
                        className="w-8 text-center font-mono text-[12px] font-semibold tabular-nums"
                      >
                        {snapshot.cards.length}
                      </span>
                      <button
                        type="button"
                        data-testid="studio-boxes-plus"
                        disabled={doc.params.count >= 12}
                        onClick={() => host.setBoxCount(Math.min(12, doc.params.count + 1))}
                        className="w-7 h-7 rounded-md text-sm font-medium cursor-pointer disabled:opacity-35"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  {/* Gutter Slider */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[12px]">
                      <span style={{ color: muted }}>Spacing</span>
                      <span className="font-mono text-[11.5px] tabular-nums">{Math.round(doc.params.gutterPt)}px</span>
                    </div>
                    <input
                      aria-label="Card spacing"
                      type="range"
                      min={0}
                      max={36}
                      step={1}
                      value={Math.round(doc.params.gutterPt)}
                      onChange={(e) => host.setGutter(Number(e.target.value), false)}
                      onPointerUp={(e) => host.setGutter(Number(e.currentTarget.value), true)}
                      className="studio-range w-full"
                      style={{ color: fg }}
                    />
                  </div>

                  {/* Corners + Squircle Pill */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-[12px]">
                      <span style={{ color: muted }}>Corners</span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11.5px] tabular-nums">
                          {Math.round(doc.params.radiusPt)}px
                        </span>
                        <button
                          type="button"
                          data-testid="btn-toggle-squircle"
                          onClick={() =>
                            host.setCornerStyle(
                              snapshot.cornerStyle === 'squircle' ? 'rounded' : 'squircle'
                            )
                          }
                          className="px-2 py-0.5 rounded-full text-[10.5px] font-medium transition-colors cursor-pointer"
                          style={{
                            backgroundColor:
                              snapshot.cornerStyle === 'squircle' ? activeBg : well,
                            color: snapshot.cornerStyle === 'squircle' ? activeFg : muted,
                          }}
                          title="Apple-style continuous superellipse corners"
                        >
                          Squircle
                        </button>
                      </div>
                    </div>
                    <input
                      aria-label="Corner radius"
                      type="range"
                      min={0}
                      max={32}
                      step={1}
                      value={Math.round(doc.params.radiusPt)}
                      onChange={(e) => host.setRadius(Number(e.target.value), false)}
                      onPointerUp={(e) => host.setRadius(Number(e.currentTarget.value), true)}
                      className="studio-range w-full"
                      style={{ color: fg }}
                    />
                  </div>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => host.resetToStarter()}
                  className="w-full py-2.5 rounded-lg text-[12.5px] font-semibold cursor-pointer"
                  style={{ backgroundColor: activeBg, color: activeFg }}
                >
                  Create Starter Bento
                </button>
              )}
            </section>

            <hr style={{ borderColor: border }} />

            {/* Section 2: Look (Backdrop, Grain, Accent + Logo Extractor, Typography, Surface Preset) */}
            <section className="space-y-4" aria-label="Look and visual craft">
              <div className="flex items-center justify-between">
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: muted }}>
                  Look
                </h3>
                <label className="inline-flex items-center gap-1.5 text-[11.5px] cursor-pointer" style={{ color: muted }}>
                  <input
                    type="checkbox"
                    data-testid="toggle-film-grain"
                    checked={snapshot.grainEnabled}
                    onChange={(e) => host.setGrainEnabled(e.target.checked)}
                    className="rounded accent-zinc-900 cursor-pointer"
                  />
                  <span>Film grain</span>
                </label>
              </div>

              {/* Artboard Backdrop */}
              <div className="space-y-1.5">
                <span className="text-[12px] font-medium" style={{ color: muted }}>
                  Backdrop
                </span>
                <div className="grid grid-cols-5 gap-1 p-1 rounded-lg" style={{ backgroundColor: well }}>
                  {BACKDROP_OPTIONS.map((opt) => {
                    const active = snapshot.backdrop === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        data-testid={`backdrop-${opt.id}`}
                        onClick={() => {
                          if (opt.id === 'photo' && !snapshot.backdropImageUrl) {
                            wallpaperInputRef.current?.click();
                          } else {
                            host.setBackdrop(opt.id);
                          }
                        }}
                        className="py-1.5 rounded-md text-[11px] font-medium transition-all cursor-pointer"
                        style={{
                          backgroundColor: active ? bg : 'transparent',
                          color: active ? fg : muted,
                          boxShadow: active ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                        }}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
                {snapshot.backdrop === 'photo' && (
                  <button
                    type="button"
                    onClick={() => wallpaperInputRef.current?.click()}
                    className="w-full py-1.5 rounded-lg text-[11.5px] font-medium flex items-center justify-center gap-1.5 cursor-pointer"
                    style={{ backgroundColor: well, color: fg }}
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Change Backdrop Photo</span>
                  </button>
                )}
              </div>

              {/* Brand Accent + Logo Extractor */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-medium" style={{ color: muted }}>
                    Brand Accent
                  </span>
                  <button
                    type="button"
                    data-testid="btn-extract-logo"
                    disabled={extractingLogo}
                    onClick={() => logoInputRef.current?.click()}
                    className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md cursor-pointer transition-opacity hover:opacity-80"
                    style={{ backgroundColor: well, color: fg }}
                    title="Upload any PNG/SVG logo to auto-extract its dominant brand color"
                  >
                    <Sparkles className="w-3 h-3" />
                    <span>{extractingLogo ? 'Reading...' : 'From Logo'}</span>
                  </button>
                </div>

                <div className="flex items-center justify-between gap-1.5">
                  <div className="flex items-center gap-2">
                    {BRAND_ACCENT_SWATCHES.map((swatch) => {
                      const active =
                        snapshot.brandAccentHex.toLowerCase() === swatch.hex.toLowerCase();
                      return (
                        <button
                          key={swatch.hex}
                          type="button"
                          title={`${swatch.label} (${swatch.hex})`}
                          data-testid={`accent-swatch-${swatch.label.toLowerCase()}`}
                          onClick={() => host.setBrandAccent(swatch.hex)}
                          className="w-6 h-6 rounded-full cursor-pointer transition-transform hover:scale-110"
                          style={{
                            backgroundColor: swatch.hex,
                            boxShadow: active
                              ? `0 0 0 2px ${bg}, 0 0 0 4px ${fg}`
                              : 'inset 0 0 0 1px rgba(0,0,0,0.14)',
                          }}
                        />
                      );
                    })}
                  </div>
                  <input
                    aria-label="Custom Brand Accent"
                    type="color"
                    value={snapshot.brandAccentHex}
                    onChange={(e) => host.setBrandAccent(e.target.value)}
                    className="w-6 h-6 rounded-full cursor-pointer bg-transparent border-0 p-0"
                    title="Pick any custom hex color"
                  />
                </div>
              </div>

              {/* Typography Pairings */}
              <div className="space-y-1.5">
                <span className="text-[12px] font-medium" style={{ color: muted }}>
                  Typography
                </span>
                <div className="grid grid-cols-2 gap-1.5">
                  {FONT_PAIRINGS.map((pair) => {
                    const active = snapshot.fontPairing === pair.id;
                    return (
                      <button
                        key={pair.id}
                        type="button"
                        data-testid={`font-pairing-${pair.id}`}
                        onClick={() => host.setFontPairing(pair.id)}
                        className="px-2.5 py-2 rounded-lg text-left transition-all cursor-pointer"
                        style={{
                          backgroundColor: active ? well : 'transparent',
                          border: `1px solid ${active ? fg : border}`,
                        }}
                      >
                        <div
                          className="text-[13px] leading-tight"
                          style={{
                            fontFamily: pair.headingFamily,
                            fontWeight: pair.headingWeight,
                          }}
                        >
                          {pair.label}
                        </div>
                        <div className="text-[10px] mt-0.5 truncate" style={{ color: muted }}>
                          {pair.caption}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Surface Preset */}
              {doc && (
                <div className="space-y-1.5">
                  <span className="text-[12px] font-medium" style={{ color: muted }}>
                    Card Theme
                  </span>
                  <div className="grid grid-cols-3 gap-1">
                    {STYLE_PRESETS.map((preset) => {
                      const active = doc.params.stylePreset === preset.id;
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          data-testid={`studio-preset-${preset.id}`}
                          onClick={() => host.setStylePreset(preset.id as StylePresetId)}
                          className="px-2 py-1.5 rounded-md text-[11px] font-medium truncate transition-all cursor-pointer"
                          style={{
                            backgroundColor: active ? activeBg : well,
                            color: active ? activeFg : fg,
                          }}
                        >
                          {preset.label.split(' ')[0]}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>

            <hr style={{ borderColor: border }} />

            {/* Section 3: Motion */}
            <section className="space-y-2.5" aria-label="Motion settings">
              <div className="flex items-center justify-between">
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: muted }}>
                  Motion
                </h3>
                {snapshot.activeAnimation && snapshot.activeAnimation.preset !== 'none' && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      data-testid="btn-motion-replay"
                      onClick={() => host.applyMotionPreset(snapshot.activeAnimation!.preset)}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium cursor-pointer"
                      style={{ backgroundColor: well, color: fg }}
                    >
                      <Play className="w-3 h-3" />
                      <span>Replay</span>
                    </button>
                    <button
                      type="button"
                      data-testid="btn-motion-clear"
                      onClick={() => host.applyMotionPreset('none')}
                      className="p-1 rounded-md cursor-pointer"
                      style={{ color: muted }}
                      title="Clear motion"
                    >
                      <RotateCcw className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                {ENTRANCE_ANIMATION_PRESETS.map((preset) => {
                  const active = snapshot.activeAnimation?.preset === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      data-testid={`motion-${preset.id}`}
                      onClick={() => host.applyMotionPreset(preset.id as EntranceAnimationPreset)}
                      className="px-2.5 py-2 rounded-lg text-left transition-all cursor-pointer"
                      style={{
                        backgroundColor: active ? activeBg : well,
                        color: active ? activeFg : fg,
                      }}
                    >
                      <div className="text-[11.5px] font-semibold">{preset.label}</div>
                      <div className="text-[10px] font-mono opacity-70 mt-0.5">
                        {preset.durationSec}s · +{Math.round(preset.staggerSec * 1000)}ms
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          </>
        ) : selectedCard ? (
          <>
            {/* CARD MODE — Calm, focused single-tile inspector */}
            <section className="space-y-3.5" aria-label="Card content">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: muted }}>
                Content
              </h3>

              {/* Clean Block Type Selector (9 Pro Bento Widgets — zero toolbar clutter) */}
              <div className="space-y-1.5">
                <label htmlFor="card-block-select" className="text-[11.5px] font-medium" style={{ color: muted }}>
                  Widget Type
                </label>
                <select
                  id="card-block-select"
                  data-testid="card-block-select"
                  value={selectedCard.blockType ?? 'text'}
                  onChange={(e) =>
                    host.setCardBlockType(selectedCard.id, e.target.value as CardBlockType)
                  }
                  className="w-full h-9 px-2.5 rounded-lg text-[12.5px] font-medium outline-none cursor-pointer"
                  style={{
                    backgroundColor: well,
                    color: fg,
                    border: `1px solid ${border}`,
                  }}
                >
                  {CARD_BLOCK_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Contextual Sub-Variant (ONLY appears for Chart or Device Mockup!) */}
              {selectedCard.blockType === 'chart' && (
                <div className="grid grid-cols-3 gap-1 p-1 rounded-lg" style={{ backgroundColor: well }}>
                  {(
                    [
                      ['sparkline', 'Sparkline'],
                      ['bars', 'Bars'],
                      ['ring', 'Ring'],
                    ] as ReadonlyArray<[ChartVariant, string]>
                  ).map(([v, label]) => {
                    const active = (selectedCard.widgetVariant ?? 'sparkline') === v;
                    return (
                      <button
                        key={v}
                        type="button"
                        data-testid={`chart-variant-${v}`}
                        onClick={() => host.setCardWidgetVariant(selectedCard.id, v)}
                        className="py-1.5 rounded-md text-[11px] font-medium cursor-pointer"
                        style={{
                          backgroundColor: active ? bg : 'transparent',
                          color: active ? fg : muted,
                          boxShadow: active ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                        }}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              )}

              {selectedCard.blockType === 'mockup' && (
                <div className="grid grid-cols-3 gap-1 p-1 rounded-lg" style={{ backgroundColor: well }}>
                  {(
                    [
                      ['iphone', 'iPhone'],
                      ['browser', 'Browser'],
                      ['macbook', 'MacBook'],
                    ] as ReadonlyArray<[MockupDeviceKind, string]>
                  ).map(([v, label]) => {
                    const active = (selectedCard.widgetVariant ?? 'iphone') === v;
                    return (
                      <button
                        key={v}
                        type="button"
                        data-testid={`mockup-device-${v}`}
                        onClick={() => host.setCardWidgetVariant(selectedCard.id, v)}
                        className="py-1.5 rounded-md text-[11px] font-medium cursor-pointer"
                        style={{
                          backgroundColor: active ? bg : 'transparent',
                          color: active ? fg : muted,
                          boxShadow: active ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                        }}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Eyebrow Kicker */}
              <div className="space-y-1">
                <label htmlFor="card-kicker-input" className="text-[11.5px] font-medium" style={{ color: muted }}>
                  Eyebrow Kicker
                </label>
                <input
                  id="card-kicker-input"
                  data-testid="card-kicker-input"
                  type="text"
                  value={selectedCard.kicker ?? ''}
                  onChange={(e) => host.setCardKicker(selectedCard.id, e.target.value)}
                  placeholder="e.g. 01 / OVERVIEW"
                  className="w-full h-8 px-2.5 rounded-lg text-[12px] outline-none"
                  style={{
                    backgroundColor: well,
                    color: fg,
                    border: `1px solid ${border}`,
                  }}
                />
              </div>

              {/* Icon Picker */}
              <div className="space-y-1.5">
                <span className="text-[11.5px] font-medium" style={{ color: muted }}>
                  Icon Badge
                </span>
                <div className="grid grid-cols-6 gap-1">
                  {CARD_ICON_OPTIONS.map((opt) => {
                    const active = (selectedCard.icon ?? 'none') === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        title={opt.label}
                        data-testid={`card-icon-${opt.id}`}
                        onClick={() => host.setCardIcon(selectedCard.id, opt.id)}
                        className="h-8 rounded-md flex items-center justify-center transition-all cursor-pointer"
                        style={{
                          backgroundColor: active ? activeBg : well,
                          color: active ? activeFg : muted,
                        }}
                      >
                        {opt.id === 'none' ? (
                          <X className="w-3.5 h-3.5" />
                        ) : (
                          <CardIcon icon={opt.id} size={14} />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Text Alignment */}
              <div className="space-y-1.5">
                <span className="text-[11.5px] font-medium" style={{ color: muted }}>
                  Alignment
                </span>
                <div className="grid grid-cols-4 gap-1 p-1 rounded-lg" style={{ backgroundColor: well }}>
                  {ALIGN_OPTIONS.map((opt) => {
                    const active = (selectedCard.textAlign ?? 'tl') === opt.id;
                    const Icon = opt.icon;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        data-testid={`card-align-${opt.id}`}
                        onClick={() => host.setCardTextAlign(selectedCard.id, opt.id)}
                        className="py-1.5 rounded-md flex flex-col items-center gap-0.5 text-[10px] font-medium cursor-pointer"
                        style={{
                          backgroundColor: active ? bg : 'transparent',
                          color: active ? fg : muted,
                          boxShadow: active ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                        }}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        <span>{opt.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>

            <hr style={{ borderColor: border }} />

            {/* Card Appearance */}
            <section className="space-y-3.5" aria-label="Card appearance">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: muted }}>
                Appearance
              </h3>

              {/* Surface Treatment */}
              <div className="grid grid-cols-4 gap-1 p-1 rounded-lg" style={{ backgroundColor: well }}>
                {(
                  [
                    ['solid', 'Flat'],
                    ['sheen', 'Sheen'],
                    ['mesh', 'Mesh'],
                    ['glass', 'Glass'],
                  ] as ReadonlyArray<[CardSurfaceTreatment, string]>
                ).map(([surf, label]) => {
                  const active = (selectedCard.surfaceTreatment ?? 'solid') === surf;
                  return (
                    <button
                      key={surf}
                      type="button"
                      data-testid={`card-surface-${surf}`}
                      onClick={() => host.setCardSurfaceTreatment(selectedCard.id, surf)}
                      className="py-1.5 rounded-md text-[11px] font-medium transition-all cursor-pointer"
                      style={{
                        backgroundColor: active ? bg : 'transparent',
                        color: active ? fg : muted,
                        boxShadow: active ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              {/* Procedural Card Pattern (#9) */}
              <div className="space-y-1.5">
                <span className="text-[11.5px] font-medium" style={{ color: muted }}>
                  Texture Pattern
                </span>
                <div className="grid grid-cols-5 gap-1 p-1 rounded-lg" style={{ backgroundColor: well }}>
                  {CARD_PATTERN_OPTIONS.map((opt) => {
                    const active = (selectedCard.pattern ?? 'none') === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        data-testid={`card-pattern-${opt.id}`}
                        onClick={() => host.setCardPattern(selectedCard.id, opt.id as CardPatternKind)}
                        className="py-1.5 rounded-md text-[10.5px] font-medium cursor-pointer"
                        style={{
                          backgroundColor: active ? bg : 'transparent',
                          color: active ? fg : muted,
                          boxShadow: active ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                        }}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Shape Kind */}
              <div className="space-y-1.5">
                <span className="text-[11.5px] font-medium" style={{ color: muted }}>
                  Contour
                </span>
                <div className="grid grid-cols-3 gap-1">
                  {CELL_SHAPE_KINDS.map((kind) => {
                    const active = (selectedCard.shapeKind ?? 'rect') === kind;
                    return (
                      <button
                        key={kind}
                        type="button"
                        data-testid={`card-shape-${kind}`}
                        onClick={() => host.setCardShape(selectedCard.id, kind as CellShapeKind)}
                        className="py-1.5 rounded-md text-[11px] font-medium transition-all cursor-pointer"
                        style={{
                          backgroundColor: active ? activeBg : well,
                          color: active ? activeFg : fg,
                        }}
                      >
                        {CELL_SHAPE_LABELS[kind]}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Photo Upload / Clear */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => cardPhotoInputRef.current?.click()}
                  className="flex-1 py-2 rounded-lg text-[11.5px] font-medium flex items-center justify-center gap-1.5 cursor-pointer"
                  style={{ backgroundColor: well, color: fg }}
                >
                  <ImagePlus className="w-3.5 h-3.5" />
                  <span>{selectedCard.imageDataUrl ? 'Replace Photo' : 'Add Photo (or Ctrl+V)'}</span>
                </button>
                {selectedCard.imageDataUrl && (
                  <button
                    type="button"
                    onClick={() => host.clearCardImage(selectedCard.id)}
                    className="p-2 rounded-lg cursor-pointer text-red-500"
                    style={{ backgroundColor: well }}
                    title="Remove photo"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </section>

            <hr style={{ borderColor: border }} />

            {/* Arrange */}
            <section className="space-y-2.5" aria-label="Card arrange">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: muted }}>
                Arrange
              </h3>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  data-testid="card-action-hero"
                  onClick={() => host.toggleCardHero(selectedCard.id)}
                  className="py-2 rounded-lg text-[11.5px] font-medium flex items-center justify-center gap-1.5 cursor-pointer"
                  style={{
                    backgroundColor: selectedCard.role === 'hero' ? activeBg : well,
                    color: selectedCard.role === 'hero' ? activeFg : fg,
                  }}
                >
                  <Star className="w-3.5 h-3.5" fill={selectedCard.role === 'hero' ? 'currentColor' : 'none'} />
                  <span>{selectedCard.role === 'hero' ? 'Hero Card' : 'Make Hero'}</span>
                </button>
                <button
                  type="button"
                  data-testid="card-action-lock"
                  onClick={() => host.toggleCardLock(selectedCard.id)}
                  className="py-2 rounded-lg text-[11.5px] font-medium flex items-center justify-center gap-1.5 cursor-pointer"
                  style={{
                    backgroundColor: selectedCard.locked ? '#FEF3C7' : well,
                    color: selectedCard.locked ? '#92400E' : fg,
                  }}
                >
                  {selectedCard.locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                  <span>{selectedCard.locked ? 'Locked' : 'Lock Size'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => host.splitCard(selectedCard.id, 'vertical')}
                  className="py-2 rounded-lg text-[11.5px] font-medium flex items-center justify-center gap-1.5 cursor-pointer"
                  style={{ backgroundColor: well, color: fg }}
                >
                  <Columns2 className="w-3.5 h-3.5" />
                  <span>Split Left/Right</span>
                </button>
                <button
                  type="button"
                  onClick={() => host.splitCard(selectedCard.id, 'horizontal')}
                  className="py-2 rounded-lg text-[11.5px] font-medium flex items-center justify-center gap-1.5 cursor-pointer"
                  style={{ backgroundColor: well, color: fg }}
                >
                  <Rows2 className="w-3.5 h-3.5" />
                  <span>Split Top/Bottom</span>
                </button>
              </div>
              <button
                type="button"
                data-testid="card-action-delete"
                onClick={() => host.deleteCardAndReflow(selectedCard.id)}
                className="w-full py-2 rounded-lg text-[11.5px] font-medium flex items-center justify-center gap-1.5 cursor-pointer text-red-500"
                style={{ backgroundColor: well }}
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Card & Reflow</span>
              </button>
              <p className="text-[11px] leading-relaxed" style={{ color: muted }}>
                Tip: Drag the move handle on any tile onto another card to swap their contents.
              </p>
            </section>
          </>
        ) : null}
      </div>
    </aside>
  );
}
