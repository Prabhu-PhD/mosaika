import type { ShareableStudioPayload, StudioCard, StudioSnapshot } from './studioHost.js';

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
  const { canvasWidth: w, canvasHeight: h, canvasBgHex, cards } = snapshot;

  const defs: string[] = [
    `<filter id="mosaika-shadow" x="-10%" y="-10%" width="120%" height="124%">` +
      `<feDropShadow dx="0" dy="6" stdDeviation="9" flood-color="#0F172A" flood-opacity="0.10"/>` +
      `</filter>`,
    `<linearGradient id="mosaika-scrim" x1="0" y1="0" x2="0" y2="1">` +
      `<stop offset="0%" stop-color="#000000" stop-opacity="0.08"/>` +
      `<stop offset="55%" stop-color="#000000" stop-opacity="0.22"/>` +
      `<stop offset="100%" stop-color="#000000" stop-opacity="0.72"/>` +
      `</linearGradient>`,
  ];

  const layers: string[] = [
    `<rect x="0" y="0" width="${w}" height="${h}" fill="${escapeXml(canvasBgHex)}"/>`,
  ];

  for (const card of cards) {
    const clipId = `clip-${card.slotId}`;
    const rx = +(card.cornerAdjustment * Math.min(card.rect.width, card.rect.height)).toFixed(2);
    const fill = card.style.fillHex ? escapeXml(card.style.fillHex) : 'none';
    const stroke =
      card.style.borderColorHex && card.style.borderWeightPt > 0
        ? hexToRgba(card.style.borderColorHex, card.style.borderTransparency)
        : 'none';
    const dashAttr = card.style.borderDashed ? ` stroke-dasharray="6 4"` : '';
    const filterAttr = card.style.shadow ? ` filter="url(#mosaika-shadow)"` : '';

    if (card.svgPath) {
      defs.push(
        `<clipPath id="${clipId}"><path d="${escapeXml(card.svgPath)}" transform="translate(${card.rect.left} ${card.rect.top})"/></clipPath>`
      );
    } else {
      defs.push(
        `<clipPath id="${clipId}"><rect x="${card.rect.left}" y="${card.rect.top}" width="${card.rect.width}" height="${card.rect.height}" rx="${rx}" ry="${rx}"/></clipPath>`
      );
    }

    const cardParts: string[] = [];
    if (card.svgPath) {
      cardParts.push(
        `<path d="${escapeXml(card.svgPath)}" transform="translate(${card.rect.left} ${card.rect.top})" fill="${fill}" stroke="${stroke}" stroke-width="${card.style.borderWeightPt}"${dashAttr}${filterAttr}/>`
      );
    } else {
      cardParts.push(
        `<rect x="${card.rect.left}" y="${card.rect.top}" width="${card.rect.width}" height="${card.rect.height}" rx="${rx}" ry="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="${card.style.borderWeightPt}"${dashAttr}${filterAttr}/>`
      );
    }

    if (card.imageDataUrl) {
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
          `<text x="${textX.toFixed(1)}" y="${startY.toFixed(1)}"${anchorAttr} fill="${escapeXml(card.style.textColorHex)}" font-family="Inter, -apple-system, 'Segoe UI', sans-serif">${tspans}</text>` +
          `</g>`
      );
    }

    layers.push(`<g id="${card.slotId}">${cardParts.join('')}</g>`);
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" fill="none">`,
    `  <defs>${defs.join('')}</defs>`,
    `  ${layers.join('\n  ')}`,
    `</svg>`,
  ].join('\n');
}

/**
 * Generates clean, responsive HTML + Tailwind CSS markup ready to paste into any web project.
 */
