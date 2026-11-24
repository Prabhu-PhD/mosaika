using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text.RegularExpressions;
using Microsoft.Office.Core;

namespace Mosaika.PowerPointAddIn.PowerPoint
{
    public enum FreeformSegmentKind
    {
        Line,
        CubicBezier
    }

    public readonly struct FreeformSegment
    {
        public FreeformSegmentKind Kind { get; }
        public float X1 { get; }
        public float Y1 { get; }
        public float X2 { get; }
        public float Y2 { get; }
        public float EndX { get; }
        public float EndY { get; }

        public FreeformSegment(float endX, float endY)
        {
            Kind = FreeformSegmentKind.Line;
            X1 = 0f;
            Y1 = 0f;
            X2 = 0f;
            Y2 = 0f;
            EndX = endX;
            EndY = endY;
        }

        public FreeformSegment(float x1, float y1, float x2, float y2, float endX, float endY)
        {
            Kind = FreeformSegmentKind.CubicBezier;
            X1 = x1;
            Y1 = y1;
            X2 = x2;
            Y2 = y2;
            EndX = endX;
            EndY = endY;
        }
    }

    public sealed class ParsedFreeformPath
    {
        public float StartX { get; }
        public float StartY { get; }
        public IReadOnlyList<FreeformSegment> Segments { get; }

        public ParsedFreeformPath(float startX, float startY, IReadOnlyList<FreeformSegment> segments)
        {
            StartX = startX;
            StartY = startY;
            Segments = segments;
        }
    }

    /// <summary>
    /// Pure geometry translator for PowerPoint COM:
    /// 1. Maps CellShapeKind to native MsoAutoShapeType + 1-based Adjustments[1] (Rule 5).
    /// 2. Parses exact @bento/core SVG paths (M, L, A, Z — including L-Wraps & Center-Hub arcs)
    ///    into exact Cubic Bezier curves for Slide.Shapes.BuildFreeform().
    /// </summary>
    public static class GeometryBuilder
    {
        private static readonly Regex TokenRegex = new Regex(
            @"[MLAZmlaz]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?",
            RegexOptions.Compiled);

        public static MsoAutoShapeType ResolveNativeAutoShapeType(string shapeKind)
        {
            switch (shapeKind)
            {
                case "circle":
                    return MsoAutoShapeType.msoShapeOval;
                case "arch":
                    return MsoAutoShapeType.msoShapeRound2SameRectangle;
                case "leaf":
                    return MsoAutoShapeType.msoShapeRound2DiagRectangle;
                case "chamfer":
                    return MsoAutoShapeType.msoShapeSnip2DiagRectangle;
                case "pill":
                case "rect":
                default:
                    // Rule 5: Always RoundedRectangle for standard & pill cards
                    return MsoAutoShapeType.msoShapeRoundedRectangle;
            }
        }

        public static float ClampCornerAdjustment(float cornerAdjustment, string shapeKind)
        {
            if (shapeKind == "pill")
            {
                return 0.5f;
            }
            if (float.IsNaN(cornerAdjustment) || cornerAdjustment < 0f)
            {
                return 0f;
            }
            return cornerAdjustment > 0.5f ? 0.5f : cornerAdjustment;
        }

        /// <summary>
        /// Parses an SVG path containing M, L, A, Z commands in local (0..w, 0..h) coordinates,
        /// translates it by (offsetX, offsetY), and converts all elliptical/circular arcs into
        /// exact cubic Bezier segments ready for PowerPoint BuildFreeform().
        /// </summary>
        public static ParsedFreeformPath ParseSvgPath(string svgPath, float offsetX = 0f, float offsetY = 0f)
        {
            if (string.IsNullOrWhiteSpace(svgPath))
            {
                throw new ArgumentException("SVG path cannot be empty.", nameof(svgPath));
            }

            var matches = TokenRegex.Matches(svgPath);
            var tokens = new List<string>(matches.Count);
            foreach (Match m in matches)
            {
                tokens.Add(m.Value);
            }

            int i = 0;
            bool hasStart = false;
            double startX = 0, startY = 0;
            double currX = 0, currY = 0;
            var segments = new List<FreeformSegment>();

            double ReadDouble()
            {
                if (i >= tokens.Count)
                {
                    throw new FormatException("Unexpected end of SVG path tokens.");
                }
                return double.Parse(tokens[i++], CultureInfo.InvariantCulture);
            }

            while (i < tokens.Count)
            {
                string cmd = tokens[i++];
                switch (cmd)
                {
                    case "M":
                    {
                        double x = ReadDouble();
                        double y = ReadDouble();
                        startX = x;
                        startY = y;
                        currX = x;
                        currY = y;
                        hasStart = true;
                        break;
                    }
                    case "L":
                    {
                        double x = ReadDouble();
                        double y = ReadDouble();
                        if (Math.Abs(x - currX) > 0.001 || Math.Abs(y - currY) > 0.001)
                        {
                            segments.Add(new FreeformSegment((float)(x + offsetX), (float)(y + offsetY)));
                            currX = x;
                            currY = y;
                        }
                        break;
                    }
                    case "A":
                    {
                        double rx = ReadDouble();
                        double ry = ReadDouble();
                        double xAxisRotation = ReadDouble();
                        int largeArcFlag = (int)Math.Round(ReadDouble());
                        int sweepFlag = (int)Math.Round(ReadDouble());
                        double endX = ReadDouble();
                        double endY = ReadDouble();

                        AppendArcAsCubicBeziers(
                            segments,
                            currX, currY,
                            rx, ry,
                            xAxisRotation,
                            largeArcFlag != 0,
                            sweepFlag != 0,
                            endX, endY,
                            offsetX, offsetY);

                        currX = endX;
                        currY = endY;
                        break;
                    }
                    case "Z":
                    case "z":
                    {
                        if (hasStart && (Math.Abs(startX - currX) > 0.01 || Math.Abs(startY - currY) > 0.01))
                        {
                            segments.Add(new FreeformSegment((float)(startX + offsetX), (float)(startY + offsetY)));
                            currX = startX;
                            currY = startY;
                        }
                        break;
                    }
                    default:
                        throw new FormatException($"Unsupported SVG path command \"{cmd}\".");
                }
            }

            if (!hasStart || segments.Count == 0)
            {
                throw new FormatException("SVG path contained no drawable segments.");
            }

            return new ParsedFreeformPath((float)(startX + offsetX), (float)(startY + offsetY), segments);
        }

