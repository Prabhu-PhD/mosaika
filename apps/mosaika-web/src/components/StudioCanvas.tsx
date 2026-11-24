import { useEffect, useMemo, useRef, useState } from 'react';
import type { RectPt, SplitAxis } from '@bento/contract';
import {
  computeGridLattice,
  resolveSplitHandles,
  type ResolvedSplitHandle,
} from '@bento/core';
import { ImagePlus, Lock, Trash2 } from 'lucide-react';
import type { StudioCard, StudioSnapshot } from '../studioHost.js';

export interface StudioCanvasProps {
  snapshot: StudioSnapshot;
  isDarkTheme: boolean;
  showGridOverlay: boolean;
  onSelectCards: (ids: string[]) => void;
  onUpdateCardText: (cardId: string, text: string) => void;
  onSetCardImage: (cardId: string, dataUrl: string) => void;
  onDeleteCard: (cardId: string) => void;
  onResizeSplit: (
    nodeId: string,
    nextRatio: number,
    snapHarmonic: boolean,
    commit: boolean
  ) => void;
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

function formatHarmonicBadge(ratio: number): string {
  const presets: ReadonlyArray<[number, string]> = [
    [0.25, '1:3'],
    [1 / 3, '1:2'],
    [0.4, '2:3'],
    [0.5, '1:1'],
    [0.6, '3:2'],
    [2 / 3, '2:1'],
    [0.75, '3:1'],
  ];
  for (const [val, label] of presets) {
    if (Math.abs(ratio - val) < 0.008) return label;
  }
  return `${Math.round(ratio * 100)}%`;
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

function readImageFileAsDataUrl(file: File): Promise<string | null> {
  if (!file.type.startsWith('image/')) return Promise.resolve(null);
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

export function StudioCanvas({
  snapshot,
  isDarkTheme,
  showGridOverlay,
  onSelectCards,
  onUpdateCardText,
  onSetCardImage,
  onDeleteCard,
  onResizeSplit,
}: StudioCanvasProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadTargetCardId, setUploadTargetCardId] = useState<string | null>(null);
  const [stageBox, setStageBox] = useState<{ w: number; h: number }>({ w: 960, h: 640 });
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [dragOverCardId, setDragOverCardId] = useState<string | null>(null);
  const [hoveredGutterId, setHoveredGutterId] = useState<string | null>(null);
  const [draggingGutter, setDraggingGutter] = useState<{
    nodeId: string;
    axis: SplitAxis;
    parentRect: RectPt;
    gutterPt: number;
    lastRatio: number;
  } | null>(null);

  // Measure workbench viewport so any aspect ratio (1440×900, 1080×1080, 794×1123, 1200×360) fits cleanly
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setStageBox({ w: rect.width, h: rect.height });
      }
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Keyboard Delete/Backspace removes selected card when not typing
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = document.activeElement?.tagName.toLowerCase();
      if (tag === 'textarea' || tag === 'input' || tag === 'select') return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && snapshot.selectedCardIds.length > 0) {
        e.preventDefault();
        for (const id of snapshot.selectedCardIds) {
          onDeleteCard(id);
        }
      } else if (e.key === 'Escape') {
        setEditingCardId(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onDeleteCard, snapshot.selectedCardIds]);

  const fittedArtboard = useMemo(() => {
    const availW = Math.max(240, stageBox.w - 48);
    const availH = Math.max(200, stageBox.h - 68);
    const scale = Math.min(availW / snapshot.canvasWidth, availH / snapshot.canvasHeight, 1.15);
    return {
      width: Math.round(snapshot.canvasWidth * scale),
      height: Math.round(snapshot.canvasHeight * scale),
      scale,
    };
  }, [stageBox.w, stageBox.h, snapshot.canvasWidth, snapshot.canvasHeight]);

  const bentoOverlays = useMemo(() => {
    if (!snapshot.activeDoc || snapshot.cards.length === 0) return null;
    const doc = snapshot.activeDoc;
    const handles = resolveSplitHandles(doc.tree, doc.anchorRect, doc.params.gutterPt);
    const lattice = computeGridLattice(doc.anchorRect, doc.params.gutterPt, doc.params.gridSystem);
    return { doc, handles, lattice };
  }, [snapshot.activeDoc, snapshot.cards.length]);

