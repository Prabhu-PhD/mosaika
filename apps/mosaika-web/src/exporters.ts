import {
  buildCardCssBackground,
  computeGradientStops,
  parseChecklistBlock,
  parseKpiBlock,
} from './cardBlocks.js';
import type { ShareableStudioPayload, StudioCard, StudioSnapshot } from './studioHost.js';
import {
  buildSquirclePath,
  computeBackdropPalette,
  getFontPairing,
} from './visualCraft.js';
import {
  buildCardPatternDefString,
  buildQrMatrix,
  computeSparklineGeometry,
  parseChartBlock,
  parseCodeBlock,
  parseProofBlock,
  parseQrBlock,
  parseQuoteBlock,
  resolveChartVariant,
} from './widgets.js';

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function hexToRgba(hex: string, transparency: number): string {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return hex;
  const r = Number.parseInt(clean.slice(0, 2), 16);
  const g = Number.parseInt(clean.slice(2, 4), 16);
  const b = Number.parseInt(clean.slice(4, 6), 16);
  const alpha = Math.max(0, Math.min(1, 1 - transparency));
  return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`;
}

function computeNotchSafePadding(
  card: StudioCard,
  allCards: readonly StudioCard[],
  basePadX: number,
  basePadY: number
): { padLeft: number; padTop: number; padRight: number; padBottom: number } {
  let padLeft = basePadX;
  let padTop = basePadY;
  const padRight = basePadX;
  const padBottom = basePadY;

  if (!card.svgPath || card.shapeKind === 'circle') {
    return { padLeft, padTop, padRight, padBottom };
  }

  for (const other of allCards) {
    if (other.id === card.id) continue;
    // Check if `other` (e.g. a center-hub circle or L-wrap inset tile) intrudes into this card's top-left corner
    const ox1 = Math.max(card.rect.left, other.rect.left);
    const oy1 = Math.max(card.rect.top, other.rect.top);
    const ox2 = Math.min(card.rect.left + card.rect.width, other.rect.left + other.rect.width);
    const oy2 = Math.min(card.rect.top + card.rect.height, other.rect.top + other.rect.height);
    if (ox2 <= ox1 || oy2 <= oy1) continue;

    const intrudesTopLeft =
      ox1 <= card.rect.left + basePadX + 48 && oy1 <= card.rect.top + basePadY + 48;
    if (!intrudesTopLeft) continue;

    const clearRightX = ox2 - card.rect.left + 20;
    const clearBelowY = oy2 - card.rect.top + 18;
    const remainW = card.rect.width - clearRightX - padRight;
    const remainH = card.rect.height - clearBelowY - padBottom;

    if (remainW >= card.rect.width * 0.42) {
      padLeft = Math.max(padLeft, Math.round(clearRightX));
    } else if (remainH >= card.rect.height * 0.35) {
      padTop = Math.max(padTop, Math.round(clearBelowY));
    } else {
      padLeft = Math.max(padLeft, Math.round(clearRightX));
    }
  }

  return { padLeft, padTop, padRight, padBottom };
}

function wrapTextLines(text: string, maxCharsPerLine: number, maxLines: number): string[] {
  const result: string[] = [];
  const paragraphs = text.split(/\r?\n/);

  for (const para of paragraphs) {
    if (result.length >= maxLines) break;
    const words = para.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      result.push('');
      continue;
    }
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (candidate.length <= maxCharsPerLine) {
        line = candidate;
      } else {
        if (line) result.push(line);
        line = word;
        if (result.length >= maxLines) break;
      }
    }
    if (line && result.length < maxLines) {
      result.push(line);
    }
  }

  return result.slice(0, maxLines);
}

/**
 * Generates a completely self-contained, Figma/Illustrator-ready standalone SVG string.
 * Uses pure vector primitives (<rect>, <path>, <clipPath>, <image>, <text>/<tspan>) with
 * zero <foreignObject> so it opens cleanly in every design app and renders crisp Retina PNGs.
 */
export function exportToSvg(snapshot: StudioSnapshot): string {
  const { canvasWidth: w, canvasHeight: h, canvasBgHex, cards, backdrop, grainEnabled } = snapshot;
  const isDarkBg = canvasBgHex.toLowerCase() === '#0d0f0f' || canvasBgHex.toLowerCase() === '#090a0d';
  const palette = computeBackdropPalette(snapshot.brandAccentHex, isDarkBg);
  const fontSpec = getFontPairing(snapshot.fontPairing);

  const defs: string[] = [
    `<filter id="mosaika-shadow" x="-10%" y="-10%" width="120%" height="124%">` +
      `<feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#0F172A" flood-opacity="0.09"/>` +
      `</filter>`,
    `<linearGradient id="mosaika-scrim" x1="0" y1="0" x2="0" y2="1">` +
      `<stop offset="0%" stop-color="#000000" stop-opacity="0.08"/>` +
      `<stop offset="55%" stop-color="#000000" stop-opacity="0.22"/>` +
      `<stop offset="100%" stop-color="#000000" stop-opacity="0.72"/>` +
      `</linearGradient>`,
  ];

  const layers: string[] = [];

  if (backdrop === 'aurora') {
    defs.push(
      `<radialGradient id="bg-aurora-a" cx="18%" cy="18%" r="58%"><stop offset="0%" stop-color="${palette.blobA}" stop-opacity="0.48"/><stop offset="100%" stop-color="${palette.blobA}" stop-opacity="0"/></radialGradient>`,
      `<radialGradient id="bg-aurora-b" cx="84%" cy="24%" r="54%"><stop offset="0%" stop-color="${palette.blobB}" stop-opacity="0.44"/><stop offset="100%" stop-color="${palette.blobB}" stop-opacity="0"/></radialGradient>`,
      `<radialGradient id="bg-aurora-c" cx="55%" cy="88%" r="58%"><stop offset="0%" stop-color="${palette.blobC}" stop-opacity="0.42"/><stop offset="100%" stop-color="${palette.blobC}" stop-opacity="0"/></radialGradient>`
    );
    layers.push(
      `<rect x="0" y="0" width="${w}" height="${h}" fill="${palette.baseBg}"/>`,
      `<rect x="0" y="0" width="${w}" height="${h}" fill="url(#bg-aurora-a)"/>`,
      `<rect x="0" y="0" width="${w}" height="${h}" fill="url(#bg-aurora-b)"/>`,
      `<rect x="0" y="0" width="${w}" height="${h}" fill="url(#bg-aurora-c)"/>`
    );
  } else if (backdrop === 'dusk') {
    defs.push(
      `<linearGradient id="bg-dusk" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="${isDarkBg ? '#0B0F1A' : '#FDFBF7'}"/><stop offset="52%" stop-color="${isDarkBg ? '#131826' : '#F3F4F8'}"/><stop offset="100%" stop-color="${isDarkBg ? '#1C1628' : '#EBF0F9'}"/></linearGradient>`
    );
    layers.push(`<rect x="0" y="0" width="${w}" height="${h}" fill="url(#bg-dusk)"/>`);
  } else if (backdrop === 'dots') {
    defs.push(
      `<pattern id="bg-dots" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="12" cy="12" r="1.4" fill="${palette.dotColor}"/></pattern>`
    );
    layers.push(
      `<rect x="0" y="0" width="${w}" height="${h}" fill="${escapeXml(canvasBgHex)}"/>`,
      `<rect x="0" y="0" width="${w}" height="${h}" fill="url(#bg-dots)"/>`
    );
  } else if (backdrop === 'photo' && snapshot.backdropImageUrl) {
    layers.push(
      `<rect x="0" y="0" width="${w}" height="${h}" fill="#111216"/>`,
      `<image href="${escapeXml(snapshot.backdropImageUrl)}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice"/>`
    );
  } else {
    layers.push(`<rect x="0" y="0" width="${w}" height="${h}" fill="${escapeXml(canvasBgHex)}"/>`);
  }

  for (const card of cards) {
    const clipId = `clip-${card.slotId}`;
    const rx = +(card.cornerAdjustment * Math.min(card.rect.width, card.rect.height)).toFixed(2);
    const useSquircle =
      snapshot.cornerStyle === 'squircle' &&
      !card.svgPath &&
      card.shapeKind !== 'circle' &&
      card.shapeKind !== 'pill';
    const contourPath =
      card.svgPath ??
      (useSquircle ? buildSquirclePath(card.rect.width, card.rect.height, rx) : null);

    const isGlass = card.surfaceTreatment === 'glass' && !card.imageDataUrl;
    const hasGrad = Boolean(
      card.style.fillHex &&
        (card.surfaceTreatment === 'sheen' || card.surfaceTreatment === 'mesh')
    );
    const fill = isGlass
      ? isDarkBg
        ? 'rgba(20, 22, 29, 0.54)'
        : 'rgba(255, 255, 255, 0.68)'
      : hasGrad
        ? `url(#grad-${card.slotId})`
        : card.style.fillHex
          ? escapeXml(card.style.fillHex)
          : 'none';
    const stroke = isGlass
      ? isDarkBg
        ? 'rgba(255, 255, 255, 0.18)'
        : 'rgba(255, 255, 255, 0.90)'
      : card.style.borderColorHex && card.style.borderWeightPt > 0
        ? hexToRgba(card.style.borderColorHex, card.style.borderTransparency)
        : 'none';
    const strokeW = isGlass ? 1.25 : card.style.borderWeightPt;
    const dashAttr = card.style.borderDashed ? ` stroke-dasharray="6 4"` : '';
    const filterAttr = card.style.shadow ? ` filter="url(#mosaika-shadow)"` : '';

    if (hasGrad && card.style.fillHex) {
      const stops = computeGradientStops(card.style.fillHex);
      defs.push(
        `<linearGradient id="grad-${card.slotId}" x1="0%" y1="0%" x2="100%" y2="100%">` +
          `<stop offset="0%" stop-color="${stops.startHex}"/>` +
          `<stop offset="52%" stop-color="${stops.midHex}"/>` +
          `<stop offset="100%" stop-color="${stops.endHex}"/>` +
          `</linearGradient>`
      );
      if (card.surfaceTreatment === 'mesh') {
        defs.push(
          `<radialGradient id="mesh-${card.slotId}" cx="85%" cy="18%" r="62%">` +
            `<stop offset="0%" stop-color="${stops.glowHex}" stop-opacity="0.42"/>` +
            `<stop offset="100%" stop-color="${stops.glowHex}" stop-opacity="0"/>` +
            `</radialGradient>`
        );
      }
    }

    if (contourPath) {
      defs.push(
        `<clipPath id="${clipId}"><path d="${escapeXml(contourPath)}" transform="translate(${card.rect.left} ${card.rect.top})"/></clipPath>`
      );
    } else {
      defs.push(
        `<clipPath id="${clipId}"><rect x="${card.rect.left}" y="${card.rect.top}" width="${card.rect.width}" height="${card.rect.height}" rx="${rx}" ry="${rx}"/></clipPath>`
      );
    }

    const cardParts: string[] = [];
    if (contourPath) {
      cardParts.push(
        `<path d="${escapeXml(contourPath)}" transform="translate(${card.rect.left} ${card.rect.top})" fill="${fill}" stroke="${stroke}" stroke-width="${strokeW}"${dashAttr}${filterAttr}/>`
      );
    } else {
      cardParts.push(
        `<rect x="${card.rect.left}" y="${card.rect.top}" width="${card.rect.width}" height="${card.rect.height}" rx="${rx}" ry="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeW}"${dashAttr}${filterAttr}/>`
      );
    }

    if (hasGrad && card.surfaceTreatment === 'mesh') {
      cardParts.push(
        `<g clip-path="url(#${clipId})"><rect x="${card.rect.left}" y="${card.rect.top}" width="${card.rect.width}" height="${card.rect.height}" fill="url(#mesh-${card.slotId})"/></g>`
      );
    }

    if (card.pattern && card.pattern !== 'none') {
      const patId = `pat-${card.slotId}`;
      const patDef = buildCardPatternDefString(patId, card.pattern, card.style.textColorHex);
      if (patDef) {
        defs.push(patDef);
        cardParts.push(
          `<g clip-path="url(#${clipId})"><rect x="${card.rect.left}" y="${card.rect.top}" width="${card.rect.width}" height="${card.rect.height}" fill="url(#${patId})"/></g>`
        );
      }
    }

    if (card.imageDataUrl && card.blockType !== 'mockup') {
      cardParts.push(
        `<g clip-path="url(#${clipId})">` +
          `<image href="${escapeXml(card.imageDataUrl)}" x="${card.rect.left}" y="${card.rect.top}" width="${card.rect.width}" height="${card.rect.height}" preserveAspectRatio="xMidYMid slice"/>` +
          (card.hasScrim
            ? `<rect x="${card.rect.left}" y="${card.rect.top}" width="${card.rect.width}" height="${card.rect.height}" fill="url(#mosaika-scrim)"/>`
            : '') +
          `</g>`
      );
    }

    const content = card.text.trim();
    if (content.length > 0) {
      const fontSize = card.role === 'hero' ? Math.max(18, Math.min(34, Math.round(card.rect.width * 0.048))) : Math.max(14, Math.min(22, Math.round(card.rect.width * 0.045)));
      const basePadX = Math.max(18, Math.round(card.rect.width * 0.055));
      const basePadY = Math.max(20, Math.round(card.rect.height * 0.075));
      const { padLeft, padTop, padRight, padBottom } = computeNotchSafePadding(
        card,
        cards,
        basePadX,
        basePadY
      );
      const approxCharW = fontSize * 0.56;
      const maxChars = Math.max(10, Math.floor((card.rect.width - padLeft - padRight) / approxCharW));
      const maxLines = Math.max(1, Math.floor((card.rect.height - padTop - padBottom) / (fontSize * 1.35)));
      const lines = wrapTextLines(content, maxChars, maxLines);

      const isCircle = card.shapeKind === 'circle';
      const textX = isCircle ? card.rect.left + card.rect.width / 2 : card.rect.left + padLeft;
      const anchorAttr = isCircle ? ` text-anchor="middle"` : '';

      if (card.blockType === 'kpi') {
        const kpi = parseKpiBlock(content);
        const metricSize = Math.max(26, Math.min(58, Math.round(card.rect.width * 0.135)));
        const kpiY = card.rect.top + padTop + metricSize;
        const kpiTspans = [
          `<tspan x="${textX.toFixed(1)}" dy="0" font-size="${metricSize}" font-weight="700">${escapeXml(kpi.value)}</tspan>`,
          kpi.delta
            ? `<tspan dx="12" font-size="${Math.max(12, Math.round(fontSize * 0.65))}" font-weight="600" opacity="0.85">${escapeXml(kpi.delta)}</tspan>`
            : '',
          kpi.label
            ? `<tspan x="${textX.toFixed(1)}" dy="${Math.round(fontSize * 1.6)}" font-size="${Math.max(13, Math.round(fontSize * 0.78))}" font-weight="500" opacity="0.8">${escapeXml(kpi.label)}</tspan>`
            : '',
        ].join('');
        cardParts.push(
          `<g clip-path="url(#${clipId})">` +
            `<text x="${textX.toFixed(1)}" y="${kpiY.toFixed(1)}"${anchorAttr} fill="${escapeXml(card.style.textColorHex)}" font-family="Inter, -apple-system, 'Segoe UI', sans-serif">${kpiTspans}</text>` +
            `</g>`
        );
      } else if (card.blockType === 'checklist') {
        const list = parseChecklistBlock(content);
        const startY = card.rect.top + padTop + fontSize;
        const itemSize = Math.max(12, Math.round(fontSize * 0.72));
        const listTspans = [
          `<tspan x="${textX.toFixed(1)}" dy="0" font-size="${fontSize}" font-weight="600">${escapeXml(list.title)}</tspan>`,
          ...list.items.slice(0, Math.max(1, maxLines - 1)).map(
            (item) =>
              `<tspan x="${textX.toFixed(1)}" dy="${Math.round(itemSize * 1.55)}" font-size="${itemSize}" font-weight="400" opacity="0.86">✓  ${escapeXml(item)}</tspan>`
          ),
        ].join('');
        cardParts.push(
          `<g clip-path="url(#${clipId})">` +
            `<text x="${textX.toFixed(1)}" y="${startY.toFixed(1)}"${anchorAttr} fill="${escapeXml(card.style.textColorHex)}" font-family="Inter, -apple-system, 'Segoe UI', sans-serif">${listTspans}</text>` +
            `</g>`
        );
      } else if (card.blockType === 'chart') {
        const chart = parseChartBlock(content);
        const variant = resolveChartVariant(card.widgetVariant);
        const accent = card.role === 'hero' ? card.style.textColorHex : snapshot.brandAccentHex;
        const chartLeft = card.rect.left + padLeft;
        const chartTop = card.rect.top + padTop + fontSize + 18;
        const chartW = Math.max(60, card.rect.width - padLeft - padRight);
        const chartH = Math.max(44, card.rect.height - (chartTop - card.rect.top) - padBottom);
        let chartSvg = `<text x="${chartLeft.toFixed(1)}" y="${(card.rect.top + padTop + fontSize).toFixed(1)}" fill="${escapeXml(card.style.textColorHex)}" font-size="${fontSize}" font-weight="600" font-family="${escapeXml(fontSpec.headingFamily)}">${escapeXml(chart.title)}</text>`;
        if (variant === 'bars') {
          const maxVal = Math.max(1, ...chart.values);
          const peakIdx = chart.values.indexOf(maxVal);
          const gap = 8;
          const bw = Math.max(6, (chartW - gap * (chart.values.length - 1)) / chart.values.length);
          chartSvg += chart.values
            .map((val, i) => {
              const bh = Math.max(6, (val / maxVal) * chartH);
              const bx = chartLeft + i * (bw + gap);
              const by = chartTop + chartH - bh;
              return `<rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="4" fill="${i === peakIdx ? escapeXml(accent) : escapeXml(card.style.textColorHex)}" fill-opacity="${i === peakIdx ? '0.95' : '0.22'}"/>`;
            })
            .join('');
        } else if (variant === 'ring') {
          const pct = Math.max(0, Math.min(100, chart.values[chart.values.length - 1] ?? 78));
          const r = Math.min(chartW, chartH) * 0.42;
          const cx = card.rect.left + card.rect.width / 2;
          const cy = chartTop + chartH / 2;
          const circ = 2 * Math.PI * r;
          chartSvg +=
            `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}" fill="none" stroke="${escapeXml(card.style.textColorHex)}" stroke-opacity="0.15" stroke-width="8"/>` +
            `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}" fill="none" stroke="${escapeXml(accent)}" stroke-width="8" stroke-linecap="round" stroke-dasharray="${circ.toFixed(1)}" stroke-dashoffset="${(circ * (1 - pct / 100)).toFixed(1)}" transform="rotate(-90 ${cx.toFixed(1)} ${cy.toFixed(1)})"/>` +
            `<text x="${cx.toFixed(1)}" y="${(cy + 7).toFixed(1)}" text-anchor="middle" fill="${escapeXml(card.style.textColorHex)}" font-size="18" font-weight="700" font-family="Inter, sans-serif">${Math.round(pct)}%</text>`;
        } else {
          const { linePath, areaPath, points } = computeSparklineGeometry(chart.values, chartW, chartH);
          const last = points[points.length - 1]!;
          chartSvg +=
            `<g transform="translate(${chartLeft.toFixed(1)} ${chartTop.toFixed(1)})">` +
            `<path d="${areaPath}" fill="${escapeXml(accent)}" fill-opacity="0.16"/>` +
            `<path d="${linePath}" fill="none" stroke="${escapeXml(accent)}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>` +
            `<circle cx="${last.x}" cy="${last.y}" r="4.5" fill="${escapeXml(accent)}" stroke="#FFFFFF" stroke-width="2"/>` +
            `</g>`;
        }
        cardParts.push(`<g clip-path="url(#${clipId})">${chartSvg}</g>`);
      } else if (card.blockType === 'code') {
        const code = parseCodeBlock(content);
        const boxX = card.rect.left + padLeft;
        const boxY = card.rect.top + padTop + fontSize + 12;
        const boxW = Math.max(60, card.rect.width - padLeft - padRight);
        const boxH = Math.max(48, card.rect.height - (boxY - card.rect.top) - padBottom);
        const codeLines = code.lines
          .slice(0, 6)
          .map(
            (ln, i) =>
              `<tspan x="${(boxX + 14).toFixed(1)}" dy="${i === 0 ? 0 : 18}">$ ${escapeXml(ln)}</tspan>`
          )
          .join('');
        cardParts.push(
          `<g clip-path="url(#${clipId})">` +
            `<text x="${boxX.toFixed(1)}" y="${(card.rect.top + padTop + fontSize).toFixed(1)}" fill="${escapeXml(card.style.textColorHex)}" font-size="${fontSize}" font-weight="600" font-family="${escapeXml(fontSpec.headingFamily)}">${escapeXml(code.title)}</text>` +
            `<rect x="${boxX.toFixed(1)}" y="${boxY.toFixed(1)}" width="${boxW.toFixed(1)}" height="${boxH.toFixed(1)}" rx="10" fill="#0D0F14"/>` +
            `<circle cx="${(boxX + 14).toFixed(1)}" cy="${(boxY + 13).toFixed(1)}" r="3.5" fill="#FB7185"/>` +
            `<circle cx="${(boxX + 25).toFixed(1)}" cy="${(boxY + 13).toFixed(1)}" r="3.5" fill="#FBBF24"/>` +
            `<circle cx="${(boxX + 36).toFixed(1)}" cy="${(boxY + 13).toFixed(1)}" r="3.5" fill="#34D399"/>` +
            `<text x="${(boxX + 14).toFixed(1)}" y="${(boxY + 38).toFixed(1)}" fill="#E4E4E7" font-size="12" font-family="JetBrains Mono, monospace">${codeLines}</text>` +
            `</g>`
        );
      } else if (card.blockType === 'qr') {
        const qr = parseQrBlock(content);
        const matrix = buildQrMatrix(qr.url);
        const n = matrix.length;
        const qrBox = Math.max(64, Math.min(130, Math.round(Math.min(card.rect.width, card.rect.height) * 0.48)));
        const qrX = card.rect.left + padLeft;
        const qrY = card.rect.top + (card.rect.height - qrBox) / 2;
        const cellSz = (qrBox - 16) / n;
        const rects: string[] = [];
        for (let r = 0; r < n; r++) {
          for (let c = 0; c < n; c++) {
            if (matrix[r]![c]) {
              rects.push(
                `<rect x="${(qrX + 8 + c * cellSz).toFixed(2)}" y="${(qrY + 8 + r * cellSz).toFixed(2)}" width="${(cellSz + 0.1).toFixed(2)}" height="${(cellSz + 0.1).toFixed(2)}" fill="#111216"/>`
              );
            }
          }
        }
        cardParts.push(
          `<g clip-path="url(#${clipId})">` +
            `<rect x="${qrX.toFixed(1)}" y="${qrY.toFixed(1)}" width="${qrBox}" height="${qrBox}" rx="10" fill="#FFFFFF"/>` +
            rects.join('') +
            `<text x="${(qrX + qrBox + 18).toFixed(1)}" y="${(qrY + qrBox / 2).toFixed(1)}" fill="${escapeXml(card.style.textColorHex)}" font-size="${Math.max(14, Math.round(fontSize * 0.85))}" font-weight="600" font-family="${escapeXml(fontSpec.headingFamily)}">${escapeXml(qr.caption)}</text>` +
            `</g>`
        );
      } else if (card.blockType === 'quote') {
        const q = parseQuoteBlock(content);
        const qLines = wrapTextLines(`“${q.quote}”`, Math.max(12, maxChars), Math.max(2, maxLines - 1));
        const qTspans = [
          ...qLines.map(
            (l, i) =>
              `<tspan x="${textX.toFixed(1)}" dy="${i === 0 ? 0 : Math.round(fontSize * 1.35)}" font-size="${fontSize}" font-style="italic">${escapeXml(l)}</tspan>`
          ),
          q.author
            ? `<tspan x="${textX.toFixed(1)}" dy="${Math.round(fontSize * 1.6)}" font-size="${Math.max(12, Math.round(fontSize * 0.6))}" font-weight="600" opacity="0.72">— ${escapeXml(q.author)}</tspan>`
            : '',
        ].join('');
        cardParts.push(
          `<g clip-path="url(#${clipId})">` +
            `<text x="${textX.toFixed(1)}" y="${(card.rect.top + padTop + fontSize).toFixed(1)}" fill="${escapeXml(card.style.textColorHex)}" font-family="Instrument Serif, Georgia, serif">${qTspans}</text>` +
            `</g>`
        );
      } else if (card.blockType === 'proof') {
        const proof = parseProofBlock(content);
        cardParts.push(
          `<g clip-path="url(#${clipId})">` +
            `<text x="${textX.toFixed(1)}" y="${(card.rect.top + padTop + 18).toFixed(1)}" fill="#F59E0B" font-size="15">★★★★★</text>` +
            `<text x="${(textX + 92).toFixed(1)}" y="${(card.rect.top + padTop + 18).toFixed(1)}" fill="${escapeXml(card.style.textColorHex)}" font-size="13" font-weight="600">${escapeXml(proof.rating)}</text>` +
            `<text x="${textX.toFixed(1)}" y="${(card.rect.top + padTop + 56).toFixed(1)}" fill="${escapeXml(card.style.textColorHex)}" font-size="${fontSize}" font-weight="600" font-family="${escapeXml(fontSpec.headingFamily)}">${escapeXml(proof.headline)}</text>` +
            `<text x="${textX.toFixed(1)}" y="${(card.rect.top + padTop + 80).toFixed(1)}" fill="${escapeXml(card.style.textColorHex)}" font-size="13" opacity="0.78" font-family="Inter, sans-serif">${escapeXml(proof.caption)}</text>` +
            `</g>`
        );
      } else if (card.blockType === 'mockup') {
        const mLines = content.split(/\r?\n/);
        const devW = Math.min(card.rect.width * 0.72, 260);
        const devH = Math.max(80, card.rect.height * 0.56);
        const devX = card.rect.left + (card.rect.width - devW) / 2;
        const devY = card.rect.top + card.rect.height - devH + 16;
        cardParts.push(
          `<g clip-path="url(#${clipId})">` +
            `<text x="${textX.toFixed(1)}" y="${(card.rect.top + padTop + fontSize).toFixed(1)}" fill="${escapeXml(card.style.textColorHex)}" font-size="${fontSize}" font-weight="600" font-family="${escapeXml(fontSpec.headingFamily)}">${escapeXml(mLines[0] ?? 'Product Preview')}</text>` +
            `<rect x="${devX.toFixed(1)}" y="${devY.toFixed(1)}" width="${devW.toFixed(1)}" height="${devH.toFixed(1)}" rx="22" fill="#18181B" stroke="rgba(255,255,255,0.22)" stroke-width="1.5"/>` +
            `<rect x="${(devX + 7).toFixed(1)}" y="${(devY + 18).toFixed(1)}" width="${(devW - 14).toFixed(1)}" height="${(devH - 18).toFixed(1)}" rx="15" fill="#FFFFFF"/>` +
            (card.imageDataUrl
              ? `<image href="${escapeXml(card.imageDataUrl)}" x="${(devX + 7).toFixed(1)}" y="${(devY + 18).toFixed(1)}" width="${(devW - 14).toFixed(1)}" height="${(devH - 18).toFixed(1)}" preserveAspectRatio="xMidYMin slice"/>`
              : '') +
            `</g>`
        );
      } else {
        const startY = isCircle
          ? card.rect.top + card.rect.height / 2 - ((lines.length - 1) * fontSize * 1.3) / 2
          : card.rect.top + padTop + fontSize;

        const tspans = lines
          .map((line, i) => {
            const weight = i === 0 ? ' font-weight="600"' : ' font-weight="400" opacity="0.82"';
            const size = i === 0 ? fontSize : Math.max(13, Math.round(fontSize * 0.72));
            const dy = i === 0 ? 0 : Math.round(size * 1.45);
            return `<tspan x="${textX.toFixed(1)}" dy="${dy}" font-size="${size}"${weight}>${escapeXml(line)}</tspan>`;
          })
          .join('');

        cardParts.push(
          `<g clip-path="url(#${clipId})">` +
            `<text x="${textX.toFixed(1)}" y="${startY.toFixed(1)}"${anchorAttr} fill="${escapeXml(card.style.textColorHex)}" font-family="${escapeXml(fontSpec.headingFamily)}">${tspans}</text>` +
            `</g>`
        );
      }
    }

    layers.push(`<g id="${card.slotId}">${cardParts.join('')}</g>`);
  }

  if (grainEnabled) {
    defs.push(
      `<filter id="mosaika-grain"><feTurbulence type="fractalNoise" baseFrequency="0.78" numOctaves="3" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter>`
    );
    layers.push(
      `<rect x="0" y="0" width="${w}" height="${h}" filter="url(#mosaika-grain)" opacity="${isDarkBg ? '0.06' : '0.045'}"/>`
    );
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" fill="none">`,
    `  <defs>${defs.join('')}</defs>`,
    `  ${layers.join('\n  ')}`,
    `</svg>`,
  ].join('\n');
}

