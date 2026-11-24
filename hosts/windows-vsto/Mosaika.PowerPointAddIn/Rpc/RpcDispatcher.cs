using System;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace Mosaika.PowerPointAddIn.Rpc
{
    /// <summary>
    /// Routes WebView2 JSON-RPC 2.0 requests (PRD Section 7.2) to IPowerPointHostAdapter
    /// and serializes strict { id, result } or { id, error } responses.
    /// </summary>
    public sealed class RpcDispatcher
    {
        private readonly IPowerPointHostAdapter _adapter;

        public RpcDispatcher(IPowerPointHostAdapter adapter)
        {
            _adapter = adapter ?? throw new ArgumentNullException(nameof(adapter));
        }

        public string Dispatch(string rawRequestJson)
        {
            if (string.IsNullOrWhiteSpace(rawRequestJson))
            {
                return SerializeError(string.Empty, "INVALID_REQUEST", "Empty JSON-RPC payload.");
            }

            BentoRpcRequestDto request;
            try
            {
                request = JsonConvert.DeserializeObject<BentoRpcRequestDto>(rawRequestJson);
            }
            catch (Exception ex)
            {
                return SerializeError(string.Empty, "PARSE_ERROR", $"Invalid JSON-RPC request: {ex.Message}");
            }

            if (request == null || string.IsNullOrWhiteSpace(request.Id) || string.IsNullOrWhiteSpace(request.Method))
            {
                return SerializeError(request?.Id ?? string.Empty, "INVALID_REQUEST", "Missing RPC id or method.");
            }

            try
            {
                object result = InvokeMethod(request.Method, request.Params);
                return SerializeSuccess(request.Id, result);
            }
            catch (InvalidOperationException ex)
            {
                return SerializeError(request.Id, "INVALID_STATE", ex.Message);
            }
            catch (ArgumentException ex)
            {
                return SerializeError(request.Id, "INVALID_PARAMS", ex.Message);
            }
            catch (Exception ex)
            {
                return SerializeError(request.Id, "HOST_ERROR", ex.Message);
            }
        }

        private object InvokeMethod(string method, JToken rawParams)
        {
            switch (method)
            {
                case "getCapabilities":
                    return _adapter.GetCapabilities();

                case "getSelectionContext":
                    return _adapter.GetSelectionContext();

                case "applyLayoutDiff":
                {
                    var diff = RequireParams<LayoutDiffPayloadDto>(rawParams, method);
                    int stashedCount = _adapter.ApplyLayoutDiff(diff);
                    return new { stashedCount };
                }

                case "applyStyle":
                {
                    var args = RequireParams<ApplyStyleParamsDto>(rawParams, method);
                    _adapter.ApplyStyle(args.BentoId, args.Payload);
                    return new { ok = true };
                }

                case "syncStyleFromSelected":
                {
                    var args = RequireParams<BentoIdParamsDto>(rawParams, method);
                    _adapter.SyncStyleFromSelected(args.BentoId);
                    return new { ok = true };
                }

                case "setImageSlot":
                {
                    var args = RequireParams<SetImageSlotParamsDto>(rawParams, method);
                    _adapter.SetImageSlot(args.BentoId, args.SlotId, args.ImageBase64, args.AddScrim);
                    return new { ok = true };
                }

                case "generateMultiSlides":
                {
                    var args = RequireParams<GenerateMultiSlidesParamsDto>(rawParams, method);
                    int createdSlideCount = _adapter.GenerateMultiSlides(args.Items);
                    return new { createdSlideCount };
                }

                case "reorderReadingOrder":
                {
                    var args = RequireParams<ReorderReadingOrderParamsDto>(rawParams, method);
                    _adapter.ReorderReadingOrder(args.BentoId, args.OrderedSlotIds);
                    return new { ok = true };
                }

                case "detachBento":
                {
                    var args = RequireParams<BentoIdParamsDto>(rawParams, method);
                    _adapter.DetachBento(args.BentoId);
                    return new { ok = true };
                }

                case "mosaikafySelection":
                {
                    var payload = RequireParams<MosaikafyPayloadDto>(rawParams, method);
                    int convertedCount = _adapter.MosaikafySelection(payload);
                    return new { convertedCount };
                }

                case "applyEntranceAnimations":
                {
                    var args = RequireParams<ApplyEntranceAnimationsParamsDto>(rawParams, method);
                    _adapter.ApplyEntranceAnimations(args.BentoId, args.Spec);
                    return new { ok = true };
                }

                default:
                    throw new ArgumentException($"Unknown RPC method \"{method}\".");
            }
        }

        private static T RequireParams<T>(JToken rawParams, string method) where T : class
        {
            if (rawParams == null || rawParams.Type == JTokenType.Null)
            {
                throw new ArgumentException($"Missing params for \"{method}\".");
            }
            var parsed = rawParams.ToObject<T>();
            if (parsed == null)
            {
                throw new ArgumentException($"Invalid params payload for \"{method}\".");
            }
            return parsed;
        }

        private static string SerializeSuccess(string id, object result)
        {
            return JsonConvert.SerializeObject(new { id, result });
        }

        private static string SerializeError(string id, string code, string message)
        {
            return JsonConvert.SerializeObject(new
            {
                id,
                error = new BentoRpcErrorDto { Code = code, Message = message }
            });
        }
    }
}