        /// <summary>
        /// Standard W3C SVG 1.1 F.6.5 endpoint-to-center arc conversion split into <= 90-degree cubic Bezier curves.
        /// </summary>
        private static void AppendArcAsCubicBeziers(
            List<FreeformSegment> segments,
            double x1, double y1,
            double rx, double ry,
            double angleDeg,
            bool largeArc,
            bool sweep,
            double x2, double y2,
            float offsetX, float offsetY)
        {
            if (Math.Abs(x1 - x2) < 1e-4 && Math.Abs(y1 - y2) < 1e-4)
            {
                return;
            }

            rx = Math.Abs(rx);
            ry = Math.Abs(ry);
            if (rx < 1e-4 || ry < 1e-4)
            {
                segments.Add(new FreeformSegment((float)(x2 + offsetX), (float)(y2 + offsetY)));
                return;
            }

            double phi = angleDeg * Math.PI / 180.0;
            double cosPhi = Math.Cos(phi);
            double sinPhi = Math.Sin(phi);

            double dx2 = (x1 - x2) / 2.0;
            double dy2 = (y1 - y2) / 2.0;
            double x1p = cosPhi * dx2 + sinPhi * dy2;
            double y1p = -sinPhi * dx2 + cosPhi * dy2;

            // Ensure radii are large enough
            double rxSq = rx * rx;
            double rySq = ry * ry;
            double x1pSq = x1p * x1p;
            double y1pSq = y1p * y1p;

            double lambda = x1pSq / rxSq + y1pSq / rySq;
            if (lambda > 1.0)
            {
                double sqrtLambda = Math.Sqrt(lambda);
                rx *= sqrtLambda;
                ry *= sqrtLambda;
                rxSq = rx * rx;
                rySq = ry * ry;
            }

            double sign = (largeArc == sweep) ? -1.0 : 1.0;
            double num = Math.Max(0.0, rxSq * rySq - rxSq * y1pSq - rySq * x1pSq);
            double den = rxSq * y1pSq + rySq * x1pSq;
            double coef = den > 1e-12 ? sign * Math.Sqrt(num / den) : 0.0;

            double cxp = coef * (rx * y1p / ry);
            double cyp = coef * -(ry * x1p / rx);

            double cx = cosPhi * cxp - sinPhi * cyp + (x1 + x2) / 2.0;
            double cy = sinPhi * cxp + cosPhi * cyp + (y1 + y2) / 2.0;

            double ux = (x1p - cxp) / rx;
            double uy = (y1p - cyp) / ry;
            double vx = (-x1p - cxp) / rx;
            double vy = (-y1p - cyp) / ry;

            double theta1 = VectorAngle(1.0, 0.0, ux, uy);
            double deltaTheta = VectorAngle(ux, uy, vx, vy);

            if (!sweep && deltaTheta > 0)
            {
                deltaTheta -= 2.0 * Math.PI;
            }
            else if (sweep && deltaTheta < 0)
            {
                deltaTheta += 2.0 * Math.PI;
            }

            int numSegs = Math.Max(1, (int)Math.Ceiling(Math.Abs(deltaTheta) / (Math.PI / 2.0)));
            double segAngle = deltaTheta / numSegs;
            double alpha = (4.0 / 3.0) * Math.Tan(segAngle / 4.0);

            for (int s = 0; s < numSegs; s++)
            {
                double t1 = theta1 + s * segAngle;
                double t2 = t1 + segAngle;

                double cos1 = Math.Cos(t1), sin1 = Math.Sin(t1);
                double cos2 = Math.Cos(t2), sin2 = Math.Sin(t2);

                double q1x = cos1 - alpha * sin1;
                double q1y = sin1 + alpha * cos1;
                double q2x = cos2 + alpha * sin2;
                double q2y = sin2 - alpha * cos2;

                void MapPoint(double px, double py, out float ox, out float oy)
                {
                    double ex = rx * px;
                    double ey = ry * py;
                    ox = (float)(cosPhi * ex - sinPhi * ey + cx + offsetX);
                    oy = (float)(sinPhi * ex + cosPhi * ey + cy + offsetY);
                }

                MapPoint(q1x, q1y, out float c1x, out float c1y);
                MapPoint(q2x, q2y, out float c2x, out float c2y);
                MapPoint(cos2, sin2, out float exOut, out float eyOut);

                segments.Add(new FreeformSegment(c1x, c1y, c2x, c2y, exOut, eyOut));
            }
        }

        private static double VectorAngle(double ux, double uy, double vx, double vy)
        {
            double dot = ux * vx + uy * vy;
            double len = Math.Sqrt(ux * ux + uy * uy) * Math.Sqrt(vx * vx + vy * vy);
            double cosVal = len > 1e-12 ? Math.Max(-1.0, Math.Min(1.0, dot / len)) : 1.0;
            double angle = Math.Acos(cosVal);
            return (ux * vy - uy * vx) < 0 ? -angle : angle;
        }
    }
}
