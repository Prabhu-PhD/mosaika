using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using Microsoft.Office.Core;
using Mosaika.PowerPointAddIn.Rpc;
using PowerPointInterop = Microsoft.Office.Interop.PowerPoint;

namespace Mosaika.PowerPointAddIn.PowerPoint
{
    /// <summary>
    /// Full PowerPoint COM implementation of IBentoHost (PRD Sections 4-7, Rules 4, 5, 6).
    /// All methods must be invoked on PowerPoint's main STA UI thread.
    /// </summary>
    public sealed class PowerPointAdapter : IPowerPointHostAdapter
    {
        private const float OffSlideOffsetPt = 24f;
        private const float StashMaxWidthPt = 216f;
        private const float StashRowStepPt = 108f;
        private const float StashTopStartPt = 24f;
        private const int PpEffectMorph = 3954; // PowerPoint Morph transition enum value

        private readonly PowerPointInterop.Application _app;

        public PowerPointAdapter(PowerPointInterop.Application app)
        {
            _app = app ?? throw new ArgumentNullException(nameof(app));
        }

        public HostCapabilitiesDto GetCapabilities()
        {
            return new HostCapabilitiesDto
            {
                Platform = "vsto",
                SupportsCornerRadius = true,
                SupportsNativeUndoGrouping = true,
                SupportsLiveThemeBinding = true,
                SupportsShadows = true,
                SupportsAutoMorph = true,
                SupportsSelectionEvents = true,
                SupportsImageCropScrim = true,
                SupportsSlideDuplication = true,
                SupportsCustomGeometry = true,
                SupportsMosaikafy = true,
                SupportsEntranceAnimations = true
            };
        }

        public SelectionContextDto GetSelectionContext()
        {
            var slide = GetActiveSlide(throwIfMissing: false);
            if (slide == null)
            {
                return new SelectionContextDto();
            }

            var pageSetup = _app.ActivePresentation.PageSetup;
            var ctx = new SelectionContextDto
            {
                SlideId = slide.SlideID.ToString(),
                SlideBounds = new RectPtDto
                {
                    Left = 0f,
                    Top = 0f,
                    Width = pageSetup.SlideWidth,
                    Height = pageSetup.SlideHeight
                }
            };

            var selectedShapes = GetSelectedShapes();
            ctx.SelectedShapeCount = selectedShapes.Count;

            string activeBentoId = null;
            foreach (var sh in selectedShapes)
            {
                string bid = GetTag(sh, BentoTagKeys.Id);
                if (!string.IsNullOrEmpty(bid))
                {
                    activeBentoId = bid;
                    break;
                }
            }

            if (!string.IsNullOrEmpty(activeBentoId))
            {
                ctx.ActiveBentoId = activeBentoId;

                int highestRev = -1;
                var seenSlots = new HashSet<string>(StringComparer.Ordinal);

                foreach (PowerPointInterop.Shape sh in slide.Shapes)
                {
                    if (GetTag(sh, BentoTagKeys.Id) != activeBentoId) continue;

                    string revRaw = GetTag(sh, BentoTagKeys.Rev);
                    string stateRaw = GetTag(sh, BentoTagKeys.State);
                    if (int.TryParse(revRaw, out int rev) && rev >= highestRev && !string.IsNullOrEmpty(stateRaw))
                    {
                        highestRev = rev;
                        ctx.HydratedStateJson = stateRaw;
                    }

                    string slotId = GetTag(sh, BentoTagKeys.SlotId);
                    if (!string.IsNullOrEmpty(slotId))
                    {
                        if (!seenSlots.Add(slotId))
                        {
                            ctx.HasDuplicateSlotConflict = true;
                        }
                        else
                        {
                            ctx.SurvivingSlotIds.Add(slotId);
                        }
                    }
                }

                foreach (var sh in selectedShapes)
                {
                    if (GetTag(sh, BentoTagKeys.Id) != activeBentoId) continue;
                    string slotId = GetTag(sh, BentoTagKeys.SlotId);
                    if (!string.IsNullOrEmpty(slotId))
                    {
                        ctx.SelectedSlotIds.Add(slotId);
                    }
                }

                return ctx;
            }

            // Single non-bento placeholder shape selected
            if (selectedShapes.Count == 1)
            {
                var sh = selectedShapes[0];
                ctx.SelectedShapeBounds = new RectPtDto
                {
                    Left = sh.Left,
                    Top = sh.Top,
                    Width = sh.Width,
                    Height = sh.Height
                };
            }
            else if (selectedShapes.Count >= 2)
            {
                ctx.SelectedShapes = new List<ExistingShapeSummaryDto>();
                foreach (var sh in selectedShapes)
                {
                    string txt = ReadShapeText(sh);
                    ctx.SelectedShapes.Add(new ExistingShapeSummaryDto
                    {
                        ShapeId = sh.Id.ToString(),
                        Rect = new RectPtDto
                        {
                            Left = sh.Left,
                            Top = sh.Top,
                            Width = sh.Width,
                            Height = sh.Height
                        },
                        TextLength = txt?.Length ?? 0,
                        HasImage = sh.Fill.Type == MsoFillType.msoFillPicture
                    });
                }
            }

            return ctx;
        }

