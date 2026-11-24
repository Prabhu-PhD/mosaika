import type { CSSProperties } from 'react';
import type { BentoDocumentState, HostCapabilities } from '@bento/contract';
import {
  computeMaxCount,
  computeSafeMaxGutter,
  DEFAULT_BENTO_PARAMS,
  MAX_GUTTER_PT,
  MAX_RADIUS_PT,
} from '@bento/core';
import { Info } from 'lucide-react';

export interface CoreSlidersProps {
  state: BentoDocumentState;
  capabilities: HostCapabilities;
  onChangeCount: (count: number) => void;
  onChangeGutter: (gutterPt: number) => void;
  onChangeRadius: (radiusPt: number) => void;
  onChangeHeroBias: (heroBias: number) => void;
  onCommitSlider: () => void;
}

function sliderPercentStyle(value: number, min: number, max: number): CSSProperties {
  const span = max - min;
  const pct = span > 0 ? Math.max(0, Math.min(100, ((value - min) / span) * 100)) : 0;
  return { '--slider-pct': `${pct.toFixed(1)}%` } as CSSProperties;
}

export function CoreSliders({
  state,
  capabilities,
  onChangeCount,
  onChangeGutter,
  onChangeRadius,
  onChangeHeroBias,
  onCommitSlider,
}: CoreSlidersProps) {
  const maxCount = Math.max(2, computeMaxCount(state.anchorRect, state.params.gutterPt));
  const safeMaxGutter = computeSafeMaxGutter(state.tree, state.anchorRect);
  const effectiveMaxGutter = Math.min(MAX_GUTTER_PT, safeMaxGutter);
  const radiusSupported = capabilities.supportsCornerRadius;

  const boxVal = Math.min(maxCount, Math.max(2, state.params.count));
  const gutterVal = Math.min(effectiveMaxGutter, Math.round(state.params.gutterPt));
  const radiusVal = Math.round(state.params.radiusPt);
  const heroPctVal = Math.round(state.params.heroBias * 100);

  const stepBoxes = (delta: number) => {
    const next = Math.max(2, Math.min(maxCount, boxVal + delta));
    if (next !== boxVal) {
      onChangeCount(next);
      onCommitSlider();
    }
  };

  return (
    <section
      className="space-y-2.5 border-b border-[var(--bento-border)] bg-[var(--bento-bg)] px-3 py-2.5"
      aria-label="Core Layout Controls"
    >
      {/* Boxes: InfoGen tactile − | N | + stepper paired with slim range scrubber */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[12px]">
          <div className="flex items-center gap-1.5">
            <label htmlFor="bento-slider-boxes" className="font-medium text-[var(--bento-fg)]">
              Boxes
            </label>
            {state.params.count >= 3 && state.params.count <= 6 && (
              <span
                data-testid="boxes-density-cue"
                title="3–6 cards is the optimal cognitive load for rapid slide scanning"
                className="rounded-[2px] border border-[var(--bento-border)] bg-[var(--bento-well)] px-1 font-mono text-[9.5px] text-[var(--bento-fg-muted)]"
              >
                Ideal
              </span>
            )}
            {state.params.count >= 9 && (
              <span
                data-testid="boxes-density-cue"
                title="9+ cards increases visual density; consider grouping or splitting across slides"
                className="rounded-[2px] border border-[var(--bento-warn-border)] bg-[var(--bento-warn-bg)] px-1 font-mono text-[9.5px] text-[var(--bento-warn-text)]"
              >
                Dense
              </span>
            )}
          </div>

          <div className="flex items-center" role="group" aria-label="Boxes stepper">
            <button
              type="button"
              aria-label="Fewer boxes"
              data-testid="stepper-boxes-minus"
              disabled={boxVal <= 2}
              onClick={() => stepBoxes(-1)}
              className="flex h-6 w-6 items-center justify-center rounded-l-[2px] border border-[var(--bento-border-strong)] bg-[var(--bento-bg)] text-[13px] text-[var(--bento-fg)] hover:bg-[var(--bento-well)] disabled:cursor-not-allowed disabled:opacity-35"
            >
              −
            </button>
            <button
              type="button"
              tabIndex={-1}
              title="Double-click to reset to default (5)"
              onDoubleClick={() => {
                onChangeCount(Math.min(maxCount, DEFAULT_BENTO_PARAMS.count));
                onCommitSlider();
              }}
              data-testid="readout-boxes"
              className="flex h-6 min-w-[30px] items-center justify-center border-y border-[var(--bento-border-strong)] bg-[var(--bento-bg)] px-1 font-mono text-[11.5px] font-semibold tabular-nums text-[var(--bento-fg)]"
            >
              {state.params.count}
            </button>
            <button
              type="button"
              aria-label="More boxes"
              data-testid="stepper-boxes-plus"
              disabled={boxVal >= maxCount}
              onClick={() => stepBoxes(1)}
              className="flex h-6 w-6 items-center justify-center rounded-r-[2px] border border-[var(--bento-border-strong)] bg-[var(--bento-bg)] text-[13px] text-[var(--bento-fg)] hover:bg-[var(--bento-well)] disabled:cursor-not-allowed disabled:opacity-35"
            >
              +
            </button>
          </div>
        </div>
        <input
          id="bento-slider-boxes"
          data-testid="slider-boxes"
          type="range"
          min={2}
          max={maxCount}
          step={1}
          value={boxVal}
          style={sliderPercentStyle(boxVal, 2, maxCount)}
          onChange={(e) => onChangeCount(Number(e.target.value))}
          onPointerUp={onCommitSlider}
          onKeyUp={onCommitSlider}
          className="bento-slider w-full"
        />
      </div>

      {/* Gutter */}
      <div className="space-y-0.5">
        <div className="flex items-center justify-between text-[12px]">
          <label htmlFor="bento-slider-gutter" className="font-medium text-[var(--bento-fg)]">
            Gutter
          </label>
          <button
            type="button"
            tabIndex={-1}
            title="Double-click to reset to default (10pt)"
            onDoubleClick={() => {
              onChangeGutter(Math.min(effectiveMaxGutter, DEFAULT_BENTO_PARAMS.gutterPt));
              onCommitSlider();
            }}
            data-testid="readout-gutter"
            className="rounded-[2px] px-1 font-mono text-[11.5px] font-semibold tabular-nums text-[var(--bento-fg)] hover:bg-[var(--bento-well)]"
          >
            {Math.round(state.params.gutterPt)}pt
          </button>
        </div>
        <input
          id="bento-slider-gutter"
          data-testid="slider-gutter"
          type="range"
          min={0}
          max={Math.max(0, effectiveMaxGutter)}
          step={1}
          value={gutterVal}
          style={sliderPercentStyle(gutterVal, 0, Math.max(1, effectiveMaxGutter))}
          onChange={(e) => onChangeGutter(Number(e.target.value))}
          onPointerUp={onCommitSlider}
          onKeyUp={onCommitSlider}
          disabled={effectiveMaxGutter === 0}
          title={
            effectiveMaxGutter < MAX_GUTTER_PT
              ? `Clamped at ${effectiveMaxGutter}pt to preserve minimum cell size`
              : 'Internal gap between cards'
          }
          className="bento-slider w-full disabled:opacity-40"
        />
      </div>

      {/* Corner Radius */}
      <div className="space-y-0.5">
        <div className="flex items-center justify-between text-[12px]">
          <div className="flex items-center gap-1.5">
            <label
              htmlFor="bento-slider-radius"
              className={`font-medium ${
                radiusSupported ? 'text-[var(--bento-fg)]' : 'text-[var(--bento-fg-muted)]'
              }`}
            >
              Radius
            </label>
            {!radiusSupported && (
              <span
                data-testid="radius-unsupported-badge"
                title="This PowerPoint version does not support programmatic corner radius (requires PowerPointApi 1.10+). Core layout remains active."
                className="inline-flex items-center gap-0.5 rounded-[2px] border border-[var(--bento-warn-border)] bg-[var(--bento-warn-bg)] px-1 py-0.5 text-[9.5px] font-semibold text-[var(--bento-warn-text)]"
              >
                <Info className="h-2.5 w-2.5" />
                <span>Unsupported</span>
              </span>
            )}
          </div>
          <button
            type="button"
            tabIndex={-1}
            disabled={!radiusSupported}
            title={
              radiusSupported
                ? 'Double-click to reset to default (12pt)'
                : 'Corner radius unavailable in this PowerPoint version'
            }
            onDoubleClick={() => {
              if (!radiusSupported) return;
              onChangeRadius(DEFAULT_BENTO_PARAMS.radiusPt);
              onCommitSlider();
            }}
            data-testid="readout-radius"
            className={`rounded-[2px] px-1 font-mono text-[11.5px] font-semibold tabular-nums ${
              radiusSupported
                ? 'text-[var(--bento-fg)] hover:bg-[var(--bento-well)]'
                : 'text-[var(--bento-fg-muted)]'
            }`}
          >
            {radiusSupported ? `${radiusVal}pt` : '—'}
          </button>
        </div>
        <input
          id="bento-slider-radius"
          data-testid="slider-radius"
          type="range"
          min={0}
          max={MAX_RADIUS_PT}
          step={1}
          value={radiusVal}
          style={radiusSupported ? sliderPercentStyle(radiusVal, 0, MAX_RADIUS_PT) : undefined}
          disabled={!radiusSupported}
          title={
            radiusSupported
              ? 'Uniform corner radius across all cards'
              : 'This PowerPoint version does not support Corner Radius. Core layout remains active.'
          }
          onChange={(e) => onChangeRadius(Number(e.target.value))}
          onPointerUp={onCommitSlider}
          onKeyUp={onCommitSlider}
          className="bento-slider w-full disabled:cursor-not-allowed disabled:opacity-35"
        />
      </div>

      {/* Hero Bias */}
      <div className="space-y-0.5">
        <div className="flex items-center justify-between text-[12px]">
          <label htmlFor="bento-slider-hero-bias" className="font-medium text-[var(--bento-fg)]">
            Hero Bias
          </label>
          <button
            type="button"
            tabIndex={-1}
            title="Double-click to reset to default (50%)"
            onDoubleClick={() => {
              onChangeHeroBias(DEFAULT_BENTO_PARAMS.heroBias);
              onCommitSlider();
            }}
            data-testid="readout-hero-bias"
            className="rounded-[2px] px-1 font-mono text-[11.5px] font-semibold tabular-nums text-[var(--bento-fg)] hover:bg-[var(--bento-well)]"
          >
            {heroPctVal}%
          </button>
        </div>
        <input
          id="bento-slider-hero-bias"
          data-testid="slider-hero-bias"
          type="range"
          min={0}
          max={100}
          step={5}
          value={heroPctVal}
          style={sliderPercentStyle(heroPctVal, 0, 100)}
          onChange={(e) => onChangeHeroBias(Number(e.target.value) / 100)}
          onPointerUp={onCommitSlider}
          onKeyUp={onCommitSlider}
          className="bento-slider w-full"
        />
      </div>
    </section>
  );
}