export function exportToHtmlTailwind(snapshot: StudioSnapshot): string {
  const { canvasWidth: w, canvasHeight: h, canvasBgHex, cards, activeAnimation } = snapshot;
  const hasMotion = Boolean(activeAnimation && activeAnimation.preset !== 'none');

  const cardBlocks = cards.map((card: StudioCard) => {
    const leftPct = ((card.rect.left / w) * 100).toFixed(3);
    const topPct = ((card.rect.top / h) * 100).toFixed(3);
    const widthPct = ((card.rect.width / w) * 100).toFixed(3);
    const heightPct = ((card.rect.height / h) * 100).toFixed(3);
    const radiusPx = Math.round(card.cornerAdjustment * Math.min(card.rect.width, card.rect.height));

    const bgStyle = card.style.fillHex ? `background-color: ${card.style.fillHex};` : '';
    const borderStyle =
      card.style.borderColorHex && card.style.borderWeightPt > 0
        ? `border: ${card.style.borderWeightPt}px ${card.style.borderDashed ? 'dashed' : 'solid'} ${hexToRgba(card.style.borderColorHex, card.style.borderTransparency)};`
        : '';
    const shadowClass = card.style.shadow ? ' shadow-lg' : '';
    const radiusStyle =
      card.shapeKind === 'circle'
        ? 'border-radius: 9999px;'
        : card.shapeKind === 'pill'
          ? 'border-radius: 9999px;'
          : `border-radius: ${radiusPx}px;`;

    const orderIdx = activeAnimation ? activeAnimation.orderedSlotIds.indexOf(card.slotId) : -1;
    const motionStyle =
      hasMotion && activeAnimation && orderIdx >= 0
        ? ` animation: mosaika-enter ${activeAnimation.durationSec}s cubic-bezier(0.22, 1, 0.36, 1) ${(orderIdx * activeAnimation.staggerSec).toFixed(2)}s both;`
        : '';

    const lines = (card.text.trim() || card.contentHint || card.shapeName).split(/\r?\n/);
    const title = escapeXml(lines[0] ?? '');
    const body = lines.slice(1).map(escapeXml).join('<br />');

    const titleClass = card.role === 'hero' ? 'text-xl font-semibold' : 'text-sm font-semibold';

    return [
      `  <!-- ${card.slotId} (${card.role}) -->`,
      `  <div`,
      `    class="absolute overflow-hidden p-5 flex flex-col justify-start${shadowClass}"`,
      `    style="left: ${leftPct}%; top: ${topPct}%; width: ${widthPct}%; height: ${heightPct}%; ${bgStyle} ${borderStyle} ${radiusStyle} color: ${card.style.textColorHex};${motionStyle}"`,
      `  >`,
      `    <h3 class="${titleClass} leading-tight">${title}</h3>`,
      body ? `    <p class="mt-1.5 text-xs opacity-80 leading-relaxed">${body}</p>` : null,
      `  </div>`,
    ]
      .filter(Boolean)
      .join('\n');
  });

  const keyframesBlock =
    hasMotion && activeAnimation
      ? [
          `<style>`,
          `  @keyframes mosaika-enter {`,
          activeAnimation.preset === 'rise-stagger'
            ? `    from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: translateY(0); }`
            : activeAnimation.preset === 'zoom-pop'
              ? `    from { opacity: 0; transform: scale(0.9); } to { opacity: 1; transform: scale(1); }`
              : activeAnimation.preset === 'wipe-editorial'
                ? `    from { opacity: 0; clip-path: inset(0 100% 0 0); } to { opacity: 1; clip-path: inset(0 0 0 0); }`
                : `    from { opacity: 0; } to { opacity: 1; }`,
          `  }`,
          `</style>`,
        ]
      : [];

  return [
    `<!-- Generated by Mosaika Studio (${w}×${h}) -->`,
    ...keyframesBlock,
    `<section`,
    `  class="relative w-full mx-auto overflow-hidden"`,
    `  style="max-width: ${w}px; aspect-ratio: ${w} / ${h}; background-color: ${canvasBgHex};"`,
    `>`,
    ...cardBlocks,
    `</section>`,
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