        public int ApplyLayoutDiff(LayoutDiffPayloadDto diff)
        {
            var slide = GetActiveSlide(throwIfMissing: true);
            float slideWidth = _app.ActivePresentation.PageSetup.SlideWidth;

            // Rule 6: Wrap pointer-up / discrete mutations in a single native PowerPoint Undo entry
            if (diff.CommitUndoEntry)
            {
                _app.StartNewUndoEntry();
            }

            if (diff.DeletePlaceholderSelection)
            {
                foreach (var sh in GetSelectedShapes())
                {
                    if (string.IsNullOrEmpty(GetTag(sh, BentoTagKeys.Id)))
                    {
                        sh.Delete();
                    }
                }
            }

            var existingBySlot = FindBentoShapesBySlot(slide, diff.BentoId);

            // 1. Update surviving shapes in-place (preserving user text & imagery per Rule 4)
            foreach (var spec in diff.Update)
            {
                if (!existingBySlot.TryGetValue(spec.SlotId, out var shape)) continue;

                bool needsFreeformRebuild = RequiresGeometryRebuild(shape, spec);
                if (needsFreeformRebuild)
                {
                    string preservedText = ReadShapeText(shape);
                    var replacement = CreateCardShape(slide, spec);
                    if (!string.IsNullOrEmpty(preservedText))
                    {
                        replacement.TextFrame.TextRange.Text = preservedText;
                    }
                    CopyVisualFillAndBorder(shape, replacement);
                    shape.Delete();
                    existingBySlot[spec.SlotId] = replacement;
                }
                else
                {
                    UpdateCardShapeGeometry(shape, spec);
                }
            }

            // 2. Create new cards
            var createdShapes = new List<PowerPointInterop.Shape>();
            foreach (var spec in diff.Create)
            {
                var created = CreateCardShape(slide, spec);
                existingBySlot[spec.SlotId] = created;
                createdShapes.Add(created);
            }

            // 3. Retire removed slots non-destructively (Rule 4: delete empty, stash non-empty off-slide)
            int stashedCount = 0;
            int stashRow = CountExistingOffSlideShapes(slide, slideWidth);

            foreach (string slotId in diff.RetireSlotIds)
            {
                if (!existingBySlot.TryGetValue(slotId, out var shape)) continue;

                if (HasUserContent(shape))
                {
                    StripBentoTags(shape);
                    float scale = shape.Width > StashMaxWidthPt ? StashMaxWidthPt / shape.Width : 1f;
                    shape.Left = slideWidth + OffSlideOffsetPt;
                    shape.Top = StashTopStartPt + stashRow * StashRowStepPt;
                    shape.Width = Math.Min(StashMaxWidthPt, shape.Width);
                    shape.Height = Math.Max(72f, Math.Min(96f, shape.Height * scale));
                    shape.Name = $"Stashed ({slotId})";
                    stashRow++;
                    stashedCount++;
                }
                else
                {
                    shape.Delete();
                }

                existingBySlot.Remove(slotId);
            }

            // Keep newly created bento selected so live editing continues smoothly
            if (createdShapes.Count > 0 && diff.Update.Count == 0)
            {
                try
                {
                    createdShapes[0].Select(MsoTriState.msoTrue);
                }
                catch
                {
                    // Non-fatal if view is not in slide-edit mode
                }
            }

            return stashedCount;
        }

