import type { LayoutIntent } from '@bento/contract';
import type {
  CardBlockType,
  CardPatternKind,
  CardSurfaceTreatment,
  CardWidgetVariant,
} from './cardBlocks.js';
import type { ShowcaseCardSeed } from './showcases.js';
import type { CardIconId, CardTextAlign } from './visualCraft.js';

export interface NotesToBentoPlan {
  intent: LayoutIntent;
  cards: ShowcaseCardSeed[];
  summary: string;
}

export const SAMPLE_NOTE_PROMPTS: ReadonlyArray<{ label: string; markdown: string }> = [
  {
    label: 'SaaS Launch Brief',
    markdown: `# Mosaika Studio 2.0
Design bounded Swiss bento grids for web, social, and PowerPoint in seconds.

## 144+ (+12 Intents)
Curated deduplicated blueprints

## Weekly Growth (+42% MoM)
18, 28, 35, 49, 64, 88

## Quick Install
\`\`\`bash
pnpm create mosaika
cd my-grid && pnpm dev
\`\`\`

## Launch Checklist
- Native editable .pptx export
- Pure vector SVG & 2x Retina PNG
- Zero-backend shareable URLs

https://prabhu-phd.github.io/mosaika`,
  },
  {
    label: 'Q4 Board Metrics',
    markdown: `# Q4 Executive Summary
All ARR, retention, and enterprise uptime goals exceeded target ahead of schedule.

## $4.8M (+164% YoY)
Annual Recurring Revenue

## 99.98% (SLA Met)
Global Platform Reliability

## Quarterly Bookings (+38%)
32, 44, 58, 72, 91

> "Mosaika cut our weekly executive deck prep time from 3 hours to 15 minutes." — Sarah Patel, COO`,
  },
  {
    label: 'Release Changelog',
    markdown: `# Release v2.4 Notes
Faster layout engine, 9 interactive bento widgets, and Apple squircle contours.

## What's New
- Live vector Sparklines, Mini Bars & Radial Rings
- iPhone, MacBook & Browser device mockup frames
- Camera-scannable QR tiles

## Upgrade Now
\`\`\`bash
pnpm up @mosaika/web@latest
pnpm build:site
\`\`\`

4.9 / 5 · Trusted by 2,400+ designers shipping weekly launches`,
  },
] as const;

interface RawChunk {
  heading?: string;
  bodyLines: string[];
  isCodeFence?: boolean;
}

function splitMarkdownIntoChunks(raw: string): RawChunk[] {
  const lines = raw.replace(/\r\n/g, '\n').split('\n');
  const chunks: RawChunk[] = [];
  let current: RawChunk | null = null;
  let inCodeFence = false;

  const flush = () => {
    if (!current) return;
    if (current.heading || current.bodyLines.some((l) => l.trim().length > 0)) {
      chunks.push({
        heading: current.heading,
        bodyLines: current.bodyLines.filter((l) => l.trim().length > 0),
        isCodeFence: current.isCodeFence,
      });
    }
    current = null;
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('```')) {
      if (!inCodeFence) {
        inCodeFence = true;
        if (!current) {
          current = { heading: 'Terminal', bodyLines: [], isCodeFence: true };
        } else {
          current.isCodeFence = true;
        }
      } else {
        inCodeFence = false;
        flush();
      }
      continue;
    }

    if (inCodeFence) {
      if (!current) current = { heading: 'Code', bodyLines: [], isCodeFence: true };
      current.bodyLines.push(line);
      continue;
    }

    const headingMatch = /^#{1,3}\s+(.+)$/.exec(trimmed);
    if (headingMatch && headingMatch[1]) {
      flush();
      current = { heading: headingMatch[1].trim(), bodyLines: [] };
      continue;
    }

    if (trimmed.length === 0) {
      flush();
      continue;
    }

    if (!current) {
      current = { bodyLines: [trimmed] };
    } else {
      current.bodyLines.push(trimmed);
    }
  }

  flush();
  return chunks;
}

function parseSeriesFromLine(line: string): number[] | null {
  const tokens = line.split(/[,\s]+/).filter(Boolean);
  if (tokens.length < 3 || tokens.length > 16) return null;
  const nums: number[] = [];
  for (const t of tokens) {
    if (!/^-?\d+(\.\d+)?%?$/.test(t)) return null;
    nums.push(Number.parseFloat(t));
  }
  return nums.length >= 3 ? nums : null;
}

