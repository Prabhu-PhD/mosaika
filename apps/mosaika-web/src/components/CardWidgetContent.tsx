import { parseChecklistBlock, parseKpiBlock } from '../cardBlocks.js';
import type { StudioCard } from '../studioHost.js';
import type { FontPairingSpec } from '../visualCraft.js';
import {
  buildQrMatrix,
  computeSparklineGeometry,
  parseChartBlock,
  parseCodeBlock,
  parseProofBlock,
  parseQrBlock,
  parseQuoteBlock,
  resolveChartVariant,
  resolveMockupDevice,
} from '../widgets.js';

export interface CardWidgetContentProps {
  card: StudioCard;
  brandAccentHex: string;
  headlineSize: number;
  align: 'tl' | 'bl' | 'center' | 'split';
  fontSpec: FontPairingSpec;
}

export function CardWidgetContent({
  card,
  brandAccentHex,
  headlineSize,
  align,
  fontSpec,
}: CardWidgetContentProps) {
  const trimmed = card.text.trim();
  const blockType = card.blockType ?? 'text';
  const accentColor = card.role === 'hero' ? card.style.textColorHex : brandAccentHex;

  if (blockType === 'kpi' && trimmed.length > 0) {
    const kpi = parseKpiBlock(trimmed);
    const metricPx = Math.max(30, Math.min(64, Math.round(card.rect.width * 0.14)));
    return (
      <div className="flex flex-col justify-between flex-1 w-full">
        <div
          className={`flex items-center gap-2.5 flex-wrap ${
            align === 'center' ? 'justify-center' : 'justify-start'
          }`}
        >
          <span
            style={{
              fontFamily: fontSpec.headingFamily,
              fontSize: `${metricPx}px`,
              lineHeight: 1.02,
              fontWeight: 700,
              letterSpacing: '-0.035em',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {kpi.value}
          </span>
          {kpi.delta && (
            <span
              style={{
                fontSize: `${Math.max(11, Math.round(headlineSize * 0.58))}px`,
                fontWeight: 600,
                padding: '3px 9px',
                borderRadius: '9999px',
                border: '1px solid currentColor',
                opacity: 0.85,
              }}
            >
              {kpi.delta}
            </span>
          )}
        </div>
        {kpi.label && (
          <div
            style={{
              marginTop: '10px',
              fontSize: `${Math.max(13, Math.round(headlineSize * 0.72))}px`,
              fontWeight: 500,
              opacity: 0.78,
            }}
          >
            {kpi.label}
          </div>
        )}
      </div>
    );
  }

  if (blockType === 'checklist' && trimmed.length > 0) {
    const list = parseChecklistBlock(trimmed);
    const itemPx = Math.max(12, Math.round(headlineSize * 0.64));
    return (
      <div className="flex flex-col w-full">
        <div
          style={{
            fontFamily: fontSpec.headingFamily,
            fontSize: `${headlineSize}px`,
            lineHeight: 1.18,
            fontWeight: fontSpec.headingWeight,
            letterSpacing: fontSpec.letterSpacing,
          }}
        >
          {list.title}
        </div>
        <ul
          style={{
            marginTop: `${Math.max(8, Math.round(headlineSize * 0.42))}px`,
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            listStyle: 'none',
            padding: 0,
          }}
        >
          {list.items.map((item, idx) => (
            <li
              key={idx}
              style={{
                fontSize: `${itemPx}px`,
                lineHeight: 1.35,
                opacity: 0.84,
                display: 'flex',
                alignItems: 'baseline',
                gap: '8px',
              }}
            >
              <span style={{ fontWeight: 700, color: accentColor }}>✓</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (blockType === 'chart') {
    const chart = parseChartBlock(trimmed);
    const variant = resolveChartVariant(card.widgetVariant);
    const chartW = 260;
    const chartH = 92;

    if (variant === 'ring') {
      const rawPct = chart.values[chart.values.length - 1] ?? 78;
      const pct = Math.max(0, Math.min(100, rawPct));
      const radius = 36;
      const circ = 2 * Math.PI * radius;
      const dashOffset = circ * (1 - pct / 100);

      return (
        <div className="flex flex-col justify-between flex-1 w-full">
          <div className="flex items-center justify-between gap-2 w-full">
            <span
              style={{
                fontFamily: fontSpec.headingFamily,
                fontSize: `${headlineSize}px`,
                fontWeight: fontSpec.headingWeight,
                letterSpacing: fontSpec.letterSpacing,
              }}
            >
              {chart.title}
            </span>
            {chart.delta && (
              <span
                style={{
                  fontSize: `${Math.max(10, Math.round(headlineSize * 0.54))}px`,
                  fontWeight: 600,
                  opacity: 0.75,
                }}
              >
                {chart.delta}
              </span>
            )}
          </div>
          <div className="flex items-center justify-center flex-1 mt-2">
            <svg viewBox="0 0 96 96" className="w-24 h-24 max-h-full">
              <circle
                cx="48"
                cy="48"
                r={radius}
                fill="none"
                stroke="currentColor"
                strokeOpacity="0.14"
                strokeWidth="9"
              />
              <circle
                cx="48"
                cy="48"
                r={radius}
                fill="none"
                stroke={accentColor}
                strokeWidth="9"
                strokeLinecap="round"
                strokeDasharray={circ}
                strokeDashoffset={dashOffset}
                transform="rotate(-90 48 48)"
              />
              <text
                x="48"
                y="53"
                textAnchor="middle"
                fill="currentColor"
                fontSize="20"
                fontWeight="700"
                fontFamily="Inter, sans-serif"
              >
                {Math.round(pct)}%
              </text>
            </svg>
          </div>
        </div>
      );
    }

    if (variant === 'bars') {
      const maxVal = Math.max(1, ...chart.values);
      const peakIdx = chart.values.indexOf(maxVal);
      const barGap = 8;
      const barW = Math.max(8, (chartW - barGap * (chart.values.length - 1)) / chart.values.length);

      return (
        <div className="flex flex-col justify-between flex-1 w-full">
          <div className="flex items-baseline justify-between gap-2 w-full">
            <span
              style={{
                fontFamily: fontSpec.headingFamily,
                fontSize: `${headlineSize}px`,
                fontWeight: fontSpec.headingWeight,
                letterSpacing: fontSpec.letterSpacing,
              }}
            >
              {chart.title}
            </span>
            {chart.delta && (
              <span
                style={{
                  fontSize: `${Math.max(10, Math.round(headlineSize * 0.55))}px`,
                  fontWeight: 600,
                  color: accentColor,
                }}
              >
                {chart.delta}
              </span>
            )}
          </div>
          <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full flex-1 mt-3" preserveAspectRatio="none">
            {chart.values.map((val, i) => {
              const h = Math.max(8, (val / maxVal) * (chartH - 8));
              const x = i * (barW + barGap);
              const y = chartH - h;
              const isPeak = i === peakIdx;
              return (
                <rect
                  key={i}
                  x={x}
                  y={y}
                  width={barW}
                  height={h}
                  rx={4}
                  fill={isPeak ? accentColor : 'currentColor'}
                  fillOpacity={isPeak ? 0.95 : 0.22}
                />
              );
            })}
          </svg>
        </div>
      );
    }

    // Default: Smooth Area Sparkline
    const { linePath, areaPath, points } = computeSparklineGeometry(chart.values, chartW, chartH);
    const lastPt = points[points.length - 1]!;
    const areaGradId = `spark-area-${card.id}`;

    return (
      <div className="flex flex-col justify-between flex-1 w-full">
        <div className="flex items-baseline justify-between gap-2 w-full">
          <span
            style={{
              fontFamily: fontSpec.headingFamily,
              fontSize: `${headlineSize}px`,
              fontWeight: fontSpec.headingWeight,
              letterSpacing: fontSpec.letterSpacing,
            }}
          >
            {chart.title}
          </span>
          {chart.delta && (
            <span
              style={{
                fontSize: `${Math.max(10, Math.round(headlineSize * 0.55))}px`,
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: '9999px',
                backgroundColor: 'rgba(128,128,128,0.12)',
              }}
            >
              {chart.delta}
            </span>
          )}
        </div>
        <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full flex-1 mt-3 overflow-visible">
          <defs>
            <linearGradient id={areaGradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={accentColor} stopOpacity="0.34" />
              <stop offset="100%" stopColor={accentColor} stopOpacity="0.02" />
            </linearGradient>
          </defs>
          <path d={areaPath} fill={`url(#${areaGradId})`} />
          <path
            d={linePath}
            fill="none"
            stroke={accentColor}
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx={lastPt.x} cy={lastPt.y} r="5" fill={accentColor} stroke="#FFFFFF" strokeWidth="2" />
        </svg>
      </div>
    );
  }

  if (blockType === 'mockup') {
    const device = resolveMockupDevice(card.widgetVariant);
    const lines = trimmed.split(/\r?\n/);
    const title = lines[0] || 'Product Preview';
    const sub = lines.slice(1).join(' ');

    const ScreenFallback = (
      <div
        className="w-full h-full flex flex-col gap-2 p-3"
        style={{
          background: `linear-gradient(145deg, ${brandAccentHex}18 0%, rgba(255,255,255,0.92) 100%)`,
          color: '#18181B',
        }}
      >
        <div className="h-2.5 w-1/3 rounded-full" style={{ backgroundColor: brandAccentHex, opacity: 0.75 }} />
        <div className="grid grid-cols-2 gap-1.5 flex-1">
          <div className="rounded-lg bg-black/5 border border-black/5" />
          <div className="rounded-lg bg-black/5 border border-black/5" />
          <div className="col-span-2 rounded-lg border border-black/5" style={{ backgroundColor: `${brandAccentHex}18` }} />
        </div>
      </div>
    );

    return (
      <div className="flex flex-col justify-between flex-1 w-full h-full overflow-hidden">
        <div>
          <div
            style={{
              fontFamily: fontSpec.headingFamily,
              fontSize: `${headlineSize}px`,
              lineHeight: 1.15,
              fontWeight: fontSpec.headingWeight,
              letterSpacing: fontSpec.letterSpacing,
            }}
          >
            {title}
          </div>
          {sub && (
            <div
              style={{
                marginTop: '4px',
                fontSize: `${Math.max(11, Math.round(headlineSize * 0.55))}px`,
                opacity: 0.72,
                lineHeight: 1.35,
              }}
            >
              {sub}
            </div>
          )}
        </div>

        {/* Device Bezel bleeding gracefully off the bottom edge */}
        <div className="mt-3 flex-1 min-h-0 flex items-end justify-center w-full -mb-6">
          {device === 'iphone' ? (
            <div
              className="w-[74%] max-w-[240px] h-full min-h-[110px] rounded-t-[26px] p-[7px] pb-0 flex flex-col shadow-xl"
              style={{
                backgroundColor: '#18181B',
                border: '1px solid rgba(255,255,255,0.22)',
              }}
            >
              <div className="w-16 h-3.5 mx-auto mb-1.5 rounded-full bg-black" />
              <div className="flex-1 w-full rounded-t-[18px] overflow-hidden bg-white">
                {card.imageDataUrl ? (
                  <img
                    src={card.imageDataUrl}
                    alt=""
                    className="w-full h-full object-cover object-top"
                  />
                ) : (
                  ScreenFallback
                )}
              </div>
            </div>
          ) : device === 'macbook' ? (
            <div className="w-[92%] h-full min-h-[100px] flex flex-col items-center">
              <div
                className="w-[92%] flex-1 rounded-t-xl p-1.5 pb-0 flex flex-col shadow-lg"
                style={{ backgroundColor: '#18181B', border: '1px solid rgba(255,255,255,0.2)' }}
              >
                <div className="flex-1 w-full rounded-t-md overflow-hidden bg-white">
                  {card.imageDataUrl ? (
                    <img
                      src={card.imageDataUrl}
                      alt=""
                      className="w-full h-full object-cover object-top"
                    />
                  ) : (
                    ScreenFallback
                  )}
                </div>
              </div>
              <div className="w-full h-3 rounded-b-lg bg-zinc-400/80 border-t border-white/40" />
            </div>
          ) : (
            <div
              className="w-full h-full min-h-[100px] rounded-t-xl overflow-hidden flex flex-col shadow-lg"
              style={{
                backgroundColor: '#18181B',
                border: '1px solid rgba(255,255,255,0.16)',
              }}
            >
              <div className="h-6 px-2.5 flex items-center gap-1.5 bg-zinc-900/95 shrink-0">
                <span className="w-2 h-2 rounded-full bg-rose-400/90" />
                <span className="w-2 h-2 rounded-full bg-amber-400/90" />
                <span className="w-2 h-2 rounded-full bg-emerald-400/90" />
                <span className="ml-2 h-3 flex-1 max-w-[140px] rounded-full bg-white/10" />
              </div>
              <div className="flex-1 w-full bg-white overflow-hidden">
                {card.imageDataUrl ? (
                  <img
                    src={card.imageDataUrl}
                    alt=""
                    className="w-full h-full object-cover object-top"
                  />
                ) : (
                  ScreenFallback
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (blockType === 'code') {
    const code = parseCodeBlock(trimmed);
    const codePx = Math.max(11, Math.min(15, Math.round(headlineSize * 0.62)));
    return (
      <div className="flex flex-col justify-between flex-1 w-full h-full">
        <div
          style={{
            fontFamily: fontSpec.headingFamily,
            fontSize: `${headlineSize}px`,
            fontWeight: fontSpec.headingWeight,
            letterSpacing: fontSpec.letterSpacing,
          }}
        >
          {code.title}
        </div>
        <div
          className="mt-2.5 flex-1 rounded-xl p-3 flex flex-col gap-1.5 overflow-hidden"
          style={{
            backgroundColor: '#0D0F14',
            color: '#E4E4E7',
            border: '1px solid rgba(255,255,255,0.1)',
            fontFamily: "'JetBrains Mono', ui-monospace, monospace",
            fontSize: `${codePx}px`,
          }}
        >
          <div className="flex items-center gap-1.5 mb-1 opacity-80">
            <span className="w-2 h-2 rounded-full bg-rose-400" />
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
          </div>
          {code.lines.map((line, i) => {
            const isComment = line.trim().startsWith('//') || line.trim().startsWith('#');
            return (
              <div
                key={i}
                className="truncate leading-snug"
                style={{ color: isComment ? '#71717A' : '#E4E4E7' }}
              >
                {!isComment && <span style={{ color: '#60A5FA', marginRight: '6px' }}>$</span>}
                <span>{line}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (blockType === 'quote') {
    const q = parseQuoteBlock(trimmed);
    const qPx = Math.max(14, Math.min(26, Math.round(headlineSize * 0.92)));
    return (
      <div className="flex flex-col justify-between flex-1 w-full">
        <div
          style={{
            fontFamily: "'Instrument Serif', Georgia, serif",
            fontSize: `${Math.round(qPx * 2.1)}px`,
            lineHeight: 0.7,
            color: accentColor,
            opacity: 0.65,
          }}
        >
          “
        </div>
        <blockquote
          style={{
            fontFamily: "'Instrument Serif', Georgia, serif",
            fontSize: `${qPx}px`,
            lineHeight: 1.3,
            margin: '6px 0',
          }}
        >
          {q.quote}
        </blockquote>
        {q.author && (
          <div
            style={{
              marginTop: '6px',
              fontSize: `${Math.max(11, Math.round(headlineSize * 0.54))}px`,
              fontWeight: 600,
              opacity: 0.72,
            }}
          >
            — {q.author}
          </div>
        )}
      </div>
    );
  }

  if (blockType === 'proof') {
    const proof = parseProofBlock(trimmed);
    const avatarColors = ['#18181B', brandAccentHex, '#059669', '#D97706', '#52525B'];
    return (
      <div className="flex flex-col justify-between flex-1 w-full">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center -space-x-2.5">
            {proof.initials.map((init, idx) => (
              <span
                key={idx}
                className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-semibold text-white border-2 border-white shadow-sm"
                style={{ backgroundColor: avatarColors[idx % avatarColors.length] }}
              >
                {init}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-1.5 text-[12px] font-semibold">
            <span style={{ color: '#F59E0B', letterSpacing: '1px' }}>★★★★★</span>
            <span className="opacity-80">{proof.rating}</span>
          </div>
        </div>
        <div className="mt-3">
          <div
            style={{
              fontFamily: fontSpec.headingFamily,
              fontSize: `${headlineSize}px`,
              lineHeight: 1.15,
              fontWeight: fontSpec.headingWeight,
              letterSpacing: fontSpec.letterSpacing,
            }}
          >
            {proof.headline}
          </div>
          <div
            style={{
              marginTop: '4px',
              fontSize: `${Math.max(11, Math.round(headlineSize * 0.56))}px`,
              opacity: 0.76,
            }}
          >
            {proof.caption}
          </div>
        </div>
      </div>
    );
  }

  if (blockType === 'qr') {
    const qr = parseQrBlock(trimmed);
    const matrix = buildQrMatrix(qr.url);
    const n = matrix.length;
    const isWide = card.rect.width > card.rect.height * 1.25;

    return (
      <div
        className={`flex flex-1 w-full h-full gap-4 items-center ${
          isWide ? 'flex-row justify-between' : 'flex-col justify-center text-center'
        }`}
      >
        <div className="bg-white p-2.5 rounded-xl shadow-sm shrink-0 border border-black/5">
          <svg
            viewBox={`0 0 ${n} ${n}`}
            style={{
              width: `${Math.max(72, Math.min(132, Math.round(Math.min(card.rect.width, card.rect.height) * 0.48)))}px`,
              height: `${Math.max(72, Math.min(132, Math.round(Math.min(card.rect.width, card.rect.height) * 0.48)))}px`,
            }}
            shapeRendering="crispEdges"
          >
            {matrix.map((row, r) =>
              row.map((dark, c) =>
                dark ? <rect key={`${r}-${c}`} x={c} y={r} width={1} height={1} fill="#111216" /> : null
              )
            )}
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <div
            style={{
              fontFamily: fontSpec.headingFamily,
              fontSize: `${Math.max(14, Math.round(headlineSize * 0.85))}px`,
              fontWeight: fontSpec.headingWeight,
              lineHeight: 1.2,
            }}
          >
            {qr.caption}
          </div>
          <div
            className="mt-1 font-mono truncate opacity-65"
            style={{ fontSize: `${Math.max(10, Math.round(headlineSize * 0.46))}px` }}
          >
            {qr.url.replace(/^https?:\/\//, '')}
          </div>
        </div>
      </div>
    );
  }

  // Default: Text Block
  if (trimmed.length > 0) {
    const lines = card.text.split(/\r?\n/);
    const firstLine = lines[0] ?? '';
    const restLines = lines.slice(1).join('\n');
    return (
      <div className="w-full">
        <div
          style={{
            fontFamily: fontSpec.headingFamily,
            fontSize: `${headlineSize}px`,
            lineHeight: 1.15,
            fontWeight: fontSpec.headingWeight,
            letterSpacing: fontSpec.letterSpacing,
          }}
        >
          {firstLine}
        </div>
        {restLines && (
          <div
            style={{
              marginTop: `${Math.max(8, Math.round(headlineSize * 0.34))}px`,
              fontSize: `${Math.max(13, Math.round(headlineSize * 0.56))}px`,
              lineHeight: 1.5,
              opacity: 0.8,
              whiteSpace: 'pre-wrap',
            }}
          >
            {restLines}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className="uppercase tracking-wider font-mono"
      style={{
        fontSize: `${Math.max(10, Math.round(headlineSize * 0.45))}px`,
        opacity: 0.38,
      }}
    >
      {card.contentHint ?? card.shapeName}
    </div>
  );
}