        public void ApplyStyle(string bentoId, StyleApplyPayloadDto payload)
        {
            var slide = GetActiveSlide(throwIfMissing: true);

            if (payload.CommitUndoEntry)
            {
                _app.StartNewUndoEntry();
            }

            var shapesBySlot = FindBentoShapesBySlot(slide, bentoId);
            foreach (var cellStyle in payload.Cells)
            {
                if (!shapesBySlot.TryGetValue(cellStyle.SlotId, out var shape)) continue;
                ApplyCellStyle(shape, cellStyle);
            }
        }

        public void SyncStyleFromSelected(string bentoId)
        {
            var slide = GetActiveSlide(throwIfMissing: true);
            var selected = GetSelectedShapes();
            PowerPointInterop.Shape source = null;

            foreach (var sh in selected)
            {
                if (GetTag(sh, BentoTagKeys.Id) == bentoId)
                {
                    source = sh;
                    break;
                }
            }

            if (source == null)
            {
                throw new InvalidOperationException("Select a card in the active Mosaika grid first.");
            }

            _app.StartNewUndoEntry();
            source.PickUp();

            foreach (PowerPointInterop.Shape sh in slide.Shapes)
            {
                if (sh.Id == source.Id) continue;
                if (GetTag(sh, BentoTagKeys.Id) != bentoId) continue;
                sh.Apply();
            }
        }

        public void SetImageSlot(string bentoId, string slotId, string imageBase64, bool addScrim)
        {
            var slide = GetActiveSlide(throwIfMissing: true);
            var shapesBySlot = FindBentoShapesBySlot(slide, bentoId);
            if (!shapesBySlot.TryGetValue(slotId, out var shape))
            {
                throw new InvalidOperationException($"Card \"{slotId}\" was not found on the active slide.");
            }

            _app.StartNewUndoEntry();

            string tempPath = WriteBase64ImageToTempFile(imageBase64);
            try
            {
                shape.Fill.UserPicture(tempPath);
                if (shape.HasTextFrame == MsoTriState.msoTrue)
                {
                    shape.TextFrame.TextRange.Font.Color.RGB = ColorUtils.HexToOleColor("#FFFFFF");
                    shape.TextFrame.TextRange.Font.Shadow = addScrim ? MsoTriState.msoTrue : MsoTriState.msoFalse;
                }
            }
            finally
            {
                try
                {
                    if (File.Exists(tempPath)) File.Delete(tempPath);
                }
                catch
                {
                    // Best-effort temp cleanup
                }
            }
        }

        public int GenerateMultiSlides(List<MultiSlideItemDto> items)
        {
            if (items == null || items.Count == 0) return 0;

            var sourceSlide = GetActiveSlide(throwIfMissing: true);
            var presentation = _app.ActivePresentation;
            int insertIndex = sourceSlide.SlideIndex;

            _app.StartNewUndoEntry();

            int createdCount = 0;
            foreach (var item in items)
            {
                // Duplicate active slide to preserve title, footer, background, and master chrome
                var dupRange = sourceSlide.Duplicate();
                var newSlide = dupRange[1];
                insertIndex++;
                newSlide.MoveTo(insertIndex);

                // Clear any existing Mosaika/Bento cards on the duplicated slide
                var toRemove = new List<PowerPointInterop.Shape>();
                foreach (PowerPointInterop.Shape sh in newSlide.Shapes)
                {
                    if (!string.IsNullOrEmpty(GetTag(sh, BentoTagKeys.Id)))
                    {
                        toRemove.Add(sh);
                    }
                }
                foreach (var sh in toRemove)
                {
                    sh.Delete();
                }

                // Render new variation cards
                var styleMap = new Dictionary<string, CellStyleSpecDto>(StringComparer.Ordinal);
                if (item.StylePayload?.Cells != null)
                {
                    foreach (var cs in item.StylePayload.Cells)
                    {
                        styleMap[cs.SlotId] = cs;
                    }
                }

                foreach (var spec in item.Cells)
                {
                    var card = CreateCardShape(newSlide, spec);
                    if (styleMap.TryGetValue(spec.SlotId, out var cs))
                    {
                        ApplyCellStyle(card, cs);
                    }
                }

                if (item.ApplyMorphTransition)
                {
                    try
                    {
                        newSlide.SlideShowTransition.EntryEffect = (PowerPointInterop.PpEntryEffect)PpEffectMorph;
                        newSlide.SlideShowTransition.Duration = 0.75f;
                    }
                    catch
                    {
                        // Gracefully ignore on older PowerPoint builds without Morph
                    }
                }

                createdCount++;
            }

            return createdCount;
        }