  const clientToCanvasPt = (clientX: number, clientY: number): { x: number; y: number } | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const x = ((clientX - rect.left) / rect.width) * snapshot.canvasWidth;
    const y = ((clientY - rect.top) / rect.height) * snapshot.canvasHeight;
    return {
      x: Math.max(0, Math.min(snapshot.canvasWidth, x)),
      y: Math.max(0, Math.min(snapshot.canvasHeight, y)),
    };
  };

  const selectedSet = useMemo(() => new Set(snapshot.selectedCardIds), [snapshot.selectedCardIds]);

  const handleCardClick = (e: React.MouseEvent, card: StudioCard) => {
    e.stopPropagation();
    if (e.shiftKey) {
      if (selectedSet.has(card.id)) {
        onSelectCards(snapshot.selectedCardIds.filter((id) => id !== card.id));
      } else {
        onSelectCards([...snapshot.selectedCardIds, card.id]);
      }
    } else {
      onSelectCards([card.id]);
    }
  };

  const handleGutterDown = (
    e: React.PointerEvent<SVGGElement>,
    handle: ResolvedSplitHandle,
    gutterPt: number
  ) => {
    if (handle.locked) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setEditingCardId(null);
    setDraggingGutter({
      nodeId: handle.nodeId,
      axis: handle.axis,
      parentRect: handle.parentRect,
      gutterPt,
      lastRatio: handle.ratio,
    });
  };

  const handleGutterMove = (e: React.PointerEvent<SVGGElement>) => {
    if (!draggingGutter) return;
    e.stopPropagation();
    const pt = clientToCanvasPt(e.clientX, e.clientY);
    if (!pt) return;
    const pr = draggingGutter.parentRect;
    const g = draggingGutter.gutterPt;
    const nextRatio =
      draggingGutter.axis === 'vertical'
        ? (pt.x - pr.left - g / 2) / Math.max(1, pr.width - g)
        : (pt.y - pr.top - g / 2) / Math.max(1, pr.height - g);
    setDraggingGutter((prev) => (prev ? { ...prev, lastRatio: nextRatio } : null));
    onResizeSplit(draggingGutter.nodeId, nextRatio, !e.altKey, false);
  };

  const handleGutterUp = (e: React.PointerEvent<SVGGElement>) => {
    if (!draggingGutter) return;
    e.stopPropagation();
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    const { nodeId, lastRatio } = draggingGutter;
    setDraggingGutter(null);
    onResizeSplit(nodeId, lastRatio, !e.altKey, true);
  };

  const handleCardDrop = async (e: React.DragEvent, cardId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverCardId(null);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const dataUrl = await readImageFileAsDataUrl(file);
    if (dataUrl) {
      onSetCardImage(cardId, dataUrl);
    }
  };

  const handleManualImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const targetId = uploadTargetCardId;
    e.target.value = '';
    if (!file || !targetId) return;
    const dataUrl = await readImageFileAsDataUrl(file);
    if (dataUrl) {
      onSetCardImage(targetId, dataUrl);
    }
  };

  const uiScaleInv = Math.max(0.75, Math.min(2.2, 1 / Math.max(0.3, fittedArtboard.scale)));
  const badgeFontPx = Math.round(11 * uiScaleInv);

  return (
    <div
      ref={stageRef}
      className="relative flex-1 min-w-0 h-full flex flex-col items-center justify-center overflow-hidden select-none"
      style={{
        backgroundColor: isDarkTheme ? '#0A0B0C' : '#F3F4F6',
        backgroundImage: isDarkTheme
          ? 'radial-gradient(rgba(255,255,255,0.08) 1px, transparent 1px)'
          : 'radial-gradient(rgba(15,23,42,0.10) 1px, transparent 1px)',
        backgroundSize: '20px 20px',
      }}
      onClick={() => {
        setEditingCardId(null);
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleManualImageUpload}
      />

      {/* Artboard Status Strip */}
      <div
        className="flex items-center justify-between mb-2 px-0.5 text-[11px] font-mono tracking-tight"
        style={{
          width: fittedArtboard.width,
          color: isDarkTheme ? '#9CA3AF' : '#52525B',
        }}
      >
        <div className="flex items-center gap-2">
          <span className="font-semibold" style={{ color: isDarkTheme ? '#F4F4F5' : '#18181B' }}>
            {snapshot.canvasWidth} × {snapshot.canvasHeight} px
          </span>
          <span>·</span>
          <span>
            {snapshot.cards.length} {snapshot.cards.length === 1 ? 'card' : 'cards'}
          </span>
          <span>·</span>
          <span>{Math.round(fittedArtboard.scale * 100)}% zoom</span>
        </div>
        <span className="hidden sm:inline opacity-75">
          Double-click card to edit · Drop image on any tile · Drag gutters to resize
        </span>
      </div>

      {/* Centered Artboard Frame */}
      <div
        data-testid="studio-artboard-frame"
        className="relative transition-[width,height] duration-150"
        style={{
          width: fittedArtboard.width,
          height: fittedArtboard.height,
          boxShadow: isDarkTheme
            ? '0 22px 54px rgba(0, 0, 0, 0.65), 0 0 0 1px rgba(255, 255, 255, 0.12)'
            : '0 20px 48px rgba(15, 23, 42, 0.12), 0 0 0 1px rgba(15, 23, 42, 0.10)',
        }}
      >
        <svg
          ref={svgRef}
          data-testid="studio-artboard-svg"
          viewBox={`0 0 ${snapshot.canvasWidth} ${snapshot.canvasHeight}`}
          width={fittedArtboard.width}
          height={fittedArtboard.height}
          className="block w-full h-full"
          style={{ backgroundColor: snapshot.canvasBgHex }}
        >
          <defs>
            <filter id="studio-card-shadow" x="-10%" y="-10%" width="120%" height="124%">
              <feDropShadow
                dx="0"
                dy="6"
                stdDeviation="9"
                floodColor="#0F172A"
                floodOpacity={isDarkTheme ? '0.38' : '0.10'}
              />
            </filter>
            <linearGradient id="studio-card-scrim" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#000000" stopOpacity="0.06" />
              <stop offset="55%" stopColor="#000000" stopOpacity="0.24" />
              <stop offset="100%" stopColor="#000000" stopOpacity="0.72" />
            </linearGradient>

            {snapshot.cards.map((card) => {
              const rx = card.cornerAdjustment * Math.min(card.rect.width, card.rect.height);
              return (
                <clipPath key={`clip-${card.id}`} id={`studio-clip-${card.id}`}>
                  {card.svgPath ? (
                    <path
                      d={card.svgPath}
                      transform={`translate(${card.rect.left} ${card.rect.top})`}
                    />
                  ) : (
                    <rect
                      x={card.rect.left}
                      y={card.rect.top}
                      width={card.rect.width}
                      height={card.rect.height}
                      rx={rx}
                      ry={rx}
                    />
                  )}
                </clipPath>
              );
            })}
          </defs>

          {/* Artboard Background */}
          <rect
            x={0}
            y={0}
            width={snapshot.canvasWidth}
            height={snapshot.canvasHeight}
            fill={snapshot.canvasBgHex}
            onClick={() => {
              setEditingCardId(null);
              onSelectCards([]);
            }}
          />

          {/* Cards */}
          {snapshot.cards.map((card) => {
            const isSelected = selectedSet.has(card.id);
            const isEditing = editingCardId === card.id;
            const isDropTarget = dragOverCardId === card.id;
            const rx = card.cornerAdjustment * Math.min(card.rect.width, card.rect.height);
            const fill = card.style.fillHex ?? 'none';
            const stroke =
              card.style.borderColorHex && card.style.borderWeightPt > 0
                ? hexToRgba(card.style.borderColorHex, card.style.borderTransparency)
                : 'none';

            const headlineSize =
              card.role === 'hero'
                ? Math.max(18, Math.min(34, Math.round(card.rect.width * 0.048)))
                : Math.max(14, Math.min(22, Math.round(card.rect.width * 0.045)));
            const basePadX = Math.max(16, Math.round(card.rect.width * 0.055));
            const basePadY = Math.max(18, Math.round(card.rect.height * 0.07));
            const safePad = computeNotchSafePadding(card, snapshot.cards, basePadX, basePadY);
            const isCircle = card.shapeKind === 'circle';
            const lines = card.text.split(/\r?\n/);
            const firstLine = lines[0] ?? '';
            const restLines = lines.slice(1).join('\n');

            return (
              <g
                key={card.id}
                data-testid={`studio-card-${card.slotId}`}
                className="cursor-pointer"
                onClick={(e) => handleCardClick(e, card)}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  onSelectCards([card.id]);
                  setEditingCardId(card.id);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setDragOverCardId(card.id);
                }}
                onDragLeave={() => {
                  setDragOverCardId((prev) => (prev === card.id ? null : prev));
                }}
                onDrop={(e) => {
                  void handleCardDrop(e, card.id);
                }}
              >
                {/* Base Vector Shape */}
                {card.svgPath ? (
                  <path
                    d={card.svgPath}
                    transform={`translate(${card.rect.left} ${card.rect.top})`}
                    fill={fill}
                    stroke={stroke}
                    strokeWidth={card.style.borderWeightPt}
                    strokeDasharray={card.style.borderDashed ? '6 4' : undefined}
                    filter={card.style.shadow ? 'url(#studio-card-shadow)' : undefined}
                  />
                ) : (
                  <rect
                    x={card.rect.left}
                    y={card.rect.top}
                    width={card.rect.width}
                    height={card.rect.height}
                    rx={rx}
                    ry={rx}
                    fill={fill}
                    stroke={stroke}
                    strokeWidth={card.style.borderWeightPt}
                    strokeDasharray={card.style.borderDashed ? '6 4' : undefined}
                    filter={card.style.shadow ? 'url(#studio-card-shadow)' : undefined}
                  />
                )}

                {/* Clipped Photo & Scrim */}
                {card.imageDataUrl && (
                  <g clipPath={`url(#studio-clip-${card.id})`} pointerEvents="none">
                    <image
                      href={card.imageDataUrl}
                      x={card.rect.left}
                      y={card.rect.top}
                      width={card.rect.width}
                      height={card.rect.height}
                      preserveAspectRatio="xMidYMid slice"
                    />
                    {card.hasScrim && (
                      <rect
                        x={card.rect.left}
                        y={card.rect.top}
                        width={card.rect.width}
                        height={card.rect.height}
                        fill="url(#studio-card-scrim)"
                      />
                    )}
                  </g>
                )}

                {/* Card Typography or Live Editor */}
                <g clipPath={`url(#studio-clip-${card.id})`}>
                  <foreignObject
                    x={card.rect.left}
                    y={card.rect.top}
                    width={card.rect.width}
                    height={card.rect.height}
                  >
                    <div
                      className={`w-full h-full flex flex-col ${
                        isCircle ? 'items-center justify-center text-center' : 'justify-start text-left'
                      }`}
                      style={{
                        padding: `${safePad.padTop}px ${safePad.padRight}px ${safePad.padBottom}px ${safePad.padLeft}px`,
                        color: card.style.textColorHex,
                        fontFamily: "Inter, -apple-system, 'Segoe UI', sans-serif",
                      }}
                    >
                      {isEditing ? (
                        <textarea
                          autoFocus
                          value={card.text}
                          onChange={(e) => onUpdateCardText(card.id, e.target.value)}
                          onBlur={() => setEditingCardId(null)}
                          onClick={(e) => e.stopPropagation()}
                          placeholder="Type title on line 1, body on line 2..."
                          className={`w-full h-full resize-none bg-transparent outline-none ${
                            isCircle ? 'text-center' : 'text-left'
                          }`}
                          style={{
                            color: card.style.textColorHex,
                            fontSize: `${headlineSize}px`,
                            lineHeight: 1.3,
                            fontWeight: 600,
                          }}
                        />
                      ) : card.text.trim().length > 0 ? (
                        <>
                          <div
                            style={{
                              fontSize: `${headlineSize}px`,
                              lineHeight: 1.2,
                              fontWeight: 600,
                              letterSpacing: '-0.015em',
                            }}
                          >
                            {firstLine}
                          </div>
                          {restLines && (
                            <div
                              style={{
                                marginTop: `${Math.max(6, Math.round(headlineSize * 0.35))}px`,
                                fontSize: `${Math.max(13, Math.round(headlineSize * 0.66))}px`,
                                lineHeight: 1.45,
                                opacity: 0.82,
                                whiteSpace: 'pre-wrap',
                              }}
                            >
                              {restLines}
                            </div>
                          )}
                        </>
                      ) : (
                        <div
                          className="uppercase tracking-wider font-mono"
                          style={{
                            fontSize: `${Math.max(10, Math.round(headlineSize * 0.5))}px`,
                            opacity: 0.42,
                          }}
                        >
                          {card.contentHint ?? card.shapeName}
                        </div>
                      )}
                    </div>
                  </foreignObject>
                </g>

                {/* Lock Indicator */}
                {card.locked && (
                  <g
                    transform={`translate(${card.rect.left + card.rect.width - 28}, ${card.rect.top + 10})`}
                    pointerEvents="none"
                  >
                    <rect width={20} height={20} rx={4} fill="rgba(15,23,42,0.75)" />
                    <foreignObject x={3} y={3} width={14} height={14}>
                      <Lock className="w-3.5 h-3.5 text-amber-400" />
                    </foreignObject>
                  </g>
                )}

                {/* Selection or Image-Drop Highlight Ring */}
                {(isSelected || isDropTarget) && (
                  <>
                    {card.svgPath ? (
                      <path
                        d={card.svgPath}
                        transform={`translate(${card.rect.left} ${card.rect.top})`}
                        fill={isDropTarget ? 'rgba(37, 99, 235, 0.14)' : 'none'}
                        stroke={isDropTarget ? '#2563EB' : '#0EA5E9'}
                        strokeWidth={Math.max(2, 2.2 * uiScaleInv)}
                        strokeDasharray={isDropTarget ? '8 5' : undefined}
                        pointerEvents="none"
                      />
                    ) : (
                      <rect
                        x={card.rect.left}
                        y={card.rect.top}
                        width={card.rect.width}
                        height={card.rect.height}
                        rx={rx}
                        ry={rx}
                        fill={isDropTarget ? 'rgba(37, 99, 235, 0.14)' : 'none'}
                        stroke={isDropTarget ? '#2563EB' : '#0EA5E9'}
                        strokeWidth={Math.max(2, 2.2 * uiScaleInv)}
                        strokeDasharray={isDropTarget ? '8 5' : undefined}
                        pointerEvents="none"
                      />
                    )}
                  </>
                )}

                {/* Quick Card Action Pill on Single Selection */}
                {isSelected && snapshot.selectedCardIds.length === 1 && !isEditing && (
                  <foreignObject
                    x={Math.max(8, card.rect.left + card.rect.width - 74 * uiScaleInv)}
                    y={Math.max(8, card.rect.top + 8)}
                    width={68 * uiScaleInv}
                    height={30 * uiScaleInv}
                  >
                    <div
                      className="flex items-center justify-end gap-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        title="Upload image into card"
                        onClick={() => {
                          setUploadTargetCardId(card.id);
                          fileInputRef.current?.click();
                        }}
                        className="flex items-center justify-center rounded bg-zinc-950/85 text-white hover:bg-zinc-900 border border-white/15 cursor-pointer"
                        style={{
                          width: `${26 * uiScaleInv}px`,
                          height: `${26 * uiScaleInv}px`,
                        }}
                      >
                        <ImagePlus style={{ width: `${13 * uiScaleInv}px`, height: `${13 * uiScaleInv}px` }} />
                      </button>
                      <button
                        type="button"
                        title="Delete card"
                        onClick={() => onDeleteCard(card.id)}
                        className="flex items-center justify-center rounded bg-zinc-950/85 text-white hover:bg-red-600 border border-white/15 cursor-pointer"
                        style={{
                          width: `${26 * uiScaleInv}px`,
                          height: `${26 * uiScaleInv}px`,
                        }}
                      >
                        <Trash2 style={{ width: `${13 * uiScaleInv}px`, height: `${13 * uiScaleInv}px` }} />
                      </button>
                    </div>
                  </foreignObject>
                )}
              </g>
            );
          })}

          {/* Swiss Grid Lattice Overlay */}
          {showGridOverlay && bentoOverlays?.lattice && (
            <g pointerEvents="none" data-testid="studio-swiss-grid-overlay">
              {bentoOverlays.lattice.colBands.map((band) => (
                <g key={`sc-${band.index}`}>
                  <rect
                    x={band.start}
                    y={bentoOverlays.doc.anchorRect.top}
                    width={band.size}
                    height={bentoOverlays.doc.anchorRect.height}
                    fill={isDarkTheme ? 'rgba(244, 63, 94, 0.09)' : 'rgba(244, 63, 94, 0.055)'}
                    stroke={isDarkTheme ? 'rgba(244, 63, 94, 0.22)' : 'rgba(244, 63, 94, 0.16)'}
                    strokeWidth={1}
                  />
                  <text
                    x={band.start + band.size / 2}
                    y={Math.max(12, bentoOverlays.doc.anchorRect.top - 8)}
                    textAnchor="middle"
                    fontSize={badgeFontPx}
                    fontFamily="monospace"
                    fill={isDarkTheme ? 'rgba(251, 113, 133, 0.8)' : 'rgba(225, 29, 72, 0.7)'}
                  >
                    {band.index + 1}
                  </text>
                </g>
              ))}
              {bentoOverlays.lattice.rowBands.map((band) => (
                <rect
                  key={`sr-${band.index}`}
                  x={bentoOverlays.doc.anchorRect.left}
                  y={band.start}
                  width={bentoOverlays.doc.anchorRect.width}
                  height={band.size}
                  fill="none"
                  stroke={isDarkTheme ? 'rgba(56, 189, 248, 0.22)' : 'rgba(37, 99, 235, 0.18)'}
                  strokeWidth={1}
                  strokeDasharray="5 5"
                />
              ))}
            </g>
          )}

          {/* Direct On-Canvas Interactive Split-Gutter Handles */}
          {bentoOverlays &&
            bentoOverlays.handles.map((handle) => {
              const isDraggingThis = draggingGutter?.nodeId === handle.nodeId;
              const isHoveredThis = hoveredGutterId === handle.nodeId;
              const showVisual = isDraggingThis || isHoveredThis;
              const g = bentoOverlays.doc.params.gutterPt;

              if (handle.axis === 'vertical') {
                const centerX = handle.gutterRect.left + handle.gutterRect.width / 2;
                const hitW = Math.max(handle.gutterRect.width, 18 * uiScaleInv);
                const availW = Math.max(0, handle.parentRect.width - g);
                const w1 = Math.round(availW * handle.ratio);
                const w2 = Math.round(availW - w1);
                const midY = handle.gutterRect.top + handle.gutterRect.height / 2;

                return (
                  <g
                    key={`sg-${handle.nodeId}`}
                    className={handle.locked ? 'cursor-not-allowed' : 'cursor-col-resize'}
                    onMouseEnter={() => setHoveredGutterId(handle.nodeId)}
                    onMouseLeave={() => setHoveredGutterId(null)}
                    onPointerDown={(e) => handleGutterDown(e, handle, g)}
                    onPointerMove={handleGutterMove}
                    onPointerUp={handleGutterUp}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      if (!handle.locked) {
                        onResizeSplit(handle.nodeId, 0.5, true, true);
                      }
                    }}
                  >
                    <rect
                      x={centerX - hitW / 2}
                      y={handle.gutterRect.top}
                      width={hitW}
                      height={handle.gutterRect.height}
                      fill="transparent"
                    />
                    {showVisual && (
                      <g pointerEvents="none">
                        <line
                          x1={centerX}
                          y1={handle.gutterRect.top + 6}
                          x2={centerX}
                          y2={handle.gutterRect.top + handle.gutterRect.height - 6}
                          stroke={handle.locked ? '#D97706' : '#0EA5E9'}
                          strokeWidth={(isDraggingThis ? 3 : 2) * uiScaleInv}
                          strokeDasharray={handle.locked ? '6 4' : undefined}
                        />
                        <rect
                          x={centerX - 4.5 * uiScaleInv}
                          y={midY - 22 * uiScaleInv}
                          width={9 * uiScaleInv}
                          height={44 * uiScaleInv}
                          rx={4.5 * uiScaleInv}
                          fill={handle.locked ? '#D97706' : '#0EA5E9'}
                          stroke="#FFFFFF"
                          strokeWidth={1.5 * uiScaleInv}
                        />
                        {isDraggingThis && !handle.locked && (
                          <g>
                            <rect
                              x={centerX - 72 * uiScaleInv}
                              y={midY - 52 * uiScaleInv}
                              width={144 * uiScaleInv}
                              height={24 * uiScaleInv}
                              rx={4 * uiScaleInv}
                              fill="#09090B"
                            />
                            <text
                              x={centerX}
                              y={midY - 36 * uiScaleInv}
                              textAnchor="middle"
                              fontSize={badgeFontPx}
                              fontFamily="monospace"
                              fontWeight={600}
                              fill="#FFFFFF"
                            >
                              {w1} | {w2}px · {formatHarmonicBadge(handle.ratio)}
                            </text>
                          </g>
                        )}
                      </g>
                    )}
                  </g>
                );
              }

              const centerY = handle.gutterRect.top + handle.gutterRect.height / 2;
              const hitH = Math.max(handle.gutterRect.height, 18 * uiScaleInv);
              const availH = Math.max(0, handle.parentRect.height - g);
              const h1 = Math.round(availH * handle.ratio);
              const h2 = Math.round(availH - h1);
              const midX = handle.gutterRect.left + handle.gutterRect.width / 2;

              return (
                <g
                  key={`sg-${handle.nodeId}`}
                  className={handle.locked ? 'cursor-not-allowed' : 'cursor-row-resize'}
                  onMouseEnter={() => setHoveredGutterId(handle.nodeId)}
                  onMouseLeave={() => setHoveredGutterId(null)}
                  onPointerDown={(e) => handleGutterDown(e, handle, g)}
                  onPointerMove={handleGutterMove}
                  onPointerUp={handleGutterUp}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    if (!handle.locked) {
                      onResizeSplit(handle.nodeId, 0.5, true, true);
                    }
                  }}
                >
                  <rect
                    x={handle.gutterRect.left}
                    y={centerY - hitH / 2}
                    width={handle.gutterRect.width}
                    height={hitH}
                    fill="transparent"
                  />
                  {showVisual && (
                    <g pointerEvents="none">
                      <line
                        x1={handle.gutterRect.left + 6}
                        y1={centerY}
                        x2={handle.gutterRect.left + handle.gutterRect.width - 6}
                        y2={centerY}
                        stroke={handle.locked ? '#D97706' : '#0EA5E9'}
                        strokeWidth={(isDraggingThis ? 3 : 2) * uiScaleInv}
                        strokeDasharray={handle.locked ? '6 4' : undefined}
                      />
                      <rect
                        x={midX - 22 * uiScaleInv}
                        y={centerY - 4.5 * uiScaleInv}
                        width={44 * uiScaleInv}
                        height={9 * uiScaleInv}
                        rx={4.5 * uiScaleInv}
                        fill={handle.locked ? '#D97706' : '#0EA5E9'}
                        stroke="#FFFFFF"
                        strokeWidth={1.5 * uiScaleInv}
                      />
                      {isDraggingThis && !handle.locked && (
                        <g>
                          <rect
                            x={midX - 72 * uiScaleInv}
                            y={centerY - 34 * uiScaleInv}
                            width={144 * uiScaleInv}
                            height={24 * uiScaleInv}
                            rx={4 * uiScaleInv}
                            fill="#09090B"
                          />
                          <text
                            x={midX}
                            y={centerY - 18 * uiScaleInv}
                            textAnchor="middle"
                            fontSize={badgeFontPx}
                            fontFamily="monospace"
                            fontWeight={600}
                            fill="#FFFFFF"
                          >
                            {h1} | {h2}px · {formatHarmonicBadge(handle.ratio)}
                          </text>
                        </g>
                      )}
                    </g>
                  )}
                </g>
              );
            })}
        </svg>

        {/* Empty Artboard Callout */}
        {snapshot.cards.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 pointer-events-none">
            <div
              className="px-4 py-3 border text-xs max-w-xs"
              style={{
                backgroundColor: isDarkTheme ? 'rgba(24, 24, 27, 0.92)' : 'rgba(255, 255, 255, 0.94)',
                borderColor: isDarkTheme ? '#3F3F46' : '#D4D4D8',
                color: isDarkTheme ? '#E4E4E7' : '#27272A',
              }}
            >
              <p className="font-semibold">Artboard is empty</p>
              <p className="mt-1 opacity-75">
                Pick an Intent or Blueprint in the Mosaika panel on the right to generate a layout.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
