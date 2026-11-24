using System.Collections.Generic;
using Mosaika.PowerPointAddIn.Rpc;
using Newtonsoft.Json.Linq;
using Xunit;

namespace Mosaika.PowerPointAddIn.Tests
{
    public sealed class RpcDispatcherTests
    {
        private sealed class FakeAdapter : IPowerPointHostAdapter
        {
            public string LastMethod { get; private set; }
            public int ReturnStashedCount { get; set; } = 2;

            public HostCapabilitiesDto GetCapabilities()
            {
                LastMethod = "getCapabilities";
                return new HostCapabilitiesDto();
            }

            public SelectionContextDto GetSelectionContext()
            {
                LastMethod = "getSelectionContext";
                return new SelectionContextDto { SlideId = "slide_42", SelectedShapeCount = 1 };
            }

            public int ApplyLayoutDiff(LayoutDiffPayloadDto diff)
            {
                LastMethod = $"applyLayoutDiff:{diff.BentoId}";
                return ReturnStashedCount;
            }

            public void ApplyStyle(string bentoId, StyleApplyPayloadDto payload) => LastMethod = $"applyStyle:{bentoId}";
            public void SyncStyleFromSelected(string bentoId) => LastMethod = $"syncStyle:{bentoId}";
            public void SetImageSlot(string bentoId, string slotId, string imageBase64, bool addScrim) => LastMethod = $"setImage:{slotId}";
            public int GenerateMultiSlides(List<MultiSlideItemDto> items)
            {
                LastMethod = "generateMultiSlides";
                return items.Count;
            }
            public void ReorderReadingOrder(string bentoId, List<string> orderedSlotIds) => LastMethod = $"reorder:{orderedSlotIds.Count}";
            public void DetachBento(string bentoId) => LastMethod = $"detach:{bentoId}";
        }

        [Fact]
        public void Dispatch_RoutesCapabilitiesAndCorrelatesRequestId()
        {
            var fake = new FakeAdapter();
            var dispatcher = new RpcDispatcher(fake);

            string raw = dispatcher.Dispatch("{\"id\":\"req_7\",\"method\":\"getCapabilities\",\"params\":{}}");
            var obj = JObject.Parse(raw);

            Assert.Equal("req_7", (string)obj["id"]);
            Assert.Equal("vsto", (string)obj["result"]?["platform"]);
            Assert.True((bool)obj["result"]?["supportsCustomGeometry"]);
            Assert.True((bool)obj["result"]?["supportsNativeUndoGrouping"]);
        }

        [Fact]
        public void Dispatch_RoutesApplyLayoutDiffAndReturnsStashedCount()
        {
            var fake = new FakeAdapter { ReturnStashedCount = 3 };
            var dispatcher = new RpcDispatcher(fake);

            string raw = dispatcher.Dispatch(
                "{\"id\":\"req_9\",\"method\":\"applyLayoutDiff\",\"params\":{\"bentoId\":\"bnt_123\",\"deletePlaceholderSelection\":false,\"create\":[],\"update\":[],\"retireSlotIds\":[\"slot_05\"],\"commitUndoEntry\":true}}");
            var obj = JObject.Parse(raw);

            Assert.Equal("req_9", (string)obj["id"]);
            Assert.Equal(3, (int)obj["result"]?["stashedCount"]);
            Assert.Equal("applyLayoutDiff:bnt_123", fake.LastMethod);
        }

        [Fact]
        public void Dispatch_ReturnsStructuredErrorForUnknownMethod()
        {
            var dispatcher = new RpcDispatcher(new FakeAdapter());
            string raw = dispatcher.Dispatch("{\"id\":\"req_99\",\"method\":\"doesNotExist\",\"params\":{}}");
            var obj = JObject.Parse(raw);

            Assert.Equal("req_99", (string)obj["id"]);
            Assert.Equal("INVALID_PARAMS", (string)obj["error"]?["code"]);
        }
    }
}