        public void ReorderReadingOrder(string bentoId, List<string> orderedSlotIds)
        {
            var slide = GetActiveSlide(throwIfMissing: true);
            var shapesBySlot = FindBentoShapesBySlot(slide, bentoId);

            _app.StartNewUndoEntry();

            foreach (string slotId in orderedSlotIds)
            {
                if (shapesBySlot.TryGetValue(slotId, out var shape))
                {
                    shape.ZOrder(MsoZOrderCmd.msoBringToFront);
                }
            }
        }

        public void DetachBento(string bentoId)
        {
            var slide = GetActiveSlide(throwIfMissing: true);
            var shapesBySlot = FindBentoShapesBySlot(slide, bentoId);

            _app.StartNewUndoEntry();

            foreach (var shape in shapesBySlot.Values)
            {
                StripBentoTags(shape);
            }
        }

        public int MosaikafySelection(MosaikafyPayloadDto payload)
        {
            if (payload == null) throw new ArgumentNullException(nameof(payload));
            var slide = GetActiveSlide(throwIfMissing: true);

            if (payload.CommitUndoEntry)
            {
                _app.StartNewUndoEntry();
            }

            var shapeById = new Dictionary<string, PowerPointInterop.Shape>(StringComparer.Ordinal);
            foreach (PowerPointInterop.Shape sh in slide.Shapes)
            {
                shapeById[sh.Id.ToString()] = sh;
            }

            var cellBySlot = new Dictionary<string, CellRenderSpecDto>(StringComparer.Ordinal);
            foreach (var cell in payload.Cells)
            {
                cellBySlot[cell.SlotId] = cell;
            }

            var styleBySlot = new Dictionary<string, CellStyleSpecDto>(StringComparer.Ordinal);
            if (payload.StylePayload?.Cells != null)
            {
                foreach (var st in payload.StylePayload.Cells)
                {
                    styleBySlot[st.SlotId] = st;
                }
            }

            int convertedCount = 0;
            PowerPointInterop.Shape firstConverted = null;

            foreach (var assignment in payload.Assignments)
            {
                if (!shapeById.TryGetValue(assignment.SourceShapeId, out var shape)) continue;
                if (!cellBySlot.TryGetValue(assignment.TargetSlotId, out var spec)) continue;

                // Non-destructively re-home existing slide shape into the computed Bento cell
                shape.Left = spec.Rect.Left;
                shape.Top = spec.Rect.Top;
                shape.Width = Math.Max(1f, spec.Rect.Width);
                shape.Height = Math.Max(1f, spec.Rect.Height);

                if (shape.Type == MsoShapeType.msoAutoShape)
                {
                    try
                    {
                        shape.AutoShapeType = GeometryBuilder.ResolveNativeAutoShapeType(spec.ShapeKind);
                        ApplySafeCornerAdjustment(shape, spec.CornerAdjustment, spec.ShapeKind);
                    }
                    catch
                    {
                        // Preserve exotic shape geometry if AutoShapeType cannot be reassigned
                    }
                }

                ConfigureDefaultTextFrame(shape);
                ApplyShapeMetadata(shape, spec);

                if (styleBySlot.TryGetValue(spec.SlotId, out var style))
                {
                    ApplyCellStyle(shape, style);
                }

                if (firstConverted == null)
                {
                    firstConverted = shape;
                }
                convertedCount += 1;
            }

            if (firstConverted != null)
            {
                firstConverted.Select(MsoTriState.msoTrue);
            }

            return convertedCount;
        }