export interface ResponsiveGridSpan {
  cardId: string;
  slotId: string;
  colStart: number; // 1..12
  colSpan: number; // 1..12
  rowStart: number; // 1..12
  rowSpan: number; // 1..12
}

/**
 * Wave 4 (#13): Maps bounded artboard rectangles onto a clean 12-column × 6-row
 * responsive CSS Grid so desktop keeps Swiss proportions while mobile (<768px) stacks cleanly.
 */
export function computeResponsiveGridSpans(snapshot: StudioSnapshot): ResponsiveGridSpan[] {
  const { cards, canvasWidth, canvasHeight, canvasPadding } = snapshot;
  if (cards.length === 0) return [];

  const contentLeft = canvasPadding;
  const contentTop = canvasPadding;
  const contentW = Math.max(1, canvasWidth - canvasPadding * 2);
  const contentH = Math.max(1, canvasHeight - canvasPadding * 2);
  const totalCols = 12;
  const totalRows = 6;

  return cards.map((card) => {
    const x1 = Math.max(0, Math.min(1, (card.rect.left - contentLeft) / contentW));
    const x2 = Math.max(0, Math.min(1, (card.rect.left + card.rect.width - contentLeft) / contentW));
    const y1 = Math.max(0, Math.min(1, (card.rect.top - contentTop) / contentH));
    const y2 = Math.max(0, Math.min(1, (card.rect.top + card.rect.height - contentTop) / contentH));

    const colStart = Math.max(1, Math.min(totalCols, Math.round(x1 * totalCols) + 1));
    const colEnd = Math.max(colStart + 1, Math.min(totalCols + 1, Math.round(x2 * totalCols) + 1));
    const rowStart = Math.max(1, Math.min(totalRows, Math.round(y1 * totalRows) + 1));
    const rowEnd = Math.max(rowStart + 1, Math.min(totalRows + 1, Math.round(y2 * totalRows) + 1));

    return {
      cardId: card.id,
      slotId: card.slotId,
      colStart,
      colSpan: Math.max(1, colEnd - colStart),
      rowStart,
      rowSpan: Math.max(1, rowEnd - rowStart),
    };
  });
}

