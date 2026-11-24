using System;
using System.Globalization;
using Microsoft.Office.Core;

namespace Mosaika.PowerPointAddIn.PowerPoint
{
    /// <summary>
    /// Converts web #RRGGBB hex colors to Office COM OLE BGR integers and maps
    /// Bento theme slot names to PowerPoint MsoThemeColorIndex values.
    /// </summary>
    public static class ColorUtils
    {
        /// <summary>
        /// Converts "#RRGGBB" (or "RRGGBB") to Office OLE RGB int (0x00BBGGRR).
        /// </summary>
        public static int HexToOleColor(string hex)
        {
            if (string.IsNullOrWhiteSpace(hex))
            {
                return 0;
            }

            string clean = hex.Trim();
            if (clean.StartsWith("#", StringComparison.Ordinal))
            {
                clean = clean.Substring(1);
            }

            if (clean.Length != 6)
            {
                throw new ArgumentException($"Expected 6-digit hex color, got \"{hex}\".", nameof(hex));
            }

            int r = int.Parse(clean.Substring(0, 2), NumberStyles.HexNumber, CultureInfo.InvariantCulture);
            int g = int.Parse(clean.Substring(2, 2), NumberStyles.HexNumber, CultureInfo.InvariantCulture);
            int b = int.Parse(clean.Substring(4, 2), NumberStyles.HexNumber, CultureInfo.InvariantCulture);

            return (b << 16) | (g << 8) | r;
        }

        public static bool TryMapThemeColor(string themeFillSlot, out MsoThemeColorIndex index)
        {
            switch (themeFillSlot)
            {
                case "Background1":
                    index = MsoThemeColorIndex.msoThemeColorBackground1;
                    return true;
                case "Text1":
                    index = MsoThemeColorIndex.msoThemeColorText1;
                    return true;
                case "Accent1":
                    index = MsoThemeColorIndex.msoThemeColorAccent1;
                    return true;
                default:
                    index = MsoThemeColorIndex.msoNotThemeColor;
                    return false;
            }
        }
    }
}