        public void ApplyEntranceAnimations(string bentoId, EntranceAnimationSpecDto spec)
        {
            if (spec == null) throw new ArgumentNullException(nameof(spec));
            var slide = GetActiveSlide(throwIfMissing: true);
            var shapesBySlot = FindBentoShapesBySlot(slide, bentoId);
            if (shapesBySlot.Count == 0) return;

            _app.StartNewUndoEntry();

            var targetIds = new HashSet<int>();
            foreach (var sh in shapesBySlot.Values)
            {
                targetIds.Add(sh.Id);
            }

            // Clear existing MainSequence effects targeting these Bento shapes (reverse index loop)
            var mainSeq = slide.TimeLine.MainSequence;
            for (int i = mainSeq.Count; i >= 1; i--)
            {
                var eff = mainSeq[i];
                if (eff.Shape != null && targetIds.Contains(eff.Shape.Id))
                {
                    eff.Delete();
                }
            }

            if (string.IsNullOrEmpty(spec.Preset) || spec.Preset == "none")
            {
                return;
            }

            var effectType = ResolveAnimationEffect(spec.Preset);
            float duration = Math.Max(0.15f, Math.Min(2.0f, spec.DurationSec));
            float stagger = Math.Max(0.0f, Math.Min(1.0f, spec.StaggerSec));

            int idx = 0;
            foreach (string slotId in spec.OrderedSlotIds)
            {
                if (!shapesBySlot.TryGetValue(slotId, out var shape)) continue;

                var trigger = idx == 0
                    ? PowerPointInterop.MsoAnimTriggerType.msoAnimTriggerOnPageClick
                    : PowerPointInterop.MsoAnimTriggerType.msoAnimTriggerWithPrevious;

                var effect = mainSeq.AddEffect(
                    shape,
                    effectType,
                    PowerPointInterop.MsoAnimateByLevel.msoAnimateLevelNone,
                    trigger);

                effect.Timing.Duration = duration;
                effect.Timing.TriggerDelayTime = idx * stagger;

                if (spec.Preset == "wipe-editorial")
                {
                    try
                    {
                        effect.EffectParameters.Direction = PowerPointInterop.MsoAnimDirection.msoAnimDirectionLeft;
                    }
                    catch
                    {
                        // Ignore if effect does not support direction
                    }
                }

                idx += 1;
            }
        }

        private static PowerPointInterop.MsoAnimEffect ResolveAnimationEffect(string preset)
        {
            switch (preset)
            {
                case "rise-stagger":
                    return PowerPointInterop.MsoAnimEffect.msoAnimEffectFly;
                case "zoom-pop":
                    return PowerPointInterop.MsoAnimEffect.msoAnimEffectZoom;
                case "wipe-editorial":
                    return PowerPointInterop.MsoAnimEffect.msoAnimEffectWipe;
                case "fade-cascade":
                default:
                    return PowerPointInterop.MsoAnimEffect.msoAnimEffectFade;
            }
        }

        // --- Shape Creation & Geometry Helpers ---

        private static PowerPointInterop.Shape CreateCardShape(PowerPointInterop.Slide slide, CellRenderSpecDto spec)
        {
            PowerPointInterop.Shape shape;

            bool isCustomCutoutPath =
                !string.IsNullOrWhiteSpace(spec.SvgPath) &&
                (string.IsNullOrEmpty(spec.ShapeKind) || spec.ShapeKind == "rect");

            if (isCustomCutoutPath)
            {
                // L-Wrap concave corner or Center-Hub circular arc cutout -> native editable PowerPoint Freeform!
                shape = BuildFreeformShape(slide, spec.SvgPath, spec.Rect.Left, spec.Rect.Top);
            }
            else if (spec.ShapeKind == "circle")
            {
                float d = Math.Min(spec.Rect.Width, spec.Rect.Height);
                float left = spec.Rect.Left + (spec.Rect.Width - d) / 2f;
                float top = spec.Rect.Top + (spec.Rect.Height - d) / 2f;
                shape = slide.Shapes.AddShape(MsoAutoShapeType.msoShapeOval, left, top, d, d);
            }
            else
            {
                // Rule 5: Always RoundedRectangle for standard/pill cards; native AutoShapes for arch/leaf/chamfer
                var autoType = GeometryBuilder.ResolveNativeAutoShapeType(spec.ShapeKind);
                shape = slide.Shapes.AddShape(
                    autoType,
                    spec.Rect.Left,
                    spec.Rect.Top,
                    Math.Max(1f, spec.Rect.Width),
                    Math.Max(1f, spec.Rect.Height));

                ApplySafeCornerAdjustment(shape, spec.CornerAdjustment, spec.ShapeKind);
            }

            ConfigureDefaultTextFrame(shape);
            ApplyShapeMetadata(shape, spec);
            return shape;
        }