function escapeTsxString(input: string): string {
  return input
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r?\n/g, '\\n');
}

/**
 * Generates clean, responsive HTML + Tailwind CSS markup ready to paste into any web project.
 * Keeps exact Swiss proportions on desktop and auto-stacks gracefully below 768px.
 */
export function exportToHtmlTailwind(snapshot: StudioSnapshot): string {
  const { canvasWidth: w, canvasHeight: h, canvasBgHex, cards, activeAnimation, backdrop } = snapshot;
  const isDarkBg = canvasBgHex.toLowerCase() === '#0d0f0f' || canvasBgHex.toLowerCase() === '#090a0d';
  const palette = computeBackdropPalette(snapshot.brandAccentHex, isDarkBg);
  const fontSpec = getFontPairing(snapshot.fontPairing);
  const hasMotion = Boolean(activeAnimation && activeAnimation.preset !== 'none');
  const hoverClass =
    snapshot.hoverMode === 'lift'
      ? ' transition-transform duration-200 hover:-translate-y-1'
      : snapshot.hoverMode === 'tilt'
        ? ' transition-transform duration-200 hover:scale-[1.015] hover:-translate-y-0.5'
        : snapshot.hoverMode === 'spotlight'
          ? ' transition-shadow duration-200 hover:shadow-xl'
          : '';

  const sectionBgCss =
    backdrop === 'aurora'
      ? `background: radial-gradient(circle at 18% 18%, ${palette.blobA}77 0%, transparent 55%), radial-gradient(circle at 84% 24%, ${palette.blobB}70 0%, transparent 52%), radial-gradient(circle at 55% 88%, ${palette.blobC}66 0%, transparent 55%), ${palette.baseBg};`
      : backdrop === 'dusk'
        ? `background: linear-gradient(135deg, ${isDarkBg ? '#0B0F1A, #131826, #1C1628' : '#FDFBF7, #F3F4F8, #EBF0F9'});`
        : backdrop === 'dots'
          ? `background-color: ${canvasBgHex}; background-image: radial-gradient(${palette.dotColor} 1.4px, transparent 1.4px); background-size: 24px 24px;`
          : `background-color: ${canvasBgHex};`;

  const cardBlocks = cards.map((card: StudioCard) => {
    const leftPct = ((card.rect.left / w) * 100).toFixed(3);
    const topPct = ((card.rect.top / h) * 100).toFixed(3);
    const widthPct = ((card.rect.width / w) * 100).toFixed(3);
    const heightPct = ((card.rect.height / h) * 100).toFixed(3);
    const radiusPx = Math.round(card.cornerAdjustment * Math.min(card.rect.width, card.rect.height));

    const bgStyle = buildCardCssBackground(card.style.fillHex, card.surfaceTreatment, isDarkBg);
    const borderStyle =
      card.surfaceTreatment === 'glass'
        ? `border: 1px solid ${isDarkBg ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.88)'};`
        : card.style.borderColorHex && card.style.borderWeightPt > 0
          ? `border: ${card.style.borderWeightPt}px ${card.style.borderDashed ? 'dashed' : 'solid'} ${hexToRgba(card.style.borderColorHex, card.style.borderTransparency)};`
          : '';
    const shadowClass = card.style.shadow ? ' shadow-lg' : '';
    const radiusStyle =
      card.shapeKind === 'circle'
        ? 'border-radius: 9999px;'
        : card.shapeKind === 'pill'
          ? 'border-radius: 9999px;'
          : `border-radius: ${radiusPx}px;`;

    const align = card.shapeKind === 'circle' ? 'center' : (card.textAlign ?? 'tl');
    const alignClass =
      align === 'center'
        ? 'items-center justify-center text-center'
        : align === 'bl'
          ? 'justify-end'
          : align === 'split'
            ? 'justify-between'
            : 'justify-start';

    const orderIdx = activeAnimation ? activeAnimation.orderedSlotIds.indexOf(card.slotId) : -1;
    const motionStyle =
      hasMotion && activeAnimation && orderIdx >= 0
        ? ` animation: mosaika-enter ${activeAnimation.durationSec}s cubic-bezier(0.22, 1, 0.36, 1) ${(orderIdx * activeAnimation.staggerSec).toFixed(2)}s both;`
        : '';

    const kickerLine = card.kicker?.trim()
      ? `    <span class="text-[10px] font-semibold uppercase tracking-widest opacity-70 mb-1.5">${escapeXml(card.kicker.trim())}</span>`
      : null;

    let innerHtml: string[];
    if (card.blockType === 'kpi') {
      const kpi = parseKpiBlock(card.text.trim() || card.contentHint || '');
      innerHtml = [
        kickerLine,
        `    <div class="flex items-center gap-2">`,
        `      <span class="text-4xl font-bold tracking-tight tabular-nums">${escapeXml(kpi.value)}</span>`,
        kpi.delta
          ? `      <span class="text-xs font-semibold px-2 py-0.5 rounded-full border border-current opacity-85">${escapeXml(kpi.delta)}</span>`
          : null,
        `    </div>`,
        kpi.label ? `    <p class="mt-2 text-xs font-medium opacity-80">${escapeXml(kpi.label)}</p>` : null,
      ].filter((v): v is string => Boolean(v));
    } else if (card.blockType === 'checklist') {
      const list = parseChecklistBlock(card.text.trim() || card.contentHint || '');
      innerHtml = [
        kickerLine,
        `    <h3 class="text-sm font-semibold leading-tight">${escapeXml(list.title)}</h3>`,
        `    <ul class="mt-2 space-y-1 text-xs opacity-85">`,
        ...list.items.map((item) => `      <li>✓ ${escapeXml(item)}</li>`),
        `    </ul>`,
      ].filter((v): v is string => Boolean(v));
    } else if (card.blockType === 'chart') {
      const chart = parseChartBlock(card.text.trim());
      const { linePath } = computeSparklineGeometry(chart.values, 240, 72);
      innerHtml = [
        kickerLine,
        `    <div class="flex items-baseline justify-between gap-2">`,
        `      <h3 class="text-sm font-semibold">${escapeXml(chart.title)}</h3>`,
        chart.delta ? `      <span class="text-xs font-semibold opacity-75">${escapeXml(chart.delta)}</span>` : null,
        `    </div>`,
        `    <svg viewBox="0 0 240 72" class="w-full mt-3"><path d="${linePath}" fill="none" stroke="${snapshot.brandAccentHex}" stroke-width="3" stroke-linecap="round"/></svg>`,
      ].filter((v): v is string => Boolean(v));
    } else if (card.blockType === 'code') {
      const code = parseCodeBlock(card.text.trim());
      innerHtml = [
        kickerLine,
        `    <h3 class="text-sm font-semibold">${escapeXml(code.title)}</h3>`,
        `    <pre class="mt-2 rounded-xl bg-zinc-950 text-zinc-100 p-3 text-xs font-mono overflow-x-auto"><code>${escapeXml(code.lines.join('\n'))}</code></pre>`,
      ].filter((v): v is string => Boolean(v));
    } else if (card.blockType === 'quote') {
      const q = parseQuoteBlock(card.text.trim());
      innerHtml = [
        kickerLine,
        `    <blockquote class="text-lg italic leading-snug">“${escapeXml(q.quote)}”</blockquote>`,
        q.author ? `    <p class="mt-2 text-xs font-semibold opacity-70">— ${escapeXml(q.author)}</p>` : null,
      ].filter((v): v is string => Boolean(v));
    } else if (card.blockType === 'proof') {
      const proof = parseProofBlock(card.text.trim());
      innerHtml = [
        kickerLine,
        `    <div class="text-amber-500 text-xs font-semibold">★★★★★ <span class="opacity-80 text-current">${escapeXml(proof.rating)}</span></div>`,
        `    <h3 class="mt-2 text-base font-semibold">${escapeXml(proof.headline)}</h3>`,
        `    <p class="mt-1 text-xs opacity-75">${escapeXml(proof.caption)}</p>`,
      ].filter((v): v is string => Boolean(v));
    } else if (card.blockType === 'qr') {
      const qr = parseQrBlock(card.text.trim());
      innerHtml = [
        kickerLine,
        `    <h3 class="text-sm font-semibold">${escapeXml(qr.caption)}</h3>`,
        `    <p class="mt-1 text-xs font-mono opacity-70">${escapeXml(qr.url)}</p>`,
      ].filter((v): v is string => Boolean(v));
    } else {
      const lines = (card.text.trim() || card.contentHint || card.shapeName).split(/\r?\n/);
      const title = escapeXml(lines[0] ?? '');
      const body = lines.slice(1).map(escapeXml).join('<br />');
      const titleClass = card.role === 'hero' ? 'text-xl font-semibold' : 'text-sm font-semibold';
      innerHtml = [
        kickerLine,
        `    <h3 class="${titleClass} leading-tight" style="font-family: ${escapeXml(fontSpec.headingFamily)};">${title}</h3>`,
        body ? `    <p class="mt-1.5 text-xs opacity-80 leading-relaxed">${body}</p>` : null,
      ].filter((v): v is string => Boolean(v));
    }

    return [
      `  <!-- ${card.slotId} (${card.role}) -->`,
      `  <div`,
      `    class="mosaika-tile absolute overflow-hidden p-5 flex flex-col ${alignClass}${shadowClass}${hoverClass}"`,
      `    style="left: ${leftPct}%; top: ${topPct}%; width: ${widthPct}%; height: ${heightPct}%; ${bgStyle} ${borderStyle} ${radiusStyle} color: ${card.style.textColorHex}; font-family: ${escapeXml(fontSpec.bodyFamily)};${motionStyle}"`,
      `  >`,
      ...innerHtml,
      `  </div>`,
    ].join('\n');
  });

  const responsiveRules = [
    `  @media (max-width: 767px) {`,
    `    .mosaika-bento { aspect-ratio: auto !important; display: grid !important; grid-template-columns: 1fr; gap: 14px; padding: 16px; }`,
    `    .mosaika-tile { position: relative !important; left: auto !important; top: auto !important; width: 100% !important; height: auto !important; min-height: 150px; }`,
    `  }`,
  ];

  const keyframesBlock =
    hasMotion && activeAnimation
      ? [
          `  @keyframes mosaika-enter {`,
          activeAnimation.preset === 'rise-stagger'
            ? `    from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: translateY(0); }`
            : activeAnimation.preset === 'zoom-pop'
              ? `    from { opacity: 0; transform: scale(0.9); } to { opacity: 1; transform: scale(1); }`
              : activeAnimation.preset === 'wipe-editorial'
                ? `    from { opacity: 0; clip-path: inset(0 100% 0 0); } to { opacity: 1; clip-path: inset(0 0 0 0); }`
                : `    from { opacity: 0; } to { opacity: 1; }`,
          `  }`,
        ]
      : [];

  return [
    `<!-- Generated by Mosaika Studio (${w}×${h}) · Responsive Desktop + Mobile -->`,
    `<style>`,
    ...responsiveRules,
    ...keyframesBlock,
    `</style>`,
    `<section`,
    `  class="mosaika-bento relative w-full mx-auto overflow-hidden"`,
    `  style="max-width: ${w}px; aspect-ratio: ${w} / ${h}; ${sectionBgCss}"`,
    `>`,
    ...cardBlocks,
    `</section>`,
  ].join('\n');
}