function classifyChunk(chunk: RawChunk, isFirst: boolean): ShowcaseCardSeed {
  const heading = chunk.heading?.trim() ?? '';
  const body = chunk.bodyLines;
  const combined = [heading, ...body].filter(Boolean).join('\n');

  // 1. First chunk always anchors the Hero card cleanly
  if (isFirst) {
    const title = heading || body[0] || 'Untitled Bento';
    const sub = heading ? body.join(' ') : body.slice(1).join(' ');
    return {
      text: sub ? `${title}\n${sub}` : title,
      blockType: 'text',
      kicker: 'OVERVIEW',
      icon: 'sparkles',
      textAlign: 'bl',
      surfaceTreatment: 'mesh',
      pattern: 'rings',
    };
  }

  // 2. Code fence or CLI command
  const looksLikeCli = body.some((l) =>
    /^(npm|pnpm|npx|yarn|git|curl|pip|brew|docker)\s+/i.test(l.trim())
  );
  if (chunk.isCodeFence || looksLikeCli) {
    return {
      text: `${heading || 'Quick Start'}\n${body.join('\n')}`,
      blockType: 'code',
      kicker: 'CLI',
      icon: 'command',
      surfaceTreatment: 'glass',
    };
  }

  // 3. Numeric chart series (e.g. "18, 28, 35, 49, 64, 88")
  const seriesLine = body.find((l) => parseSeriesFromLine(l) !== null);
  if (seriesLine) {
    const deltaMatch = /\(([^)]+)\)/.exec(heading);
    const cleanTitle = heading.replace(/\s*\([^)]+\)\s*/, '').trim() || 'Trend';
    const delta = deltaMatch?.[1] ?? '';
    const variant: CardWidgetVariant = cleanTitle.toLowerCase().includes('booking') || cleanTitle.toLowerCase().includes('revenue')
      ? 'bars'
      : 'sparkline';
    return {
      text: delta ? `${cleanTitle}\n${delta}\n${seriesLine}` : `${cleanTitle}\n${seriesLine}`,
      blockType: 'chart',
      widgetVariant: variant,
      icon: 'trending',
      surfaceTreatment: 'glass',
    };
  }

  // 4. Standalone URL -> Live Scannable QR Code tile
  const urlMatch = /(https?:\/\/[^\s]+)/i.exec(combined);
  if (urlMatch && urlMatch[1] && body.length <= 2 && combined.length < 140) {
    const caption =
      heading && !heading.startsWith('http')
        ? heading
        : body.find((l) => !l.includes('http')) || 'Scan to Open';
    return {
      text: `${urlMatch[1]}\n${caption}`,
      blockType: 'qr',
      surfaceTreatment: 'glass',
    };
  }

  // 5. Blockquote (> or wrapped in quotes)
  const firstBody = body[0] ?? '';
  if (firstBody.startsWith('>') || /^[“"].+[”"]/.test(combined)) {
    const rawQuote = combined.replace(/^>\s*/gm, '').trim();
    const parts = rawQuote.split(/\s*[—–-]{1,2}\s*/);
    const quoteText = (parts[0] ?? rawQuote).replace(/^[“"]+|[”"]+$/g, '').trim();
    const author = parts.slice(1).join(' · ').trim();
    return {
      text: author ? `${quoteText}\n${author}` : quoteText,
      blockType: 'quote',
      surfaceTreatment: 'glass',
    };
  }

  // 6. Social Proof (star rating like "4.9 / 5" or "trusted by")
  const ratingMatch = /(\d\.\d\s*\/\s*5)/.exec(combined);
  if (ratingMatch || /trusted by|customers|designers/i.test(combined)) {
    const rating = ratingMatch?.[1] ?? '4.9 / 5';
    const cleaned = combined.replace(rating, '').replace(/^[\s·\-•]+/, '').trim();
    const pieces = cleaned.split(/\r?\n|·/).map((s) => s.trim()).filter(Boolean);
    return {
      text: `${pieces[0] ?? 'Trusted Worldwide'}\n${rating}\n${pieces.slice(1).join(' ') || 'Rated by real teams'}`,
      blockType: 'proof',
      surfaceTreatment: 'glass',
    };
  }

  // 7. Bullet list (2+ bullet items) -> Checklist widget
  const bulletItems = body.filter((l) => /^[-*•✓✔]\s+/.test(l));
  if (bulletItems.length >= 2) {
    const cleanItems = bulletItems.map((l) => l.replace(/^[-*•✓✔]\s+/, '').trim());
    return {
      text: `${heading || 'Highlights'}\n${cleanItems.join('\n')}`,
      blockType: 'checklist',
      icon: 'check',
      surfaceTreatment: 'glass',
    };
  }

  // 8. Metric / KPI (starts with $, +, or number+unit like 144+, 99.98%, 6.4x)
  const kpiHead = heading || firstBody;
  const kpiRegex = /^([+$€£]?\d[\d.,]*[%xXkKmMbB+]?)(?:\s*\(([^)]+)\))?(?:\s+(.*))?$/;
  const kpiMatch = kpiRegex.exec(kpiHead);
  if (kpiMatch && kpiMatch[1]) {
    const value = kpiMatch[1];
    const delta = kpiMatch[2] ?? '';
    const label = [kpiMatch[3], ...(heading ? body : body.slice(1))].filter(Boolean).join(' ').trim();
    return {
      text: delta ? `${value}\n${delta}\n${label || 'Key Metric'}` : `${value}\n${label || 'Key Metric'}`,
      blockType: 'kpi',
      surfaceTreatment: 'glass',
    };
  }

  // 9. Standard Text card fallback
  const title = heading || firstBody;
  const rest = heading ? body.join('\n') : body.slice(1).join('\n');
  const icon: CardIconId = 'none';
  const textAlign: CardTextAlign = 'tl';
  const pattern: CardPatternKind = 'none';
  const surfaceTreatment: CardSurfaceTreatment = 'glass';
  return {
    text: rest ? `${title}\n${rest}` : title,
    blockType: 'text',
    icon,
    textAlign,
    pattern,
    surfaceTreatment,
  };
}

