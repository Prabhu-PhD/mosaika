import { useRef, useState } from 'react';
import type {
  BentoDocumentState,
  CellShapeKind,
  GridSystemId,
  HostCapabilities,
  SplitAxis,
} from '@bento/contract';
import {
  canMergeLeaves,
  CELL_SHAPE_KINDS,
  CELL_SHAPE_LABELS,
  computeCornerAdjustment,
  computeGridLattice,
  computeStylePayload,
  GRID_SYSTEMS,
  type MirrorDirection,
  resolveSplitHandles,
  resolveTreeLayout,
  resolveVisualCells,
  type ResolvedSplitHandle,
} from '@bento/core';
import {
  Columns2,
  Combine,
  FlipHorizontal2,
  FlipVertical2,
  Grid3x3,
  Image as ImageIcon,
  Lock,
  Rows2,
  Star,
  Trash2,
  Unlock,
  Upload,
  X,
} from 'lucide-react';

export interface MinimapProps {
  state: BentoDocumentState;
  capabilities: HostCapabilities;
  missingSlotIds: readonly string[];
  selectedSlotIds: readonly string[];
  isDarkTheme: boolean;
  onSelectSlots: (slotIds: string[]) => void;
  onToggleLock: (slotId: string) => void;
  onToggleHero: (slotId: string) => void;
  onSetShapeKind?: (slotId: string, shapeKind: CellShapeKind) => void;
  onSetImage: (slotId: string, imageBase64: string, addScrim: boolean) => void;
  onSplit: (slotId: string, axis: SplitAxis) => void;
  onMerge: (slotIdA: string, slotIdB: string) => void;
  onDelete: (slotId: string) => void;
  onSelectGridSystem?: (gridSystem: GridSystemId) => void;
  onMirror?: (direction: MirrorDirection) => void;
  onResizeSplit?: (nodeId: string, nextRatio: number, snapHarmonic: boolean) => void;
  onCommitResizeSplit?: () => void;
}

const SAMPLE_PHOTO_SVG =
  'data:image/svg+xml;base64,' +
  btoa(
    `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400">
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#0f172a"/>
          <stop offset="50%" stop-color="#1d4ed8"/>
          <stop offset="100%" stop-color="#38bdf8"/>
        </linearGradient>
      </defs>
      <rect width="600" height="400" fill="url(#sky)"/>
      <circle cx="465" cy="105" r="46" fill="#fde68a" opacity="0.88"/>
      <path d="M0 320 L150 185 L295 290 L425 160 L600 285 L600 400 L0 400 Z" fill="#0f172a" opacity="0.72"/>
      <path d="M0 355 L195 245 L350 340 L495 235 L600 320 L600 400 L0 400 Z" fill="#020617" opacity="0.85"/>
    </svg>`
  );