/**
 * Wave 4 (#14): Drop-in React + TypeScript + Framer Motion component exporter.
 * Uses a responsive 12-column CSS Grid (grid-cols-1 md:grid-cols-12) with staggered spring motion
 * and hover micro-interactions matching the Studio's active Hover FX setting.
 */
export function exportToReactFramerMotion(snapshot: StudioSnapshot): string {
  const { canvasWidth: w, canvasHeight: h, canvasBgHex, cards, backdrop, hoverMode } = snapshot;
  const isDarkBg = canvasBgHex.toLowerCase() === '#0d0f0f' || canvasBgHex.toLowerCase() === '#090a0d';
  const palette = computeBackdropPalette(snapshot.brandAccentHex, isDarkBg);
  const fontSpec = getFontPairing(snapshot.fontPairing);
  const spans = computeResponsiveGridSpans(snapshot);
  const spanMap = new Map(spans.map((s) => [s.cardId, s]));

  const containerBg =
    backdrop === 'aurora'
      ? `radial-gradient(circle at 18% 18%, ${palette.blobA}77 0%, transparent 55%), radial-gradient(circle at 84% 24%, ${palette.blobB}70 0%, transparent 52%), radial-gradient(circle at 55% 88%, ${palette.blobC}66 0%, transparent 55%), ${palette.baseBg}`
      : backdrop === 'dusk'
        ? `linear-gradient(135deg, ${isDarkBg ? '#0B0F1A, #131826, #1C1628' : '#FDFBF7, #F3F4F8, #EBF0F9'})`
        : canvasBgHex;

  const hoverProp =
    hoverMode === 'lift'
      ? `whileHover={{ y: -5, transition: { duration: 0.2 } }}`
      : hoverMode === 'tilt'
        ? `whileHover={{ scale: 1.015, rotate: -0.4, transition: { duration: 0.2 } }}`
        : hoverMode === 'spotlight'
          ? `whileHover={{ scale: 1.01, boxShadow: '0 20px 44px rgba(15,23,42,0.14)' }}`
          : '';

  const jsxCards = cards.map((card, idx) => {
    const sp = spanMap.get(card.id);
    const colSpan = sp ? Math.min(12, Math.max(1, sp.colSpan)) : 6;
    const rowSpan = sp ? Math.min(6, Math.max(1, sp.rowSpan)) : 2;
    const radiusPx = Math.round(card.cornerAdjustment * Math.min(card.rect.width, card.rect.height));
    const isGlass = card.surfaceTreatment === 'glass';
    const cardBg = isGlass
      ? isDarkBg
        ? 'rgba(20, 22, 29, 0.48)'
        : 'rgba(255, 255, 255, 0.62)'
      : card.style.fillHex ?? '#FFFFFF';

    let bodyJsx: string;
    if (card.blockType === 'kpi') {
      const kpi = parseKpiBlock(card.text.trim() || card.contentHint || '');
      bodyJsx = [
        `          <div className="flex items-center gap-2">`,
        `            <span className="text-4xl font-bold tracking-tight tabular-nums">${escapeXml(kpi.value)}</span>`,
        kpi.delta
          ? `            <span className="text-xs font-semibold px-2 py-0.5 rounded-full border border-current opacity-85">${escapeXml(kpi.delta)}</span>`
          : '',
        `          </div>`,
        kpi.label ? `          <p className="mt-2 text-xs font-medium opacity-80">${escapeXml(kpi.label)}</p>` : '',
      ]
        .filter(Boolean)
        .join('\n');
    } else if (card.blockType === 'checklist') {
      const list = parseChecklistBlock(card.text.trim());
      bodyJsx = [
        `          <h3 className="text-sm font-semibold">${escapeXml(list.title)}</h3>`,
        `          <ul className="mt-2 space-y-1 text-xs opacity-85">`,
        ...list.items.map((item) => `            <li>✓ ${escapeXml(item)}</li>`),
        `          </ul>`,
      ].join('\n');
    } else if (card.blockType === 'code') {
      const code = parseCodeBlock(card.text.trim());
      bodyJsx = [
        `          <h3 className="text-sm font-semibold">${escapeXml(code.title)}</h3>`,
        `          <pre className="mt-2 rounded-xl bg-zinc-950 text-zinc-100 p-3 text-xs font-mono overflow-x-auto">`,
        `            <code>{"${escapeTsxString(code.lines.join('\n'))}"}</code>`,
        `          </pre>`,
      ].join('\n');
    } else if (card.blockType === 'chart') {
      const ch = parseChartBlock(card.text.trim());
      const { linePath } = computeSparklineGeometry(ch.values, 240, 72);
      bodyJsx = [
        `          <div className="flex items-baseline justify-between gap-2">`,
        `            <h3 className="text-sm font-semibold">${escapeXml(ch.title)}</h3>`,
        ch.delta ? `            <span className="text-xs font-semibold opacity-75">${escapeXml(ch.delta)}</span>` : '',
        `          </div>`,
        `          <svg viewBox="0 0 240 72" className="w-full mt-3">`,
        `            <path d="${linePath}" fill="none" stroke="${snapshot.brandAccentHex}" strokeWidth={3} strokeLinecap="round" />`,
        `          </svg>`,
      ]
        .filter(Boolean)
        .join('\n');
    } else if (card.blockType === 'quote') {
      const q = parseQuoteBlock(card.text.trim());
      bodyJsx = [
        `          <blockquote className="text-lg italic leading-snug">“${escapeXml(q.quote)}”</blockquote>`,
        q.author ? `          <p className="mt-2 text-xs font-semibold opacity-70">— ${escapeXml(q.author)}</p>` : '',
      ]
        .filter(Boolean)
        .join('\n');
    } else {
      const lines = (card.text.trim() || card.shapeName).split(/\r?\n/);
      const title = escapeXml(lines[0] ?? '');
      const body = lines.slice(1).map(escapeXml).join(' ');
      bodyJsx = [
        `          <h3 className="${card.role === 'hero' ? 'text-2xl' : 'text-base'} font-semibold tracking-tight leading-tight">${title}</h3>`,
        body ? `          <p className="mt-2 text-xs opacity-80 leading-relaxed">${body}</p>` : '',
      ]
        .filter(Boolean)
        .join('\n');
    }

    const kickerJsx = card.kicker?.trim()
      ? `          <span className="text-[10px] font-semibold uppercase tracking-widest opacity-70 mb-1.5">${escapeXml(card.kicker.trim())}</span>\n`
      : '';

    const gridPlacementStyle = sp
      ? `gridColumn: 'span ${colSpan} / span ${colSpan}', gridRow: 'span ${rowSpan} / span ${rowSpan}', `
      : '';

    return [
      `        <motion.div`,
      `          key="${card.slotId}"`,
      `          variants={itemVariants}`,
      `          custom={${idx}}`,
      hoverProp ? `          ${hoverProp}` : null,
      `          className="col-span-1 md:col-span-${colSpan} md:row-span-${rowSpan} relative overflow-hidden p-6 flex flex-col justify-between${isGlass ? ' backdrop-blur-xl' : ''}"`,
      `          style={{`,
      `            ${gridPlacementStyle}background: "${cardBg}",`,
      `            color: "${card.style.textColorHex}",`,
      `            borderRadius: ${radiusPx},`,
      `            border: "1px solid ${isGlass ? (isDarkBg ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.88)') : 'rgba(15,23,42,0.08)'}",`,
      `          }}`,
      `        >`,
      `${kickerJsx}${bodyJsx}`,
      `        </motion.div>`,
    ]
      .filter((line): line is string => line !== null)
      .join('\n');
  });

  return [
    `import { motion } from 'framer-motion';`,
    ``,
    `const itemVariants = {`,
    `  hidden: { opacity: 0, y: 20, scale: 0.98 },`,
    `  visible: (i: number) => ({`,
    `    opacity: 1,`,
    `    y: 0,`,
    `    scale: 1,`,
    `    transition: {`,
    `      delay: i * 0.08,`,
    `      duration: 0.45,`,
    `      ease: [0.22, 1, 0.36, 1],`,
    `    },`,
    `  }),`,
    `};`,
    ``,
    `/**`,
    ` * Generated by Mosaika Studio (${w}×${h})`,
    ` * Responsive 12-column Bento Grid with Framer Motion entrance & Hover FX.`,
    ` */`,
    `export function MosaikaBento() {`,
    `  return (`,
    `    <section`,
    `      className="w-full mx-auto p-6 md:p-10 rounded-3xl overflow-hidden"`,
    `      style={{`,
    `        maxWidth: ${w},`,
    `        background: "${containerBg}",`,
    `        fontFamily: "${escapeTsxString(fontSpec.bodyFamily)}",`,
    `      }}`,
    `    >`,
    `      <motion.div`,
    `        initial="hidden"`,
    `        whileInView="visible"`,
    `        viewport={{ once: true, amount: 0.2 }}`,
    `        className="grid grid-cols-1 md:grid-cols-12 auto-rows-[minmax(140px,auto)] gap-4"`,
    `      >`,
    ...jsxCards,
    `      </motion.div>`,
    `    </section>`,
    `  );`,
    `}`,
  ].join('\n');
}