        private static PowerPointInterop.Shape BuildFreeformShape(
            PowerPointInterop.Slide slide,
            string svgPath,
            float offsetX,
            float offsetY)
        {
            var parsed = GeometryBuilder.ParseSvgPath(svgPath, offsetX, offsetY);
            var builder = slide.Shapes.BuildFreeform(MsoEditingType.msoEditingCorner, parsed.StartX, parsed.StartY);

            foreach (var seg in parsed.Segments)
            {
                if (seg.Kind == FreeformSegmentKind.Line)
                {
                    builder.AddNodes(
                        MsoSegmentType.msoSegmentLine,
                        MsoEditingType.msoEditingAuto,
                        seg.EndX,
                        seg.EndY);
                }
                else
                {
                    builder.AddNodes(
                        MsoSegmentType.msoSegmentCurve,
                        MsoEditingType.msoEditingCorner,
                        seg.X1,
                        seg.Y1,
                        seg.X2,
                        seg.Y2,
                        seg.EndX,
                        seg.EndY);
                }
            }

            return builder.ConvertToShape();
        }

        private static bool RequiresGeometryRebuild(PowerPointInterop.Shape existing, CellRenderSpecDto spec)
        {
            bool wantsFreeform =
                !string.IsNullOrWhiteSpace(spec.SvgPath) &&
                (string.IsNullOrEmpty(spec.ShapeKind) || spec.ShapeKind == "rect");

            if (wantsFreeform)
            {
                // Freeform paths (L-wrap / center-hub arc) always rebuild cleanly to reflect exact gutter/radius changes
                return true;
            }

            if (existing.Type == MsoShapeType.msoFreeform)
            {
                return true;
            }

            var targetAutoType = GeometryBuilder.ResolveNativeAutoShapeType(spec.ShapeKind);
            return existing.AutoShapeType != targetAutoType;
        }

        private static void UpdateCardShapeGeometry(PowerPointInterop.Shape shape, CellRenderSpecDto spec)
        {
            if (spec.ShapeKind == "circle")
            {
                float d = Math.Min(spec.Rect.Width, spec.Rect.Height);
                shape.Left = spec.Rect.Left + (spec.Rect.Width - d) / 2f;
                shape.Top = spec.Rect.Top + (spec.Rect.Height - d) / 2f;
                shape.Width = Math.Max(1f, d);
                shape.Height = Math.Max(1f, d);
            }
            else
            {
                shape.Left = spec.Rect.Left;
                shape.Top = spec.Rect.Top;
                shape.Width = Math.Max(1f, spec.Rect.Width);
                shape.Height = Math.Max(1f, spec.Rect.Height);
                ApplySafeCornerAdjustment(shape, spec.CornerAdjustment, spec.ShapeKind);
            }

            ApplyShapeMetadata(shape, spec);
        }

        private static void ApplySafeCornerAdjustment(PowerPointInterop.Shape shape, float adjustment, string shapeKind)
        {
            if (shapeKind == "circle") return;
            try
            {
                if (shape.Adjustments != null && shape.Adjustments.Count >= 1)
                {
                    // Rule 5: 1-based Adjustments[1] in VSTO/COM
                    shape.Adjustments[1] = GeometryBuilder.ClampCornerAdjustment(adjustment, shapeKind);
                }
            }
            catch
            {
                // Ignore if shape type doesn't expose adjustment 1
            }
        }

        private static void ConfigureDefaultTextFrame(PowerPointInterop.Shape shape)
        {
            if (shape.HasTextFrame != MsoTriState.msoTrue) return;
            var tf = shape.TextFrame;
            tf.MarginLeft = 14f;
            tf.MarginRight = 14f;
            tf.MarginTop = 12f;
            tf.MarginBottom = 12f;
            tf.WordWrap = MsoTriState.msoTrue;
            tf.AutoSize = PowerPointInterop.PpAutoSize.ppAutoSizeNone;
            tf.VerticalAnchor = MsoVerticalAnchor.msoAnchorTop;
        }

        private static void ApplyShapeMetadata(PowerPointInterop.Shape shape, CellRenderSpecDto spec)
        {
            if (!string.IsNullOrEmpty(spec.ShapeName))
            {
                shape.Name = spec.ShapeName;
            }
            if (spec.Tags != null)
            {
                foreach (var kvp in spec.Tags)
                {
                    shape.Tags.Add(kvp.Key, kvp.Value ?? string.Empty);
                }
            }
        }