export function Minimap({
  state,
  capabilities,
  missingSlotIds,
  selectedSlotIds,
  isDarkTheme,
  onSelectSlots,
  onToggleLock,
  onToggleHero,
  onSetShapeKind,
  onSetImage,
  onSplit,
  onMerge,
  onDelete,
  onSelectGridSystem,
  onMirror,
  onResizeSplit,
  onCommitResizeSplit,
}: MinimapProps) {
  const [imagePickerOpen, setImagePickerOpen] = useState(false);
  const [addScrim, setAddScrim] = useState(true);
  const [showMinimapGuides, setShowMinimapGuides] = useState(true);
  const [hoveredSlotId, setHoveredSlotId] = useState<string | null>(null);
  const [hoveredHandleId, setHoveredHandleId] = useState<string | null>(null);
  const [draggingHandle, setDraggingHandle] = useState<{
    nodeId: string;
    axis: SplitAxis;
    parentRect: ResolvedSplitHandle['parentRect'];
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const resolved = resolveTreeLayout(state.tree, state.anchorRect, state.params.gutterPt);
  const visualCells = resolveVisualCells(state, {
    supportsCustomGeometry: capabilities.supportsCustomGeometry,
  });
  const splitHandles = resolveSplitHandles(state.tree, state.anchorRect, state.params.gutterPt);
  const gridLattice = computeGridLattice(
    state.anchorRect,
    state.params.gutterPt,
    state.params.gridSystem
  );
  const missingSet = new Set(missingSlotIds);
  const selectedSet = new Set(selectedSlotIds);

  const stylePayload = computeStylePayload(state, {
    supportsShadows: capabilities.supportsShadows,
    isDarkTheme,
    commitUndoEntry: false,
  });
  const styleMap = new Map(stylePayload.cells.map((c) => [c.slotId, c]));

  const anchor = state.anchorRect;
  const maxWidth = 280;
  const maxHeight = 126;
  const scale = Math.min(
    maxWidth / Math.max(1, anchor.width),
    maxHeight / Math.max(1, anchor.height)
  );
  const svgW = Math.max(64, Math.round(anchor.width * scale));
  const svgH = Math.max(46, Math.round(anchor.height * scale));

  const primarySelectedId = selectedSlotIds[0];
  const primaryResolved = primarySelectedId
    ? resolved.find((r) => r.leaf.slotId === primarySelectedId) ?? null
    : null;
  const primaryLeaf = primaryResolved?.leaf ?? null;

  const hoveredResolved = hoveredSlotId
    ? resolved.find((r) => r.leaf.slotId === hoveredSlotId) ?? null
    : null;

  const isPairSelected = selectedSlotIds.length === 2;
  const canMergePair =
    isPairSelected && canMergeLeaves(state.tree, selectedSlotIds[0]!, selectedSlotIds[1]!);

  const handleTileClick = (slotId: string, shiftKey: boolean) => {
    setImagePickerOpen(false);
    if (shiftKey && selectedSlotIds.length >= 1) {
      if (selectedSet.has(slotId)) {
        onSelectSlots(selectedSlotIds.filter((id) => id !== slotId));
      } else {
        const first = selectedSlotIds[0]!;
        onSelectSlots([first, slotId]);
      }
      return;
    }
    if (selectedSlotIds.length === 1 && selectedSlotIds[0] === slotId) {
      onSelectSlots([]);
    } else {
      onSelectSlots([slotId]);
    }
  };

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !primarySelectedId) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        onSetImage(
          primarySelectedId,
          reader.result,
          capabilities.supportsImageCropScrim ? addScrim : false
        );
        setImagePickerOpen(false);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const activeDragHandleObj = draggingHandle
    ? splitHandles.find((h) => h.nodeId === draggingHandle.nodeId) ?? null
    : null;

  const inspectedItem = hoveredResolved ?? primaryResolved;
  const readoutText = activeDragHandleObj
    ? `Split · ${Math.round(activeDragHandleObj.ratio * 100)}%`
    : inspectedItem
      ? `${inspectedItem.leaf.slotId.replace('slot_', '#')} · ${Math.round(inspectedItem.rect.width)}×${Math.round(inspectedItem.rect.height)}pt`
      : `${Math.round(anchor.width)}×${Math.round(anchor.height)}pt`;

  const clientToAnchorPt = (clientX: number, clientY: number): { x: number; y: number } | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const box = svg.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return null;
    return {
      x: anchor.left + ((clientX - box.left) / box.width) * anchor.width,
      y: anchor.top + ((clientY - box.top) / box.height) * anchor.height,
    };
  };

  const handleGutterPointerDown = (
    e: React.PointerEvent<SVGGElement>,
    handle: ResolvedSplitHandle
  ) => {
    if (handle.locked || !onResizeSplit) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDraggingHandle({
      nodeId: handle.nodeId,
      axis: handle.axis,
      parentRect: handle.parentRect,
    });
  };

  const handleGutterPointerMove = (e: React.PointerEvent<SVGGElement>) => {
    if (!draggingHandle || !onResizeSplit) return;
    e.stopPropagation();
    const pt = clientToAnchorPt(e.clientX, e.clientY);
    if (!pt) return;
    const g = state.params.gutterPt;
    const pr = draggingHandle.parentRect;
    const nextRatio =
      draggingHandle.axis === 'vertical'
        ? (pt.x - pr.left - g / 2) / Math.max(1, pr.width - g)
        : (pt.y - pr.top - g / 2) / Math.max(1, pr.height - g);
    onResizeSplit(draggingHandle.nodeId, nextRatio, !e.altKey);
  };

  const handleGutterPointerUp = (e: React.PointerEvent<SVGGElement>) => {
    if (!draggingHandle) return;
    e.stopPropagation();
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    setDraggingHandle(null);
    onCommitResizeSplit?.();
  };

  const inkStroke = isDarkTheme ? '#E6E9E7' : '#1B1D1E';

  return (
    <section
      className="border-b border-[var(--bento-border)] bg-[var(--bento-well)] px-3 py-2"
      aria-label="Layout Minimap"
    >
      <div className="mb-1.5 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-[var(--bento-fg-muted)]">
            Layout Map
          </span>
          {missingSlotIds.length > 0 && (
            <span className="rounded-[2px] border border-[var(--bento-warn-border)] bg-[var(--bento-warn-bg)] px-1 text-[9.5px] font-semibold text-[var(--bento-warn-text)]">
              {missingSlotIds.length} missing
            </span>
          )}
        </div>
        <span className="font-mono text-[10.5px] tabular-nums text-[var(--bento-fg-muted)]">
          {readoutText}
        </span>
      </div>

      {/* InfoGen Crisp Preview Frame (0px radius, 1px hairline border) */}
      <div
        className="flex items-center justify-center border border-[var(--bento-border)] bg-[var(--bento-bg)] p-2"
        style={{ maxHeight: 144 }}
      >
        <svg
          ref={svgRef}
          width={svgW}
          height={svgH}
          viewBox={`0 0 ${anchor.width} ${anchor.height}`}
          className="overflow-visible select-none"
          data-testid="bento-minimap-svg"
          onMouseLeave={() => {
            setHoveredSlotId(null);
            setHoveredHandleId(null);
          }}
        >
          {/* Subtle Swiss Modular Track Lattice Guides */}
          {showMinimapGuides && gridLattice && (
            <g pointerEvents="none" data-testid="minimap-grid-guides">
              {gridLattice.colBands.map((band) => (
                <rect
                  key={`mc-${band.index}`}
                  x={band.start - anchor.left}
                  y={0}
                  width={band.size}
                  height={anchor.height}
                  fill={isDarkTheme ? 'rgba(244, 63, 94, 0.08)' : 'rgba(244, 63, 94, 0.055)'}
                />
              ))}
              {gridLattice.horizontalCuts.map((cutY, idx) => (
                <line
                  key={`mr-${idx}`}
                  x1={0}
                  y1={cutY - anchor.top + gridLattice.gutterPt / 2}
                  x2={anchor.width}
                  y2={cutY - anchor.top + gridLattice.gutterPt / 2}
                  stroke={isDarkTheme ? 'rgba(244, 63, 94, 0.18)' : 'rgba(244, 63, 94, 0.14)'}
                  strokeWidth={0.75 / scale}
                />
              ))}
            </g>
          )}

          {visualCells.map((cell) => {
            const { rect } = cell;
            const x = rect.left - anchor.left;
            const y = rect.top - anchor.top;
            const isMissing = !cell.isOverlayCell && missingSet.has(cell.slotId);
            const isSelected = selectedSet.has(cell.slotId);
            const isHovered = hoveredSlotId === cell.slotId;
            const isHero = cell.role === 'hero';
            const isImage = cell.role === 'image';
            const cellStyle = styleMap.get(cell.slotId);
            const adj = capabilities.supportsCornerRadius
              ? computeCornerAdjustment(state.params.radiusPt, rect)
              : 0;
            const rx = adj * Math.min(rect.width, rect.height);

            // Monochrome Swiss clarity in minimap (Hero accent carries crisp ink or accent fill)
            const isAccentHero =
              isHero &&
              state.params.hierarchyMode === 'hero-accent' &&
              state.params.stylePreset !== 'wireframe';

            let tileFill: string;
            if (isMissing) {
              tileFill = isDarkTheme ? 'rgba(163, 42, 30, 0.22)' : 'rgba(163, 42, 30, 0.08)';
            } else if (isAccentHero) {
              tileFill = isDarkTheme ? '#E6E9E7' : '#1B1D1E';
            } else if (isHero) {
              tileFill = isDarkTheme ? '#282E2C' : '#E6E8E6';
            } else if (isImage) {
              tileFill = isDarkTheme ? '#222A2D' : '#E7EEF0';
            } else if (cellStyle?.fillHex === '#18181B') {
              tileFill = '#222526';
            } else {
              tileFill = isDarkTheme ? '#1C201F' : '#F4F5F4';
            }

            let tileStroke: string;
            if (isMissing) {
              tileStroke = '#A32A1E';
            } else if (isSelected) {
              tileStroke = inkStroke;
            } else if (isHovered) {
              tileStroke = inkStroke;
            } else if (cell.locked) {
              tileStroke = '#C98A1A';
            } else {
              tileStroke = isDarkTheme ? '#3D4441' : '#B9BDBB';
            }

            const strokeWidth = isSelected
              ? 2.2 / scale
              : isMissing
                ? 1.6 / scale
                : isHovered || cell.locked
                  ? 1.4 / scale
                  : 1 / scale;

            const iconUnit = 1 / scale;
            const tileMinPx = Math.min(rect.width * scale, rect.height * scale);
            const showHeroPill = isHero && !isMissing && !cell.isOverlayCell && tileMinPx >= 26;
            const showLockBadge = cell.locked && !isMissing;
            const pad = 5 * iconUnit;

            return (
              <g
                key={cell.slotId}
                onClick={(e) => {
                  if (!cell.isOverlayCell) {
                    handleTileClick(cell.slotId, e.shiftKey);
                  }
                }}
                onMouseEnter={() => {
                  if (!cell.isOverlayCell) {
                    setHoveredSlotId(cell.slotId);
                  }
                }}
                className={cell.isOverlayCell ? '' : 'cursor-pointer'}
                data-testid={`minimap-tile-${cell.slotId}`}
              >
                {cell.svgPath ? (
                  <path
                    d={cell.svgPath}
                    transform={`translate(${x} ${y})`}
                    fill={tileFill}
                    stroke={tileStroke}
                    strokeWidth={strokeWidth}
                    strokeDasharray={isMissing ? `${5 * iconUnit} ${3.5 * iconUnit}` : undefined}
                  />
                ) : (
                  <rect
                    x={x}
                    y={y}
                    width={Math.max(1, rect.width)}
                    height={Math.max(1, rect.height)}
                    rx={rx}
                    ry={rx}
                    fill={tileFill}
                    stroke={tileStroke}
                    strokeWidth={strokeWidth}
                    strokeDasharray={isMissing ? `${5 * iconUnit} ${3.5 * iconUnit}` : undefined}
                  />
                )}

                {/* Hero Badge */}
                {showHeroPill && (
                  <g pointerEvents="none">
                    <rect
                      x={x + pad}
                      y={y + pad}
                      width={rect.width * scale >= 54 ? 36 * iconUnit : 16 * iconUnit}
                      height={14 * iconUnit}
                      rx={2 * iconUnit}
                      fill={
                        isAccentHero
                          ? isDarkTheme
                            ? 'rgba(17,19,19,0.22)'
                            : 'rgba(255,255,255,0.2)'
                          : isDarkTheme
                            ? '#E6E9E7'
                            : '#1B1D1E'
                      }
                    />
                    <text
                      x={x + pad + (rect.width * scale >= 54 ? 18 * iconUnit : 8 * iconUnit)}
                      y={y + pad + 7.3 * iconUnit}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize={7.2 * iconUnit}
                      fontWeight={700}
                      letterSpacing={0.3 * iconUnit}
                      fill={
                        isAccentHero
                          ? isDarkTheme
                            ? '#111313'
                            : '#FFFFFF'
                          : isDarkTheme
                            ? '#111313'
                            : '#FFFFFF'
                      }
                    >
                      {rect.width * scale >= 54 ? '★ HERO' : '★'}
                    </text>
                  </g>
                )}

                {/* Image Badge */}
                {isImage && !isMissing && tileMinPx >= 24 && (
                  <g pointerEvents="none">
                    <rect
                      x={x + pad}
                      y={y + pad}
                      width={26 * iconUnit}
                      height={14 * iconUnit}
                      rx={2 * iconUnit}
                      fill={inkStroke}
                    />
                    <text
                      x={x + pad + 13 * iconUnit}
                      y={y + pad + 7.3 * iconUnit}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize={7 * iconUnit}
                      fontWeight={700}
                      fill={isDarkTheme ? '#111313' : '#FFFFFF'}
                    >
                      IMG
                    </text>
                  </g>
                )}

                {/* Crisp Padlock Badge (top-right, manuscript amber) */}
                {showLockBadge && (
                  <g
                    pointerEvents="none"
                    transform={`translate(${x + rect.width - 17 * iconUnit}, ${y + 4 * iconUnit}) scale(${iconUnit})`}
                  >
                    <rect x={0} y={0} width={13} height={13} rx={2} fill="#C98A1A" />
                    <path
                      d="M4.5 6V4.8a2 2 0 1 1 4 0V6M3.8 6h5.4c.44 0 .8.36.8.8v2.9c0 .44-.36.8-.8.8H3.8a.8.8 0 0 1-.8-.8V6.8c0-.44.36-.8.8-.8Z"
                      fill="none"
                      stroke="#FFFFFF"
                      strokeWidth={1.15}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </g>
                )}

                {/* Missing/Deleted Slot Warning Icon */}
                {isMissing && (
                  <g pointerEvents="none">
                    <circle
                      cx={x + rect.width * 0.5}
                      cy={y + rect.height * 0.5}
                      r={8 * iconUnit}
                      fill="#A32A1E"
                    />
                    <text
                      x={x + rect.width * 0.5}
                      y={y + rect.height * 0.5 + 0.5 * iconUnit}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize={9.5 * iconUnit}
                      fontWeight={800}
                      fill="#FFFFFF"
                    >
                      !
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {/* Draggable Gutter Splitter Handles inside Minimap */}
          {onResizeSplit &&
            splitHandles.map((handle) => {
              const iconUnit = 1 / scale;
              const isActive =
                draggingHandle?.nodeId === handle.nodeId || hoveredHandleId === handle.nodeId;

              if (handle.axis === 'vertical') {
                const centerX = handle.gutterRect.left - anchor.left + handle.gutterRect.width / 2;
                const topY = handle.gutterRect.top - anchor.top;
                const h = handle.gutterRect.height;
                const hitW = Math.max(handle.gutterRect.width, 8 * iconUnit);
                return (
                  <g
                    key={`mh-${handle.nodeId}`}
                    data-testid={`minimap-gutter-${handle.nodeId}`}
                    className={handle.locked ? 'cursor-not-allowed' : 'cursor-col-resize'}
                    onMouseEnter={() => setHoveredHandleId(handle.nodeId)}
                    onMouseLeave={() => setHoveredHandleId(null)}
                    onPointerDown={(e) => handleGutterPointerDown(e, handle)}
                    onPointerMove={handleGutterPointerMove}
                    onPointerUp={handleGutterPointerUp}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      if (!handle.locked) {
                        onResizeSplit(handle.nodeId, 0.5, true);
                        onCommitResizeSplit?.();
                      }
                    }}
                  >
                    <rect
                      x={centerX - hitW / 2}
                      y={topY}
                      width={hitW}
                      height={h}
                      fill="transparent"
                    />
                    {isActive && !handle.locked && (
                      <g pointerEvents="none">
                        <line
                          x1={centerX}
                          y1={topY + 2 * iconUnit}
                          x2={centerX}
                          y2={topY + h - 2 * iconUnit}
                          stroke={inkStroke}
                          strokeWidth={1.8 * iconUnit}
                        />
                        <rect
                          x={centerX - 2 * iconUnit}
                          y={topY + h / 2 - 7 * iconUnit}
                          width={4 * iconUnit}
                          height={14 * iconUnit}
                          rx={1 * iconUnit}
                          fill={inkStroke}
                        />
                      </g>
                    )}
                  </g>
                );
              }

              const leftX = handle.gutterRect.left - anchor.left;
              const centerY = handle.gutterRect.top - anchor.top + handle.gutterRect.height / 2;
              const w = handle.gutterRect.width;
              const hitH = Math.max(handle.gutterRect.height, 8 * iconUnit);
              return (
                <g
                  key={`mh-${handle.nodeId}`}
                  data-testid={`minimap-gutter-${handle.nodeId}`}
                  className={handle.locked ? 'cursor-not-allowed' : 'cursor-row-resize'}
                  onMouseEnter={() => setHoveredHandleId(handle.nodeId)}
                  onMouseLeave={() => setHoveredHandleId(null)}
                  onPointerDown={(e) => handleGutterPointerDown(e, handle)}
                  onPointerMove={handleGutterPointerMove}
                  onPointerUp={handleGutterPointerUp}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    if (!handle.locked) {
                      onResizeSplit(handle.nodeId, 0.5, true);
                      onCommitResizeSplit?.();
                    }
                  }}
                >
                  <rect
                    x={leftX}
                    y={centerY - hitH / 2}
                    width={w}
                    height={hitH}
                    fill="transparent"
                  />
                  {isActive && !handle.locked && (
                    <g pointerEvents="none">
                      <line
                        x1={leftX + 2 * iconUnit}
                        y1={centerY}
                        x2={leftX + w - 2 * iconUnit}
                        y2={centerY}
                        stroke={inkStroke}
                        strokeWidth={1.8 * iconUnit}
                      />
                      <rect
                        x={leftX + w / 2 - 7 * iconUnit}
                        y={centerY - 2 * iconUnit}
                        width={14 * iconUnit}
                        height={4 * iconUnit}
                        rx={1 * iconUnit}
                        fill={inkStroke}
                      />
                    </g>
                  )}
                </g>
              );
            })}
        </svg>
      </div>

      {/* InfoGen Crisp Segmented Grid Strip (12x6 | 6x4 | 4x3 | Free) + Flip H/V + Guides */}
      {onSelectGridSystem && (
        <div className="mt-1.5 flex items-center justify-between gap-1.5">
          <div
            role="radiogroup"
            aria-label="Swiss Modular Grid System"
            className="bento-segmented flex-1 grid-cols-4"
          >
            {GRID_SYSTEMS.map((sys) => {
              const active = state.params.gridSystem === sys.id;
              return (
                <button
                  key={sys.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  data-testid={`grid-system-${sys.id}`}
                  title={sys.description}
                  onClick={() => onSelectGridSystem(sys.id)}
                  className={`bento-seg-btn font-mono text-[10px] ${active ? 'is-active' : ''}`}
                >
                  {sys.label}
                </button>
              );
            })}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {onMirror && (
              <>
                <button
                  type="button"
                  onClick={() => onMirror('horizontal')}
                  title="Flip layout horizontally (Left ↔ Right)"
                  aria-label="Flip horizontally"
                  data-testid="btn-flip-h"
                  className="flex h-[26px] w-[26px] items-center justify-center rounded-[2px] border border-[var(--bento-border-strong)] bg-[var(--bento-bg)] text-[var(--bento-fg)] transition-colors hover:bg-[var(--bento-accent-soft)]"
                >
                  <FlipHorizontal2 className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => onMirror('vertical')}
                  title="Flip layout vertically (Top ↕ Bottom)"
                  aria-label="Flip vertically"
                  data-testid="btn-flip-v"
                  className="flex h-[26px] w-[26px] items-center justify-center rounded-[2px] border border-[var(--bento-border-strong)] bg-[var(--bento-bg)] text-[var(--bento-fg)] transition-colors hover:bg-[var(--bento-accent-soft)]"
                >
                  <FlipVertical2 className="h-3 w-3" />
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => setShowMinimapGuides((v) => !v)}
              disabled={state.params.gridSystem === 'free'}
              title={showMinimapGuides ? 'Hide minimap grid guides' : 'Show minimap grid guides'}
              aria-label="Toggle minimap grid guides"
              data-testid="btn-toggle-minimap-guides"
              className={`flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[2px] border transition-colors disabled:opacity-35 ${
                showMinimapGuides && state.params.gridSystem !== 'free'
                  ? 'border-[var(--bento-fg)] bg-[var(--bento-fg)] text-[var(--bento-accent-fg)]'
                  : 'border-[var(--bento-border-strong)] bg-[var(--bento-bg)] text-[var(--bento-fg)] hover:bg-[var(--bento-accent-soft)]'
              }`}
            >
              <Grid3x3 className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}

      {/* Sharp Single-Row 6-Action Tile Dock */}
      {primaryLeaf && !isPairSelected && (
        <div
          data-testid="minimap-tile-toolbar"
          className="mt-1.5 grid grid-cols-6 border border-[var(--bento-border-strong)] bg-[var(--bento-bg)]"
        >
          <button
            type="button"
            onClick={() => onToggleLock(primaryLeaf.slotId)}
            data-testid="tile-btn-lock"
            title={primaryLeaf.locked ? 'Unlock card position' : 'Lock card position'}
            className={`flex flex-col items-center justify-center gap-0.5 py-1.5 text-[9.5px] font-medium transition-colors ${
              primaryLeaf.locked
                ? 'bg-[var(--bento-warn-bg)] text-[var(--bento-warn-text)]'
                : 'text-[var(--bento-fg)] hover:bg-[var(--bento-well)]'
            }`}
          >
            {primaryLeaf.locked ? (
              <Lock className="h-3 w-3" strokeWidth={2.2} />
            ) : (
              <Unlock className="h-3 w-3 text-[var(--bento-fg-muted)]" />
            )}
            <span>{primaryLeaf.locked ? 'Locked' : 'Lock'}</span>
          </button>

          <button
            type="button"
            onClick={() => onToggleHero(primaryLeaf.slotId)}
            data-testid="tile-btn-hero"
            title="Toggle Hero emphasis"
            className={`flex flex-col items-center justify-center gap-0.5 border-l border-[var(--bento-border)] py-1.5 text-[9.5px] font-medium transition-colors ${
              primaryLeaf.role === 'hero'
                ? 'bg-[var(--bento-fg)] text-[var(--bento-accent-fg)]'
                : 'text-[var(--bento-fg)] hover:bg-[var(--bento-well)]'
            }`}
          >
            <Star
              className="h-3 w-3"
              fill={primaryLeaf.role === 'hero' ? 'currentColor' : 'none'}
            />
            <span>Hero</span>
          </button>

          <button
            type="button"
            onClick={() => setImagePickerOpen((prev) => !prev)}
            data-testid="tile-btn-image"
            title="Set Image slot"
            className={`flex flex-col items-center justify-center gap-0.5 border-l border-[var(--bento-border)] py-1.5 text-[9.5px] font-medium transition-colors ${
              primaryLeaf.role === 'image' || imagePickerOpen
                ? 'bg-[var(--bento-fg)] text-[var(--bento-accent-fg)]'
                : 'text-[var(--bento-fg)] hover:bg-[var(--bento-well)]'
            }`}
          >
            <ImageIcon className="h-3 w-3" />
            <span>Image</span>
          </button>

          <button
            type="button"
            onClick={() => onSplit(primaryLeaf.slotId, 'vertical')}
            data-testid="tile-btn-split-v"
            title="Split Vertically (Left | Right)"
            className="flex flex-col items-center justify-center gap-0.5 border-l border-[var(--bento-border)] py-1.5 text-[9.5px] font-medium text-[var(--bento-fg)] transition-colors hover:bg-[var(--bento-well)]"
          >
            <Columns2 className="h-3 w-3 text-[var(--bento-fg-muted)]" />
            <span>Split V</span>
          </button>

          <button
            type="button"
            onClick={() => onSplit(primaryLeaf.slotId, 'horizontal')}
            data-testid="tile-btn-split-h"
            title="Split Horizontally (Top / Bottom)"
            className="flex flex-col items-center justify-center gap-0.5 border-l border-[var(--bento-border)] py-1.5 text-[9.5px] font-medium text-[var(--bento-fg)] transition-colors hover:bg-[var(--bento-well)]"
          >
            <Rows2 className="h-3 w-3 text-[var(--bento-fg-muted)]" />
            <span>Split H</span>
          </button>

          <button
            type="button"
            onClick={() => onDelete(primaryLeaf.slotId)}
            data-testid="tile-btn-delete"
            title="Delete card and reflow"
            style={{ color: 'var(--bento-danger)' }}
            className="flex flex-col items-center justify-center gap-0.5 border-l border-[var(--bento-border)] py-1.5 text-[9.5px] font-medium transition-colors hover:bg-[var(--bento-well)]"
          >
            <Trash2 className="h-3 w-3" />
            <span>Delete</span>
          </button>
        </div>
      )}

      {/* Capability-Gated Per-Tile Shape Strip (Rect | Pill | Circle | Arch | Leaf | Chamfer) */}
      {primaryLeaf && !isPairSelected && capabilities.supportsCustomGeometry && onSetShapeKind && (
        <div
          role="radiogroup"
          aria-label="Selected card shape"
          data-testid="tile-shape-strip"
          className="mt-1 grid grid-cols-6 border border-[var(--bento-border-strong)] bg-[var(--bento-bg)]"
        >
          {CELL_SHAPE_KINDS.map((kind, idx) => {
            const active = (primaryLeaf.shapeKind ?? 'rect') === kind;
            return (
              <button
                key={kind}
                type="button"
                role="radio"
                aria-checked={active}
                data-testid={`tile-shape-${kind}`}
                title={`Set card shape to ${CELL_SHAPE_LABELS[kind]}`}
                onClick={() => onSetShapeKind(primaryLeaf.slotId, kind)}
                className={`py-1 text-center text-[9.5px] font-medium transition-colors ${
                  idx > 0 ? 'border-l border-[var(--bento-border)]' : ''
                } ${
                  active
                    ? 'bg-[var(--bento-fg)] text-[var(--bento-accent-fg)]'
                    : 'text-[var(--bento-fg-muted)] hover:bg-[var(--bento-well)] hover:text-[var(--bento-fg)]'
                }`}
              >
                {CELL_SHAPE_LABELS[kind]}
              </button>
            );
          })}
        </div>
      )}

      {/* Image Slot Inline Picker */}
      {primaryLeaf && imagePickerOpen && !isPairSelected && (
        <div className="mt-1.5 space-y-1.5 border border-[var(--bento-border-strong)] bg-[var(--bento-bg)] p-2">
          <div className="flex items-center gap-1.5">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelected}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex h-7 flex-1 items-center justify-center gap-1 rounded-[2px] border border-[var(--bento-border-strong)] bg-[var(--bento-bg)] px-2 text-[11px] font-medium text-[var(--bento-fg)] hover:bg-[var(--bento-well)]"
            >
              <Upload className="h-3 w-3" />
              <span>Choose File</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onSetImage(
                  primaryLeaf.slotId,
                  SAMPLE_PHOTO_SVG,
                  capabilities.supportsImageCropScrim ? addScrim : false
                );
                setImagePickerOpen(false);
              }}
              className="flex h-7 flex-1 items-center justify-center gap-1 rounded-[2px] bg-[var(--bento-fg)] px-2 text-[11px] font-semibold text-[var(--bento-accent-fg)] hover:opacity-90"
            >
              <span>Sample Photo</span>
            </button>
          </div>

          {capabilities.supportsImageCropScrim && (
            <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-[var(--bento-fg-muted)]">
              <input
                type="checkbox"
                checked={addScrim}
                onChange={(e) => setAddScrim(e.target.checked)}
                className="h-3.5 w-3.5 accent-[var(--bento-fg)]"
              />
              <span>Add bottom caption gradient scrim</span>
            </label>
          )}
        </div>
      )}

      {/* Shift+Click Pair Merge Bar */}
      {isPairSelected && (
        <div
          data-testid="minimap-merge-toolbar"
          className="mt-1.5 flex items-center justify-between gap-2 border border-[var(--bento-border-strong)] bg-[var(--bento-bg)] px-2.5 py-1.5"
        >
          <span className="truncate text-[11px] font-medium text-[var(--bento-fg)]">
            {canMergePair ? 'Paired siblings' : 'Non-adjacent cards'}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={!canMergePair}
              onClick={() => onMerge(selectedSlotIds[0]!, selectedSlotIds[1]!)}
              data-testid="tile-btn-merge"
              title={
                canMergePair
                  ? 'Merge selected sibling cards'
                  : 'Only adjacent paired boxes can be merged'
              }
              className="flex h-6 items-center gap-1 rounded-[2px] bg-[var(--bento-fg)] px-2 text-[10.5px] font-semibold text-[var(--bento-accent-fg)] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-35"
            >
              <Combine className="h-3 w-3" />
              <span>Merge</span>
            </button>
            <button
              type="button"
              onClick={() => onSelectSlots([])}
              aria-label="Clear selection"
              className="flex h-6 w-6 items-center justify-center rounded-[2px] border border-[var(--bento-border)] text-[var(--bento-fg-muted)] hover:bg-[var(--bento-well)] hover:text-[var(--bento-fg)]"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}

      {!primaryLeaf && !isPairSelected && (
        <p className="mt-1.5 text-[10.5px] leading-tight text-[var(--bento-fg-muted)]">
          Click tile to edit · Drag gutters to resize · Shift+Click to merge
        </p>
      )}
    </section>
  );
}