/**
 * Wave 4 (#12): Generates a print-ready multi-page HTML document for Multi-Slide Carousel PDF export.
 */
export function exportDeckToPrintHtml(snapshots: readonly StudioSnapshot[]): string {
  const first = snapshots[0];
  const w = first?.canvasWidth ?? 1440;
  const h = first?.canvasHeight ?? 900;
  const pages = snapshots.map(
    (snap, idx) =>
      `  <section class="slide-page" aria-label="Slide ${idx + 1}">\n${exportToSvg(snap)}\n  </section>`
  );

  return [
    `<!DOCTYPE html>`,
    `<html lang="en">`,
    `<head>`,
    `  <meta charset="utf-8" />`,
    `  <title>Mosaika Deck (${snapshots.length} Slides)</title>`,
    `  <style>`,
    `    @page { size: ${w}px ${h}px; margin: 0; }`,
    `    * { box-sizing: border-box; margin: 0; padding: 0; }`,
    `    body { background: #111; }`,
    `    .slide-page { width: ${w}px; height: ${h}px; page-break-after: always; break-after: page; overflow: hidden; }`,
    `    .slide-page:last-child { page-break-after: auto; break-after: auto; }`,
    `    .slide-page svg { display: block; width: 100%; height: 100%; }`,
    `  </style>`,
    `</head>`,
    `<body>`,
    ...pages,
    `</body>`,
    `</html>`,
  ].join('\n');
}

