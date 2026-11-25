import { useState } from 'react';
import type { LayoutIntent } from '@bento/contract';
import { getIntentDefinition, LAYOUT_INTENTS } from '@bento/core';
import { ChevronDown, LayoutTemplate } from 'lucide-react';

function IntentGlyph({
  intent,
  active,
  large = false,
}: {
  intent: LayoutIntent;
  active: boolean;
  large?: boolean;
}) {
  const heroFill = active ? 'var(--bento-fg)' : 'var(--bento-fg)';
  const heroOpacity = active ? 0.92 : 0.72;
  const subFill = 'var(--bento-fg)';
  const subOpacity = active ? 0.22 : 0.16;
  const strokeColor = 'var(--bento-border-strong)';
  const sizeClass = large ? 'h-[40px] w-[68px]' : 'h-3.5 w-5 shrink-0';

  switch (intent) {
    case 'executive-brief':
      return (
        <svg viewBox="0 0 28 18" className={sizeClass} aria-hidden="true">
          <rect x="0.5" y="0.5" width="15" height="17" rx="1" fill={heroFill} opacity={heroOpacity} />
          <rect x="17.5" y="0.5" width="10" height="5" rx="0.8" fill={subFill} opacity={subOpacity} stroke={strokeColor} strokeWidth="0.4" />
          <rect x="17.5" y="6.5" width="10" height="5" rx="0.8" fill={subFill} opacity={subOpacity} stroke={strokeColor} strokeWidth="0.4" />
          <rect x="17.5" y="12.5" width="10" height="5" rx="0.8" fill={subFill} opacity={subOpacity} stroke={strokeColor} strokeWidth="0.4" />
        </svg>
      );
    case 'editorial-story':
      return (
        <svg viewBox="0 0 28 18" className={sizeClass} aria-hidden="true">
          <rect x="0.5" y="0.5" width="17.5" height="10.5" rx="0.5" fill={heroFill} opacity={heroOpacity} />
          <rect x="0.5" y="12.5" width="8" height="5" rx="0.5" fill={subFill} opacity={subOpacity} stroke={strokeColor} strokeWidth="0.4" />
          <rect x="10" y="12.5" width="8" height="5" rx="0.5" fill={subFill} opacity={subOpacity} stroke={strokeColor} strokeWidth="0.4" />
          <rect x="19.5" y="0.5" width="8" height="8" rx="0.5" fill={subFill} opacity={subOpacity} stroke={strokeColor} strokeWidth="0.4" />
          <rect x="19.5" y="10" width="8" height="7.5" rx="0.5" fill={subFill} opacity={subOpacity} stroke={strokeColor} strokeWidth="0.4" />
        </svg>
      );
    case 'kpi-dashboard':
      return (
        <svg viewBox="0 0 28 18" className={sizeClass} aria-hidden="true">
          <rect x="0.5" y="0.5" width="8" height="5.5" rx="0.8" fill={subFill} opacity={subOpacity} stroke={strokeColor} strokeWidth="0.4" />
          <rect x="10" y="0.5" width="8" height="5.5" rx="0.8" fill={subFill} opacity={subOpacity} stroke={strokeColor} strokeWidth="0.4" />
          <rect x="19.5" y="0.5" width="8" height="5.5" rx="0.8" fill={subFill} opacity={subOpacity} stroke={strokeColor} strokeWidth="0.4" />
          <rect x="0.5" y="7.5" width="17.5" height="10" rx="1" fill={heroFill} opacity={heroOpacity} />
          <rect x="19.5" y="7.5" width="8" height="10" rx="0.8" fill={subFill} opacity={subOpacity} stroke={strokeColor} strokeWidth="0.4" />
        </svg>
      );
    case 'product-showcase':
      return (
        <svg viewBox="0 0 28 18" className={sizeClass} aria-hidden="true">
          <rect x="0.5" y="0.5" width="6" height="8" rx="0.8" fill={subFill} opacity={subOpacity} stroke={strokeColor} strokeWidth="0.4" />
          <rect x="0.5" y="9.5" width="6" height="8" rx="0.8" fill={subFill} opacity={subOpacity} stroke={strokeColor} strokeWidth="0.4" />
          <rect x="8" y="0.5" width="12" height="17" rx="1" fill={heroFill} opacity={heroOpacity} />
          <rect x="21.5" y="0.5" width="6" height="8" rx="0.8" fill={subFill} opacity={subOpacity} stroke={strokeColor} strokeWidth="0.4" />
          <rect x="21.5" y="9.5" width="6" height="8" rx="0.8" fill={subFill} opacity={subOpacity} stroke={strokeColor} strokeWidth="0.4" />
        </svg>
      );
    case 'comparison':
      return (
        <svg viewBox="0 0 28 18" className={sizeClass} aria-hidden="true">
          <rect x="0.5" y="0.5" width="12.5" height="10" rx="0.8" fill={heroFill} opacity={heroOpacity * 0.8} />
          <rect x="0.5" y="12" width="12.5" height="5.5" rx="0.8" fill={subFill} opacity={subOpacity} stroke={strokeColor} strokeWidth="0.4" />
          <rect x="15" y="0.5" width="12.5" height="10" rx="0.8" fill={heroFill} opacity={heroOpacity * 0.8} />
          <rect x="15" y="12" width="12.5" height="5.5" rx="0.8" fill={subFill} opacity={subOpacity} stroke={strokeColor} strokeWidth="0.4" />
        </svg>
      );
    case 'matrix-grid':
      return (
        <svg viewBox="0 0 28 18" className={sizeClass} aria-hidden="true">
          <rect x="0.5" y="0.5" width="6.2" height="5.2" fill={subFill} opacity={subOpacity} stroke={strokeColor} strokeWidth="0.4" />
          <rect x="7.4" y="0.5" width="6.2" height="5.2" fill={subFill} opacity={subOpacity} stroke={strokeColor} strokeWidth="0.4" />
          <rect x="14.3" y="0.5" width="13.2" height="5.2" fill={subFill} opacity={subOpacity} stroke={strokeColor} strokeWidth="0.4" />
          <rect x="0.5" y="6.4" width="6.2" height="5.2" fill={subFill} opacity={subOpacity} stroke={strokeColor} strokeWidth="0.4" />
          <rect x="7.4" y="6.4" width="13.2" height="5.2" fill={heroFill} opacity={heroOpacity} />
          <rect x="21.3" y="6.4" width="6.2" height="5.2" fill={subFill} opacity={subOpacity} stroke={strokeColor} strokeWidth="0.4" />
          <rect x="0.5" y="12.3" width="13.2" height="5.2" fill={subFill} opacity={subOpacity} stroke={strokeColor} strokeWidth="0.4" />
          <rect x="14.3" y="12.3" width="6.2" height="5.2" fill={subFill} opacity={subOpacity} stroke={strokeColor} strokeWidth="0.4" />
          <rect x="21.3" y="12.3" width="6.2" height="5.2" fill={subFill} opacity={subOpacity} stroke={strokeColor} strokeWidth="0.4" />
        </svg>
      );
    case 'brand-collage':
      return (
        <svg viewBox="0 0 28 18" className={sizeClass} aria-hidden="true">
          <rect x="0.5" y="0.5" width="8" height="10.5" rx="0.8" fill={subFill} opacity={subOpacity} stroke={strokeColor} strokeWidth="0.4" />
          <rect x="0.5" y="12.3" width="8" height="5.2" rx="0.8" fill={subFill} opacity={subOpacity} stroke={strokeColor} strokeWidth="0.4" />
          <rect x="10" y="0.5" width="8" height="4.8" rx="0.8" fill={subFill} opacity={subOpacity} stroke={strokeColor} strokeWidth="0.4" />
          <rect x="10" y="6.6" width="8" height="5.2" rx="0.8" fill={heroFill} opacity={heroOpacity} />
          <rect x="10" y="13.1" width="8" height="4.4" rx="0.8" fill={subFill} opacity={subOpacity} stroke={strokeColor} strokeWidth="0.4" />
          <rect x="19.5" y="0.5" width="8" height="6.2" rx="0.8" fill={subFill} opacity={subOpacity} stroke={strokeColor} strokeWidth="0.4" />
          <rect x="19.5" y="8" width="8" height="9.5" rx="0.8" fill={subFill} opacity={subOpacity} stroke={strokeColor} strokeWidth="0.4" />
        </svg>
      );
    case 'creative':
      return (
        <svg viewBox="0 0 28 18" className={sizeClass} aria-hidden="true">
          <rect x="0.5" y="0.5" width="16.2" height="17" rx="1" fill={heroFill} opacity={heroOpacity} />
          <rect x="18.2" y="0.5" width="9.3" height="10" rx="0.8" fill={subFill} opacity={subOpacity} stroke={strokeColor} strokeWidth="0.4" />
          <rect x="18.2" y="12" width="5.2" height="5.5" rx="0.8" fill={subFill} opacity={subOpacity} stroke={strokeColor} strokeWidth="0.4" />
          <rect x="24.6" y="12" width="2.9" height="2.4" rx="0.5" fill={subFill} opacity={subOpacity} stroke={strokeColor} strokeWidth="0.4" />
          <rect x="24.6" y="15.2" width="2.9" height="2.3" rx="0.5" fill={subFill} opacity={subOpacity} stroke={strokeColor} strokeWidth="0.4" />
        </svg>
      );
    case 'experimental':
      return (
        <svg viewBox="0 0 28 18" className={sizeClass} aria-hidden="true">
          <rect x="0.5" y="0.5" width="3.5" height="17" fill={subFill} opacity={subOpacity} stroke={strokeColor} strokeWidth="0.4" />
          <rect x="5" y="0.5" width="13.2" height="11.4" fill={heroFill} opacity={heroOpacity} />
          <rect x="5" y="12.9" width="13.2" height="4.6" fill={subFill} opacity={subOpacity} stroke={strokeColor} strokeWidth="0.4" />
          <rect x="19.2" y="0.5" width="8.3" height="6.8" fill={subFill} opacity={subOpacity} stroke={strokeColor} strokeWidth="0.4" />
          <rect x="19.2" y="8.3" width="3.8" height="4.3" fill={subFill} opacity={subOpacity} stroke={strokeColor} strokeWidth="0.4" />
          <rect x="24" y="8.3" width="3.5" height="9.2" fill={subFill} opacity={subOpacity} stroke={strokeColor} strokeWidth="0.4" />
          <rect x="19.2" y="13.6" width="3.8" height="3.9" fill={subFill} opacity={subOpacity} stroke={strokeColor} strokeWidth="0.4" />
        </svg>
      );
    case 'sculpted':
      return (
        <svg viewBox="0 0 28 18" className={sizeClass} aria-hidden="true">
          <path d="M 6 0.5 H 9 A 5.5 5.5 0 0 1 14.5 6 V 17 A 0.5 0.5 0 0 1 14 17.5 H 1 A 0.5 0.5 0 0 1 0.5 17 V 6 A 5.5 5.5 0 0 1 6 0.5 Z" fill={heroFill} opacity={heroOpacity} />
          <rect x="16" y="0.5" width="11.5" height="5.4" rx="2.7" fill={subFill} opacity={subOpacity} stroke={strokeColor} strokeWidth="0.4" />
          <circle cx="19.4" cy="14" r="3.5" fill={subFill} opacity={subOpacity} stroke={strokeColor} strokeWidth="0.4" />
          <rect x="24" y="7.5" width="3.5" height="10" rx="1.75" fill={subFill} opacity={subOpacity} stroke={strokeColor} strokeWidth="0.4" />
          <rect x="16" y="7.5" width="6.8" height="2" rx="1" fill={subFill} opacity={subOpacity} stroke={strokeColor} strokeWidth="0.4" />
        </svg>
      );
    case 'puzzle':
      return (
        <svg viewBox="0 0 28 18" className={sizeClass} aria-hidden="true">
          <path d="M 1.5 0.5 H 12.2 V 5.2 A 4.4 4.4 0 0 0 9.4 8.2 H 0.5 V 1.5 A 1 1 0 0 1 1.5 0.5 Z" fill={subFill} opacity={subOpacity} stroke={strokeColor} strokeWidth="0.4" />
          <path d="M 15.8 0.5 H 26.5 A 1 1 0 0 1 27.5 1.5 V 8.2 H 18.6 A 4.4 4.4 0 0 0 15.8 5.2 Z" fill={subFill} opacity={subOpacity} stroke={strokeColor} strokeWidth="0.4" />
          <path d="M 0.5 9.8 H 9.4 A 4.4 4.4 0 0 0 12.2 12.8 V 17.5 H 1.5 A 1 1 0 0 1 0.5 16.5 Z" fill={subFill} opacity={subOpacity} stroke={strokeColor} strokeWidth="0.4" />
          <path d="M 18.6 9.8 H 27.5 V 16.5 A 1 1 0 0 1 26.5 17.5 H 15.8 V 12.8 A 4.4 4.4 0 0 0 18.6 9.8 Z" fill={subFill} opacity={subOpacity} stroke={strokeColor} strokeWidth="0.4" />
          <circle cx="14" cy="9" r="3.4" fill={heroFill} opacity={heroOpacity} />
        </svg>
      );
    case 'freeform':
      return (
        <svg viewBox="0 0 28 18" className={sizeClass} aria-hidden="true">
          <rect x="0.5" y="0.5" width="11" height="10" rx="0.8" fill={heroFill} opacity={heroOpacity} />
          <rect x="13" y="0.5" width="14.5" height="6" rx="0.8" fill={subFill} opacity={subOpacity} stroke={strokeColor} strokeWidth="0.4" />
          <rect x="13" y="8" width="6.5" height="9.5" rx="0.8" fill={subFill} opacity={subOpacity} stroke={strokeColor} strokeWidth="0.4" />
          <rect x="21" y="8" width="6.5" height="9.5" rx="0.8" fill={subFill} opacity={subOpacity} stroke={strokeColor} strokeWidth="0.4" />
          <rect x="0.5" y="12" width="11" height="5.5" rx="0.8" fill={subFill} opacity={subOpacity} stroke={strokeColor} strokeWidth="0.4" />
        </svg>
      );
  }
}

