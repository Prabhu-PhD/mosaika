using System.Linq;
using Microsoft.Office.Core;
using Mosaika.PowerPointAddIn.PowerPoint;
using Xunit;

namespace Mosaika.PowerPointAddIn.Tests
{
    public sealed class GeometryBuilderTests
    {
        [Fact]
        public void ResolveNativeAutoShapeType_AlwaysUsesRoundedRectangleForStandardAndPill()
        {
            Assert.Equal(MsoAutoShapeType.msoShapeRoundedRectangle, GeometryBuilder.ResolveNativeAutoShapeType(null));
            Assert.Equal(MsoAutoShapeType.msoShapeRoundedRectangle, GeometryBuilder.ResolveNativeAutoShapeType("rect"));
            Assert.Equal(MsoAutoShapeType.msoShapeRoundedRectangle, GeometryBuilder.ResolveNativeAutoShapeType("pill"));
            Assert.Equal(MsoAutoShapeType.msoShapeOval, GeometryBuilder.ResolveNativeAutoShapeType("circle"));
            Assert.Equal(MsoAutoShapeType.msoShapeRound2SameRectangle, GeometryBuilder.ResolveNativeAutoShapeType("arch"));
            Assert.Equal(MsoAutoShapeType.msoShapeRound2DiagRectangle, GeometryBuilder.ResolveNativeAutoShapeType("leaf"));
            Assert.Equal(MsoAutoShapeType.msoShapeSnip2DiagRectangle, GeometryBuilder.ResolveNativeAutoShapeType("chamfer"));
        }

        [Fact]
        public void ClampCornerAdjustment_EnforcesBoundsAndPillHalfRadius()
        {
            Assert.Equal(0f, GeometryBuilder.ClampCornerAdjustment(-0.2f, "rect"));
            Assert.Equal(0.5f, GeometryBuilder.ClampCornerAdjustment(0.9f, "rect"));
            Assert.Equal(0.5f, GeometryBuilder.ClampCornerAdjustment(0.1f, "pill"));
            Assert.Equal(0.15f, GeometryBuilder.ClampCornerAdjustment(0.15f, "rect"));
        }

        [Fact]
        public void ParseSvgPath_ConvertsLWrapConcavePathIntoClosedFreeformSegments()
        {
            // Canonical L-Wrap path emitted by @bento/core shapes.ts (with outer & concave inner arcs)
            const string lWrapPath =
                "M 16 0 L 384 0 A 16 16 0 0 1 400 16 L 400 174 A 16 16 0 0 1 384 190 " +
                "L 266 190 A 16 16 0 0 0 250 206 L 250 284 A 16 16 0 0 1 234 300 " +
                "L 16 300 A 16 16 0 0 1 0 284 L 0 16 A 16 16 0 0 1 16 0 Z";

            var parsed = GeometryBuilder.ParseSvgPath(lWrapPath, offsetX: 48f, offsetY: 108f);

            Assert.Equal(64f, parsed.StartX, 2);
            Assert.Equal(108f, parsed.StartY, 2);
            Assert.True(parsed.Segments.Count >= 12);
            Assert.Equal(6, parsed.Segments.Count(s => s.Kind == FreeformSegmentKind.CubicBezier));
            Assert.Equal(6, parsed.Segments.Count(s => s.Kind == FreeformSegmentKind.Line));

            // Path closes cleanly back to StartX, StartY
            var last = parsed.Segments[parsed.Segments.Count - 1];
            Assert.InRange(last.EndX, parsed.StartX - 0.1f, parsed.StartX + 0.1f);
            Assert.InRange(last.EndY, parsed.StartY - 0.1f, parsed.StartY + 0.1f);
        }

        [Fact]
        public void ParseSvgPath_ConvertsCenterHubCircularNotchArcToCubicBezier()
        {
            const string arcNotchPath =
                "M 14 0 L 406 0 A 14 14 0 0 1 420 14 L 420 110.21 A 86 86 0 0 0 340.21 190 " +
                "L 14 190 A 14 14 0 0 1 0 176 L 0 14 A 14 14 0 0 1 14 0 Z";

            var parsed = GeometryBuilder.ParseSvgPath(arcNotchPath, offsetX: 48f, offsetY: 108f);

            Assert.Contains(parsed.Segments, s => s.Kind == FreeformSegmentKind.CubicBezier);
            var last = parsed.Segments[parsed.Segments.Count - 1];
            Assert.InRange(last.EndX, parsed.StartX - 0.1f, parsed.StartX + 0.1f);
            Assert.InRange(last.EndY, parsed.StartY - 0.1f, parsed.StartY + 0.1f);
        }
    }
}