        private static void ApplyCellStyle(PowerPointInterop.Shape shape, CellStyleSpecDto style)
        {
            // Don't overwrite picture fills on image slots
            if (shape.Fill.Type != MsoFillType.msoFillPicture)
            {
                if (string.IsNullOrEmpty(style.FillHex))
                {
                    shape.Fill.Visible = MsoTriState.msoFalse;
                }
                else
                {
                    shape.Fill.Visible = MsoTriState.msoTrue;
                    shape.Fill.Solid();

                    if (ColorUtils.TryMapThemeColor(style.ThemeFillSlot, out var themeColor))
                    {
                        shape.Fill.ForeColor.ObjectThemeColor = themeColor;
                        if (style.ThemeTintAndShade.HasValue)
                        {
                            shape.Fill.ForeColor.TintAndShade = style.ThemeTintAndShade.Value;
                        }
                    }
                    else
                    {
                        shape.Fill.ForeColor.RGB = ColorUtils.HexToOleColor(style.FillHex);
                    }
                }
            }

            if (string.IsNullOrEmpty(style.BorderColorHex) || style.BorderWeightPt <= 0f)
            {
                shape.Line.Visible = MsoTriState.msoFalse;
            }
            else
            {
                shape.Line.Visible = MsoTriState.msoTrue;
                shape.Line.ForeColor.RGB = ColorUtils.HexToOleColor(style.BorderColorHex);
                shape.Line.Weight = style.BorderWeightPt;
                shape.Line.Transparency = Math.Max(0f, Math.Min(1f, style.BorderTransparency));
                shape.Line.DashStyle = style.BorderDashed ? MsoLineDashStyle.msoLineDash : MsoLineDashStyle.msoLineSolid;
            }

            if (style.Shadow != null)
            {
                shape.Shadow.Visible = MsoTriState.msoTrue;
                shape.Shadow.Type = MsoShadowType.msoShadow21;
                shape.Shadow.Blur = style.Shadow.BlurPt;
                shape.Shadow.OffsetX = style.Shadow.OffsetXPt;
                shape.Shadow.OffsetY = style.Shadow.OffsetYPt;
                shape.Shadow.Transparency = Math.Max(0f, Math.Min(1f, style.Shadow.Transparency));
                shape.Shadow.ForeColor.RGB = ColorUtils.HexToOleColor(style.Shadow.ColorHex);
            }
            else
            {
                shape.Shadow.Visible = MsoTriState.msoFalse;
            }

            if (shape.HasTextFrame == MsoTriState.msoTrue && !string.IsNullOrEmpty(style.TextColorHex))
            {
                shape.TextFrame.TextRange.Font.Color.RGB = ColorUtils.HexToOleColor(style.TextColorHex);
            }
        }

        private static void CopyVisualFillAndBorder(PowerPointInterop.Shape source, PowerPointInterop.Shape target)
        {
            try
            {
                source.PickUp();
                target.Apply();
            }
            catch
            {
                // Ignore if PickUp/Apply isn't available on this shape state
            }
        }

        private static bool HasUserContent(PowerPointInterop.Shape shape)
        {
            if (shape.Fill.Type == MsoFillType.msoFillPicture)
            {
                return true;
            }
            return !string.IsNullOrWhiteSpace(ReadShapeText(shape));
        }

        private static string ReadShapeText(PowerPointInterop.Shape shape)
        {
            try
            {
                if (shape.HasTextFrame == MsoTriState.msoTrue && shape.TextFrame.HasText == MsoTriState.msoTrue)
                {
                    return shape.TextFrame.TextRange.Text ?? string.Empty;
                }
            }
            catch
            {
                // Ignore non-text shapes
            }
            return string.Empty;
        }

        private static int CountExistingOffSlideShapes(PowerPointInterop.Slide slide, float slideWidth)
        {
            int count = 0;
            foreach (PowerPointInterop.Shape sh in slide.Shapes)
            {
                if (sh.Left >= slideWidth + 10f)
                {
                    count++;
                }
            }
            return count;
        }

        private static string WriteBase64ImageToTempFile(string imageBase64)
        {
            string ext = ".png";
            string rawBase64 = imageBase64 ?? string.Empty;
            bool isSvg = false;

            int commaIdx = rawBase64.IndexOf(',');
            if (rawBase64.StartsWith("data:", StringComparison.OrdinalIgnoreCase) && commaIdx > 0)
            {
                string header = rawBase64.Substring(0, commaIdx).ToLowerInvariant();
                if (header.Contains("image/jpeg") || header.Contains("image/jpg")) ext = ".jpg";
                else if (header.Contains("image/svg+xml")) isSvg = true;
                rawBase64 = rawBase64.Substring(commaIdx + 1);
            }

            if (isSvg)
            {
                // PowerPoint Fill.UserPicture requires a raster image (.png/.jpg); rasterize sample artwork cleanly
                return CreateSampleLandscapePng();
            }

            byte[] bytes = Convert.FromBase64String(rawBase64);
            string tempPath = Path.Combine(Path.GetTempPath(), $"mosaika_{Guid.NewGuid():N}{ext}");
            File.WriteAllBytes(tempPath, bytes);
            return tempPath;
        }