/**
 * Pure local heuristic converter: turns raw Markdown, bullets, KPIs, code blocks,
 * quotes, and URLs into a structured Bento layout plan with optimal LayoutIntent.
 */
export function parseNotesToBentoPlan(rawMarkdown: string): NotesToBentoPlan {
  const chunks = splitMarkdownIntoChunks(rawMarkdown);

  // If user pasted a plain un-chunked bullet list, break single bullets into cards if needed
  let cards: ShowcaseCardSeed[];
  if (chunks.length === 0) {
    cards = [
      {
        text: 'Your Headline\nPaste notes, metrics, or markdown to generate a structured bento grid.',
        blockType: 'text',
        kicker: 'DRAFT',
        icon: 'sparkles',
        textAlign: 'bl',
        surfaceTreatment: 'mesh',
      },
      {
        text: 'Key Highlights\nAdd bullets for checklists\nInclude numbers for KPIs\nPaste URLs for QR codes',
        blockType: 'checklist',
        surfaceTreatment: 'glass',
      },
    ];
  } else if (chunks.length === 1 && chunks[0]!.bodyLines.length >= 3) {
    // Split a single big block into Hero + 2nd card so we always produce >= 2 valid Bento cells
    const c0 = chunks[0]!;
    cards = [
      classifyChunk({ heading: c0.heading || c0.bodyLines[0], bodyLines: c0.heading ? [c0.bodyLines[0]!] : [] }, true),
      classifyChunk({ heading: 'Details', bodyLines: c0.bodyLines.slice(1) }, false),
    ];
  } else {
    cards = chunks.slice(0, 9).map((ch, idx) => classifyChunk(ch, idx === 0));
    if (cards.length === 1) {
      cards.push({
        text: 'Supporting Detail\nAdd another section or bullet list to expand your grid.',
        blockType: 'text',
        surfaceTreatment: 'glass',
      });
    }
  }

  // Pick optimal LayoutIntent based on detected widget mix
  const countOf = (type: CardBlockType) => cards.filter((c) => (c.blockType ?? 'text') === type).length;
  const kpiAndChartCount = countOf('kpi') + countOf('chart');
  const quoteCount = countOf('quote');
  const codeAndMockupCount = countOf('code') + countOf('mockup');

  let intent: LayoutIntent = 'executive-brief';
  if (kpiAndChartCount >= 2) {
    intent = 'kpi-dashboard';
  } else if (quoteCount >= 1 && cards.length <= 5) {
    intent = 'editorial-story';
  } else if (codeAndMockupCount >= 2) {
    intent = 'product-showcase';
  }

  // Build crisp human-readable detection summary
  const tally = new Map<string, number>();
  for (const c of cards) {
    const label = c.blockType ?? 'text';
    tally.set(label, (tally.get(label) ?? 0) + 1);
  }
  const parts = Array.from(tally.entries()).map(([k, n]) => `${n} ${k}`);
  const summary = `${cards.length} cards · ${parts.join(', ')}`;

  return { intent, cards, summary };
}
