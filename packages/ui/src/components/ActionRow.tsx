import { useEffect, useState } from 'react';
import { formatSeedCode, parseSeedCode } from '@bento/core';
import { ArrowLeft, ArrowRight, Check, Copy, Shuffle } from 'lucide-react';

export interface ActionRowProps {
  count: number;
  seed: number;
  canSeedBack: boolean;
  canSeedForward: boolean;
  missingCount: number;
  onRandomize: () => void;
  onSeedBack: () => void;
  onSeedForward: () => void;
  onApplySeedCode: (count: number, seed: number) => void;
  onInvalidSeedCode: () => void;
  onReflowGaps: () => void;
}

export function ActionRow({
  count,
  seed,
  canSeedBack,
  canSeedForward,
  missingCount,
  onRandomize,
  onSeedBack,
  onSeedForward,
  onApplySeedCode,
  onInvalidSeedCode,
  onReflowGaps,
}: ActionRowProps) {
  const formatted = formatSeedCode(count, seed);
  const [draftCode, setDraftCode] = useState(formatted);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setDraftCode(formatted);
  }, [formatted]);

  const commitSeedCode = () => {
    const trimmed = draftCode.trim();
    if (trimmed.toUpperCase() === formatted.toUpperCase()) {
      setDraftCode(formatted);
      return;
    }
    const parsed = parseSeedCode(trimmed);
    if (!parsed) {
      setDraftCode(formatted);
      onInvalidSeedCode();
      return;
    }
    onApplySeedCode(parsed.count, parsed.seed);
  };

  const handleCopySeed = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(formatted).catch(() => undefined);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  const hasMissing = missingCount > 0;

  // InfoGen Warm Amber Alert Takeover when slide cards have been deleted (ig-alert-warn)
  if (hasMissing) {
    return (
      <footer
        role="alert"
        aria-label="Missing cards recovery"
        style={{
          background: 'var(--bento-warn-bg)',
          borderTop: '2px solid var(--bento-warn-border)',
          color: 'var(--bento-warn-text)',
        }}
        className="sticky bottom-0 z-10 flex shrink-0 flex-col gap-1.5 px-3 py-2.5"
      >
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[12px] font-semibold">
            {missingCount} {missingCount === 1 ? 'card' : 'cards'} removed from slide
          </span>
          <span className="font-mono text-[10.5px] opacity-80">{formatted}</span>
        </div>
        <button
          type="button"
          onClick={onReflowGaps}
          data-testid="btn-reflow-gaps"
          className="flex h-[32px] w-full items-center justify-center rounded-[2px] bg-[var(--bento-fg)] px-3 text-[12px] font-semibold text-[var(--bento-accent-fg)] transition-opacity hover:opacity-90"
        >
          Reflow Gaps ({missingCount} missing)
        </button>
      </footer>
    );
  }

  // InfoGen Sticky Footer anchored by 1px solid --bento-fg hairline
  return (
    <footer
      aria-label="Seed and Reflow Actions"
      className="sticky bottom-0 z-10 flex shrink-0 flex-col gap-1.5 border-t border-[var(--bento-fg)] bg-[var(--bento-bg)] px-3 py-2.5"
    >
      <div className="flex min-w-0 items-center gap-1">
        <button
          type="button"
          onClick={onRandomize}
          data-testid="btn-randomize"
          className="group flex h-[32px] min-w-0 flex-1 items-center justify-center gap-1 rounded-[2px] bg-[var(--bento-fg)] px-2 text-[11.5px] font-semibold text-[var(--bento-accent-fg)] transition-opacity hover:opacity-90"
        >
          <Shuffle className="h-3.5 w-3.5 shrink-0 transition-transform duration-150 group-active:rotate-45" />
          <span className="truncate">Randomize</span>
        </button>

        <div className="flex shrink-0 items-center">
          <button
            type="button"
            onClick={onSeedBack}
            disabled={!canSeedBack}
            title="Previous seed"
            aria-label="Previous seed"
            data-testid="btn-seed-back"
            className="flex h-[32px] w-[24px] items-center justify-center rounded-l-[2px] border border-[var(--bento-border-strong)] bg-[var(--bento-bg)] text-[var(--bento-fg)] hover:bg-[var(--bento-well)] disabled:opacity-35"
          >
            <ArrowLeft className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={onSeedForward}
            disabled={!canSeedForward}
            title="Next seed"
            aria-label="Next seed"
            data-testid="btn-seed-forward"
            className="flex h-[32px] w-[24px] items-center justify-center rounded-r-[2px] border border-l-0 border-[var(--bento-border-strong)] bg-[var(--bento-bg)] text-[var(--bento-fg)] hover:bg-[var(--bento-well)] disabled:opacity-35"
          >
            <ArrowRight className="h-3 w-3" />
          </button>
        </div>

        <div className="relative flex shrink-0 items-center">
          <input
            type="text"
            value={draftCode}
            onChange={(e) => setDraftCode(e.target.value)}
            onBlur={commitSeedCode}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.currentTarget.blur();
              }
            }}
            aria-label="Seed Code"
            title="Editable Seed Code (e.g. B5-48219)"
            data-testid="input-seed-code"
            className="h-[32px] w-[78px] rounded-[2px] border border-[var(--bento-border-strong)] bg-[var(--bento-bg)] pl-1.5 pr-5 font-mono text-[10.5px] font-medium tabular-nums text-[var(--bento-fg)] outline-none focus:border-[var(--bento-fg)]"
          />
          <button
            type="button"
            onClick={handleCopySeed}
            title={copied ? 'Copied!' : 'Copy seed code'}
            aria-label="Copy seed code"
            className="absolute right-0.5 flex h-5 w-5 items-center justify-center text-[var(--bento-fg-muted)] hover:text-[var(--bento-fg)]"
          >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={onReflowGaps}
        data-testid="btn-reflow-gaps"
        className="flex h-[26px] w-full items-center justify-center rounded-[2px] border border-[var(--bento-border-strong)] bg-[var(--bento-bg)] text-[11.5px] font-medium text-[var(--bento-fg)] transition-colors hover:bg-[var(--bento-well)]"
      >
        Reflow Gaps
      </button>
    </footer>
  );
}