export interface IntentGridProps {
  value: LayoutIntent;
  onChange: (intent: LayoutIntent) => void;
  variant?: 'gallery' | 'compact';
}

export function IntentGrid({ value, onChange, variant = 'compact' }: IntentGridProps) {
  if (variant === 'gallery') {
    // InfoGen GalleryView card language: sharp 0px corners, recessed #F4F5F4 thumbnail well, crisp 1px rule
    return (
      <div
        className="grid grid-cols-2 gap-1.5"
        role="radiogroup"
        aria-label="Layout Intent"
        data-testid="intent-picker-grid"
      >
        {LAYOUT_INTENTS.map((item) => {
          const active = value === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="radio"
              aria-checked={active}
              data-testid={`intent-option-${item.id}`}
              title={item.description}
              onClick={() => onChange(item.id)}
              className={`flex flex-col items-start gap-1 border bg-[var(--bento-bg)] p-1.5 text-left transition-colors ${
                active
                  ? 'border-[var(--bento-fg)] shadow-[inset_0_0_0_1px_var(--bento-fg)]'
                  : 'border-[var(--bento-border)] hover:border-[var(--bento-border-strong)]'
              }`}
            >
              <div className="flex h-[54px] w-full items-center justify-center rounded-[2px] bg-[var(--bento-well)]">
                <IntentGlyph intent={item.id} active={active} large />
              </div>
              <div className="w-full min-w-0">
                <div className="truncate text-[11.5px] font-semibold leading-tight text-[var(--bento-fg)]">
                  {item.label}
                </div>
                <div className="truncate text-[10px] leading-tight text-[var(--bento-fg-muted)]">
                  {item.shortCaption} · {item.recommendedParams.count}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div
      className="grid grid-cols-2 gap-1"
      role="radiogroup"
      aria-label="Layout Intent"
      data-testid="intent-picker-grid"
    >
      {LAYOUT_INTENTS.map((item) => {
        const active = value === item.id;
        return (
          <button
            key={item.id}
            type="button"
            role="radio"
            aria-checked={active}
            data-testid={`intent-option-${item.id}`}
            title={item.description}
            onClick={() => onChange(item.id)}
            className={`flex items-center gap-2 border bg-[var(--bento-bg)] px-2 py-1.5 text-left transition-colors ${
              active
                ? 'border-[var(--bento-fg)] shadow-[inset_0_0_0_1px_var(--bento-fg)]'
                : 'border-[var(--bento-border)] hover:border-[var(--bento-border-strong)] hover:bg-[var(--bento-well)]'
            }`}
          >
            <IntentGlyph intent={item.id} active={active} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[11px] font-semibold leading-tight text-[var(--bento-fg)]">
                {item.label}
              </div>
              <div className="truncate text-[9.5px] leading-tight text-[var(--bento-fg-muted)]">
                {item.shortCaption}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

export interface IntentBarProps {
  value: LayoutIntent;
  styleMatchesIntent: boolean;
  isLibraryOpen?: boolean;
  onToggleLibrary?: () => void;
  onChangeIntent: (intent: LayoutIntent) => void;
  onMatchStyle: () => void;
}

export function IntentBar({
  value,
  styleMatchesIntent,
  isLibraryOpen = false,
  onToggleLibrary,
  onChangeIntent,
  onMatchStyle,
}: IntentBarProps) {
  const [open, setOpen] = useState(false);
  const current = getIntentDefinition(value);

  return (
    <section
      className="border-b border-[var(--bento-border)] bg-[var(--bento-bg)] px-3 py-1.5"
      aria-label="Active Layout Intent and Library"
    >
      <div className="flex min-w-0 items-center justify-between gap-1">
        {onToggleLibrary && (
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onToggleLibrary();
            }}
            aria-pressed={isLibraryOpen}
            title="Browse 144 curated Mosaika layouts"
            data-testid="btn-toggle-library"
            className={`flex h-[26px] shrink-0 items-center gap-1 rounded-[2px] border px-1.5 text-[10.5px] font-semibold transition-colors ${
              isLibraryOpen
                ? 'border-[var(--bento-fg)] bg-[var(--bento-fg)] text-[var(--bento-accent-fg)]'
                : 'border-[var(--bento-border-strong)] bg-[var(--bento-bg)] text-[var(--bento-fg)] hover:bg-[var(--bento-well)]'
            }`}
          >
            <LayoutTemplate className="h-3 w-3 shrink-0" />
            <span>Library</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => {
            if (isLibraryOpen && onToggleLibrary) {
              onToggleLibrary();
            }
            setOpen((v) => !v);
          }}
          data-testid="btn-toggle-intent-picker"
          aria-expanded={open && !isLibraryOpen}
          className="flex h-[26px] min-w-0 flex-1 items-center justify-between gap-1 rounded-[2px] border border-[var(--bento-border-strong)] bg-[var(--bento-bg)] px-1.5 text-left transition-colors hover:bg-[var(--bento-well)]"
        >
          <span className="flex min-w-0 items-center gap-1">
            <IntentGlyph intent={current.id} active />
            <span className="truncate text-[10.5px] font-semibold text-[var(--bento-fg)]">
              {current.label}
            </span>
          </span>
          <ChevronDown
            className={`h-3 w-3 shrink-0 text-[var(--bento-fg-muted)] transition-transform ${
              open && !isLibraryOpen ? 'rotate-180' : ''
            }`}
          />
        </button>

        {!isLibraryOpen && !styleMatchesIntent && (
          <button
            type="button"
            onClick={onMatchStyle}
            data-testid="btn-match-intent-style"
            title={`Apply ${current.label}'s recommended surface preset & hierarchy`}
            className="flex h-[26px] shrink-0 items-center rounded-[2px] border border-[var(--bento-fg)] bg-[var(--bento-bg)] px-1.5 text-[10px] font-semibold text-[var(--bento-fg)] transition-colors hover:bg-[var(--bento-fg)] hover:text-[var(--bento-accent-fg)]"
          >
            Match
          </button>
        )}
      </div>

      {open && !isLibraryOpen && (
        <div className="mt-2">
          <IntentGrid
            value={value}
            variant="compact"
            onChange={(nextIntent) => {
              onChangeIntent(nextIntent);
              setOpen(false);
            }}
          />
        </div>
      )}
    </section>
  );
}