        private static string CreateSampleLandscapePng()
        {
            string tempPath = Path.Combine(Path.GetTempPath(), $"mosaika_sample_{Guid.NewGuid():N}.png");
            using (var bmp = new Bitmap(800, 520))
            using (var g = Graphics.FromImage(bmp))
            {
                g.SmoothingMode = SmoothingMode.AntiAlias;
                using (var sky = new LinearGradientBrush(
                    new Point(0, 0),
                    new Point(800, 520),
                    Color.FromArgb(15, 23, 42),
                    Color.FromArgb(56, 189, 248)))
                {
                    g.FillRectangle(sky, 0, 0, 800, 520);
                }
                using (var sun = new SolidBrush(Color.FromArgb(225, 253, 230, 138)))
                {
                    g.FillEllipse(sun, 560, 80, 110, 110);
                }
                using (var ridge1 = new SolidBrush(Color.FromArgb(190, 15, 23, 42)))
                {
                    g.FillPolygon(ridge1, new[]
                    {
                        new Point(0, 410), new Point(200, 240), new Point(395, 375),
                        new Point(565, 210), new Point(800, 365), new Point(800, 520), new Point(0, 520)
                    });
                }
                using (var ridge2 = new SolidBrush(Color.FromArgb(225, 2, 6, 23)))
                {
                    g.FillPolygon(ridge2, new[]
                    {
                        new Point(0, 460), new Point(260, 320), new Point(465, 440),
                        new Point(660, 305), new Point(800, 415), new Point(800, 520), new Point(0, 520)
                    });
                }
                bmp.Save(tempPath, ImageFormat.Png);
            }
            return tempPath;
        }

        private PowerPointInterop.Slide GetActiveSlide(bool throwIfMissing)
        {
            try
            {
                var window = _app.ActiveWindow;
                if (window?.View?.Slide is PowerPointInterop.Slide slide)
                {
                    return slide;
                }
            }
            catch
            {
                // No active slide view
            }

            if (throwIfMissing)
            {
                throw new InvalidOperationException("No active PowerPoint slide is open.");
            }
            return null;
        }

        private List<PowerPointInterop.Shape> GetSelectedShapes()
        {
            var result = new List<PowerPointInterop.Shape>();
            try
            {
                var sel = _app.ActiveWindow?.Selection;
                if (sel != null && sel.Type == PowerPointInterop.PpSelectionType.ppSelectionShapes)
                {
                    foreach (PowerPointInterop.Shape sh in sel.ShapeRange)
                    {
                        result.Add(sh);
                    }
                }
            }
            catch
            {
                // No shapes selected
            }
            return result;
        }

        private static Dictionary<string, PowerPointInterop.Shape> FindBentoShapesBySlot(
            PowerPointInterop.Slide slide,
            string bentoId)
        {
            var map = new Dictionary<string, PowerPointInterop.Shape>(StringComparer.Ordinal);
            foreach (PowerPointInterop.Shape sh in slide.Shapes)
            {
                if (GetTag(sh, BentoTagKeys.Id) != bentoId) continue;
                string slotId = GetTag(sh, BentoTagKeys.SlotId);
                if (!string.IsNullOrEmpty(slotId) && !map.ContainsKey(slotId))
                {
                    map[slotId] = sh;
                }
            }
            return map;
        }

        private static string GetTag(PowerPointInterop.Shape shape, string key)
        {
            try
            {
                string val = shape.Tags[key];
                return string.IsNullOrEmpty(val) ? null : val;
            }
            catch
            {
                return null;
            }
        }

        private static void StripBentoTags(PowerPointInterop.Shape shape)
        {
            foreach (string key in BentoTagKeys.All)
            {
                try
                {
                    shape.Tags.Delete(key);
                }
                catch
                {
                    // Ignore missing tag
                }
            }
        }
    }
}
