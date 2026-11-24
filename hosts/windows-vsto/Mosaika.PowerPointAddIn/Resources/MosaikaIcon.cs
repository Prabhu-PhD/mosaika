using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Windows.Forms;

namespace Mosaika.PowerPointAddIn.Resources
{
    /// <summary>
    /// Renders the bespoke Mosaika "Mosaic M" (Concept B) monochrome Swiss brand mark
    /// as a crisp 32x32 GDI+ bitmap and converts it to COM IPictureDisp for PowerPoint's Ribbon.
    /// </summary>
    public static class MosaikaIcon
    {
        private sealed class PictureHost : AxHost
        {
            private PictureHost() : base(Guid.Empty.ToString()) { }

            public static object ToPictureDisp(Image image)
            {
                return GetIPictureDispFromPicture(image);
            }
        }

        public static object CreateRibbonPictureDisp(int size = 32)
        {
            var bmp = CreateRibbonBitmap(size);
            return PictureHost.ToPictureDisp(bmp);
        }

        public static Bitmap CreateRibbonBitmap(int size = 32)
        {
            var bmp = new Bitmap(size, size);
            using (var g = Graphics.FromImage(bmp))
            {
                g.SmoothingMode = SmoothingMode.AntiAlias;
                // Crisp dark architectural tile background (#1B1D1E) — opaque square avoids HBITMAP alpha fringes on IPictureDisp
                g.Clear(Color.FromArgb(255, 27, 29, 30));

                float s = size / 24f;

                // Concept B "Mosaic M" — 3 columns + soft dot
                using (var whiteBrush = new SolidBrush(Color.White))
                using (var dotBrush = new SolidBrush(Color.FromArgb(255, 162, 166, 168)))
                {
                    // Left pillar
                    using (var left = CreateRoundedRect(3.2f * s, 3.8f * s, 4.6f * s, 16.4f * s, 1.1f * s))
                    {
                        g.FillPath(whiteBrush, left);
                    }

                    // Center top keystone
                    using (var mid = CreateRoundedRect(9.7f * s, 3.8f * s, 4.6f * s, 8.6f * s, 1.1f * s))
                    {
                        g.FillPath(whiteBrush, mid);
                    }

                    // Center bottom dot
                    float r = 2.4f * s;
                    g.FillEllipse(dotBrush, 12f * s - r, 17.6f * s - r, r * 2f, r * 2f);

                    // Right pillar
                    using (var right = CreateRoundedRect(16.2f * s, 3.8f * s, 4.6f * s, 16.4f * s, 1.1f * s))
                    {
                        g.FillPath(whiteBrush, right);
                    }
                }
            }

            return bmp;
        }

        private static GraphicsPath CreateRoundedRect(float x, float y, float width, float height, float radius)
        {
            var path = new GraphicsPath();
            float d = radius * 2f;
            if (d <= 0.1f)
            {
                path.AddRectangle(new RectangleF(x, y, width, height));
                return path;
            }
            path.AddArc(x, y, d, d, 180, 90);
            path.AddArc(x + width - d, y, d, d, 270, 90);
            path.AddArc(x + width - d, y + height - d, d, d, 0, 90);
            path.AddArc(x, y + height - d, d, d, 90, 90);
            path.CloseFigure();
            return path;
        }
    }
}
