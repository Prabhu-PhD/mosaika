using System;
using Microsoft.Office.Core;
using Mosaika.PowerPointAddIn.PowerPoint;
using Xunit;

namespace Mosaika.PowerPointAddIn.Tests
{
    public sealed class ColorUtilsTests
    {
        [Theory]
        [InlineData("#000000", 0x000000)]
        [InlineData("#FFFFFF", 0xFFFFFF)]
        [InlineData("#FF0000", 0x0000FF)] // Red -> OLE BGR 0x0000FF
        [InlineData("#00FF00", 0x00FF00)]
        [InlineData("#0000FF", 0xFF0000)] // Blue -> OLE BGR 0xFF0000
        [InlineData("#2563EB", 0xEB6325)] // Mosaika Hero Accent Blue
        [InlineData("111827", 0x271811)]  // Dark Ink without leading #
        public void HexToOleColor_ConvertsRgbToOfficeBgrCorrectly(string hex, int expectedBgr)
        {
            Assert.Equal(expectedBgr, ColorUtils.HexToOleColor(hex));
        }

        [Fact]
        public void HexToOleColor_RejectsMalformedHex()
        {
            Assert.Throws<ArgumentException>(() => ColorUtils.HexToOleColor("#FFF"));
        }

        [Fact]
        public void TryMapThemeColor_MapsSupportedSlots()
        {
            Assert.True(ColorUtils.TryMapThemeColor("Background1", out var bg));
            Assert.Equal(MsoThemeColorIndex.msoThemeColorBackground1, bg);

            Assert.True(ColorUtils.TryMapThemeColor("Text1", out var txt));
            Assert.Equal(MsoThemeColorIndex.msoThemeColorText1, txt);

            Assert.True(ColorUtils.TryMapThemeColor("Accent1", out var acc));
            Assert.Equal(MsoThemeColorIndex.msoThemeColorAccent1, acc);

            Assert.False(ColorUtils.TryMapThemeColor("UnknownSlot", out _));
        }
    }
}
