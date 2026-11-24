using System.Collections.Generic;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace Mosaika.PowerPointAddIn.Rpc
{
    public static class BentoTagKeys
    {
        public const string Schema = "BENTO_SCHEMA";
        public const string Id = "BENTO_ID";
        public const string SlotId = "BENTO_SLOT_ID";
        public const string Rev = "BENTO_REV";
        public const string State = "BENTO_STATE";

        public static readonly string[] All = { Schema, Id, SlotId, Rev, State };
    }

    public sealed class RectPtDto
    {
        [JsonProperty("left")] public float Left { get; set; }
        [JsonProperty("top")] public float Top { get; set; }
        [JsonProperty("width")] public float Width { get; set; }
        [JsonProperty("height")] public float Height { get; set; }
    }

    public sealed class HostCapabilitiesDto
    {
        [JsonProperty("platform")] public string Platform { get; set; } = "vsto";
        [JsonProperty("supportsCornerRadius")] public bool SupportsCornerRadius { get; set; } = true;
        [JsonProperty("supportsNativeUndoGrouping")] public bool SupportsNativeUndoGrouping { get; set; } = true;
        [JsonProperty("supportsLiveThemeBinding")] public bool SupportsLiveThemeBinding { get; set; } = true;
        [JsonProperty("supportsShadows")] public bool SupportsShadows { get; set; } = true;
        [JsonProperty("supportsAutoMorph")] public bool SupportsAutoMorph { get; set; } = true;
        [JsonProperty("supportsSelectionEvents")] public bool SupportsSelectionEvents { get; set; } = true;
        [JsonProperty("supportsImageCropScrim")] public bool SupportsImageCropScrim { get; set; } = true;
        [JsonProperty("supportsSlideDuplication")] public bool SupportsSlideDuplication { get; set; } = true;
        [JsonProperty("supportsCustomGeometry")] public bool SupportsCustomGeometry { get; set; } = true;
        [JsonProperty("supportsMosaikafy")] public bool SupportsMosaikafy { get; set; } = true;
        [JsonProperty("supportsEntranceAnimations")] public bool SupportsEntranceAnimations { get; set; } = true;
    }

    public sealed class ExistingShapeSummaryDto
    {
        [JsonProperty("shapeId")] public string ShapeId { get; set; } = string.Empty;
        [JsonProperty("rect")] public RectPtDto Rect { get; set; } = new RectPtDto();
        [JsonProperty("textLength")] public int TextLength { get; set; }
        [JsonProperty("hasImage")] public bool HasImage { get; set; }
    }

    public sealed class SelectionContextDto
    {
        [JsonProperty("slideId")] public string SlideId { get; set; } = string.Empty;
        [JsonProperty("slideBounds")] public RectPtDto SlideBounds { get; set; } = new RectPtDto { Width = 960f, Height = 540f };
        [JsonProperty("selectedShapeCount")] public int SelectedShapeCount { get; set; }
        [JsonProperty("selectedShapeBounds", NullValueHandling = NullValueHandling.Ignore)] public RectPtDto SelectedShapeBounds { get; set; }
        [JsonProperty("selectedShapes", NullValueHandling = NullValueHandling.Ignore)] public List<ExistingShapeSummaryDto> SelectedShapes { get; set; }
        [JsonProperty("activeBentoId", NullValueHandling = NullValueHandling.Ignore)] public string ActiveBentoId { get; set; }
        [JsonProperty("hydratedStateJson", NullValueHandling = NullValueHandling.Ignore)] public string HydratedStateJson { get; set; }
        [JsonProperty("survivingSlotIds")] public List<string> SurvivingSlotIds { get; set; } = new List<string>();
        [JsonProperty("selectedSlotIds")] public List<string> SelectedSlotIds { get; set; } = new List<string>();
        [JsonProperty("hasDuplicateSlotConflict")] public bool HasDuplicateSlotConflict { get; set; }
    }

    public sealed class CellRenderSpecDto
    {
        [JsonProperty("slotId")] public string SlotId { get; set; } = string.Empty;
        [JsonProperty("rect")] public RectPtDto Rect { get; set; } = new RectPtDto();
        [JsonProperty("cornerAdjustment")] public float CornerAdjustment { get; set; }
        [JsonProperty("shapeKind")] public string ShapeKind { get; set; }
        [JsonProperty("svgPath")] public string SvgPath { get; set; }
        [JsonProperty("shapeName")] public string ShapeName { get; set; } = string.Empty;
        [JsonProperty("role")] public string Role { get; set; } = "standard";
        [JsonProperty("locked")] public bool Locked { get; set; }
        [JsonProperty("zOrderIndex")] public int ZOrderIndex { get; set; }
        [JsonProperty("contentHint")] public string ContentHint { get; set; }
        [JsonProperty("tags")] public Dictionary<string, string> Tags { get; set; } = new Dictionary<string, string>();
    }

    public sealed class LayoutDiffPayloadDto
    {
        [JsonProperty("bentoId")] public string BentoId { get; set; } = string.Empty;
        [JsonProperty("deletePlaceholderSelection")] public bool DeletePlaceholderSelection { get; set; }
        [JsonProperty("create")] public List<CellRenderSpecDto> Create { get; set; } = new List<CellRenderSpecDto>();
        [JsonProperty("update")] public List<CellRenderSpecDto> Update { get; set; } = new List<CellRenderSpecDto>();
        [JsonProperty("retireSlotIds")] public List<string> RetireSlotIds { get; set; } = new List<string>();
        [JsonProperty("commitUndoEntry")] public bool CommitUndoEntry { get; set; }
    }

    public sealed class CellShadowSpecDto
    {
        [JsonProperty("blurPt")] public float BlurPt { get; set; }
        [JsonProperty("offsetXPt")] public float OffsetXPt { get; set; }
        [JsonProperty("offsetYPt")] public float OffsetYPt { get; set; }
        [JsonProperty("transparency")] public float Transparency { get; set; }
        [JsonProperty("colorHex")] public string ColorHex { get; set; } = "#0F172A";
    }

    public sealed class CellStyleSpecDto
    {
        [JsonProperty("slotId")] public string SlotId { get; set; } = string.Empty;
        [JsonProperty("fillHex")] public string FillHex { get; set; }
        [JsonProperty("themeFillSlot")] public string ThemeFillSlot { get; set; }
        [JsonProperty("themeTintAndShade")] public float? ThemeTintAndShade { get; set; }
        [JsonProperty("borderColorHex")] public string BorderColorHex { get; set; }
        [JsonProperty("borderWeightPt")] public float BorderWeightPt { get; set; }
        [JsonProperty("borderTransparency")] public float BorderTransparency { get; set; }
        [JsonProperty("borderDashed")] public bool BorderDashed { get; set; }
        [JsonProperty("textColorHex")] public string TextColorHex { get; set; } = "#111827";
        [JsonProperty("shadow")] public CellShadowSpecDto Shadow { get; set; }
    }

    public sealed class StyleApplyPayloadDto
    {
        [JsonProperty("presetId")] public string PresetId { get; set; } = "soft-modern";
        [JsonProperty("hierarchyMode")] public string HierarchyMode { get; set; } = "hero-accent";
        [JsonProperty("cells")] public List<CellStyleSpecDto> Cells { get; set; } = new List<CellStyleSpecDto>();
        [JsonProperty("commitUndoEntry")] public bool CommitUndoEntry { get; set; }
    }

    public sealed class MultiSlideItemDto
    {
        [JsonProperty("bentoId")] public string BentoId { get; set; } = string.Empty;
        [JsonProperty("cells")] public List<CellRenderSpecDto> Cells { get; set; } = new List<CellRenderSpecDto>();
        [JsonProperty("stylePayload")] public StyleApplyPayloadDto StylePayload { get; set; } = new StyleApplyPayloadDto();
        [JsonProperty("applyMorphTransition")] public bool ApplyMorphTransition { get; set; }
    }

    public sealed class ApplyStyleParamsDto
    {
        [JsonProperty("bentoId")] public string BentoId { get; set; } = string.Empty;
        [JsonProperty("payload")] public StyleApplyPayloadDto Payload { get; set; } = new StyleApplyPayloadDto();
    }

    public sealed class BentoIdParamsDto
    {
        [JsonProperty("bentoId")] public string BentoId { get; set; } = string.Empty;
    }

    public sealed class SetImageSlotParamsDto
    {
        [JsonProperty("bentoId")] public string BentoId { get; set; } = string.Empty;
        [JsonProperty("slotId")] public string SlotId { get; set; } = string.Empty;
        [JsonProperty("imageBase64")] public string ImageBase64 { get; set; } = string.Empty;
        [JsonProperty("addScrim")] public bool AddScrim { get; set; }
    }

    public sealed class GenerateMultiSlidesParamsDto
    {
        [JsonProperty("items")] public List<MultiSlideItemDto> Items { get; set; } = new List<MultiSlideItemDto>();
    }

    public sealed class ReorderReadingOrderParamsDto
    {
        [JsonProperty("bentoId")] public string BentoId { get; set; } = string.Empty;
        [JsonProperty("orderedSlotIds")] public List<string> OrderedSlotIds { get; set; } = new List<string>();
    }

    public sealed class MosaikafySlotAssignmentDto
    {
        [JsonProperty("sourceShapeId")] public string SourceShapeId { get; set; } = string.Empty;
        [JsonProperty("targetSlotId")] public string TargetSlotId { get; set; } = string.Empty;
    }

    public sealed class MosaikafyPayloadDto
    {
        [JsonProperty("bentoId")] public string BentoId { get; set; } = string.Empty;
        [JsonProperty("assignments")] public List<MosaikafySlotAssignmentDto> Assignments { get; set; } = new List<MosaikafySlotAssignmentDto>();
        [JsonProperty("cells")] public List<CellRenderSpecDto> Cells { get; set; } = new List<CellRenderSpecDto>();
        [JsonProperty("stylePayload")] public StyleApplyPayloadDto StylePayload { get; set; } = new StyleApplyPayloadDto();
        [JsonProperty("commitUndoEntry")] public bool CommitUndoEntry { get; set; } = true;
    }

    public sealed class EntranceAnimationSpecDto
    {
        [JsonProperty("preset")] public string Preset { get; set; } = "none";
        [JsonProperty("durationSec")] public float DurationSec { get; set; } = 0.45f;
        [JsonProperty("staggerSec")] public float StaggerSec { get; set; } = 0.08f;
        [JsonProperty("orderedSlotIds")] public List<string> OrderedSlotIds { get; set; } = new List<string>();
    }

    public sealed class ApplyEntranceAnimationsParamsDto
    {
        [JsonProperty("bentoId")] public string BentoId { get; set; } = string.Empty;
        [JsonProperty("spec")] public EntranceAnimationSpecDto Spec { get; set; } = new EntranceAnimationSpecDto();
    }

    public sealed class BentoRpcRequestDto
    {
        [JsonProperty("id")] public string Id { get; set; } = string.Empty;
        [JsonProperty("method")] public string Method { get; set; } = string.Empty;
        [JsonProperty("params")] public JToken Params { get; set; }
    }

    public sealed class BentoRpcErrorDto
    {
        [JsonProperty("code")] public string Code { get; set; } = "HOST_ERROR";
        [JsonProperty("message")] public string Message { get; set; } = string.Empty;
    }

    public interface IPowerPointHostAdapter
    {
        HostCapabilitiesDto GetCapabilities();
        SelectionContextDto GetSelectionContext();
        int ApplyLayoutDiff(LayoutDiffPayloadDto diff);
        void ApplyStyle(string bentoId, StyleApplyPayloadDto payload);
        void SyncStyleFromSelected(string bentoId);
        void SetImageSlot(string bentoId, string slotId, string imageBase64, bool addScrim);
        int GenerateMultiSlides(List<MultiSlideItemDto> items);
        void ReorderReadingOrder(string bentoId, List<string> orderedSlotIds);
        void DetachBento(string bentoId);
        int MosaikafySelection(MosaikafyPayloadDto payload);
        void ApplyEntranceAnimations(string bentoId, EntranceAnimationSpecDto spec);
    }
}