/**
 * Renders the standalone SVG to a crisp 1x/2x/3x Retina PNG Blob in the browser.
 */
export async function exportToPngBlob(snapshot: StudioSnapshot, scale = 2): Promise<Blob> {
  const svgString = exportToSvg(snapshot);
  const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Failed to rasterize SVG to PNG.'));
      image.src = url;
    });

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(snapshot.canvasWidth * scale);
    canvas.height = Math.round(snapshot.canvasHeight * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable.');
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0, snapshot.canvasWidth, snapshot.canvasHeight);

    const pngBlob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((blob) => resolve(blob), 'image/png')
    );
    if (!pngBlob) throw new Error('Failed to encode PNG.');
    return pngBlob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function triggerFileDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * UTF-8 safe base64url encoding/decoding for zero-backend shareable URLs (#mosaika=...).
 */
export function encodeSharePayload(payload: ShareableStudioPayload): string {
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function decodeSharePayload(encoded: string): ShareableStudioPayload | null {
  try {
    const clean = encoded.replace(/^#?mosaika=/, '').trim();
    if (!clean) return null;
    const padLen = (4 - (clean.length % 4)) % 4;
    const base64 = clean.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(padLen);
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const json = new TextDecoder().decode(bytes);
    const parsed = JSON.parse(json) as Partial<ShareableStudioPayload>;
    if (!parsed.state || typeof parsed.w !== 'number' || typeof parsed.h !== 'number') {
      return null;
    }
    return parsed as ShareableStudioPayload;
  } catch {
    return null;
  }
}
