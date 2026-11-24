param(
  [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..\..')
$VstoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$InstallerDir = Join-Path $VstoRoot 'installer'
$IconPath = Join-Path $InstallerDir 'mosaika.ico'
$IssPath = Join-Path $InstallerDir 'MosaikaSetup.iss'

# 1. Generate crisp multi-resolution Mosaic M icon (16, 32, 48px 32-bit DIB + 256px PNG for Inno Setup 6)
Write-Host "1/4 Generating Mosaika Mosaic M icon ($IconPath)..." -ForegroundColor Cyan

$icoGenCode = @"
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;

public static class MosaikaIcoWriter
{
    public static void WriteIco(string path)
    {
        int[] sizes = { 16, 32, 48, 256 };
        var frames = new List<byte[]>(sizes.Length);
        foreach (int sz in sizes)
        {
            using (var bmp = Render(sz))
            {
                frames.Add(sz >= 256 ? ToPng(bmp) : ToDib(bmp));
            }
        }

        using (var fs = File.Create(path))
        using (var bw = new BinaryWriter(fs))
        {
            bw.Write((ushort)0);
            bw.Write((ushort)1);
            bw.Write((ushort)sizes.Length);

            uint offset = (uint)(6 + 16 * sizes.Length);
            for (int i = 0; i < sizes.Length; i++)
            {
                int sz = sizes[i];
                byte[] data = frames[i];
                bw.Write((byte)(sz >= 256 ? 0 : sz));
                bw.Write((byte)(sz >= 256 ? 0 : sz));
                bw.Write((byte)0);
                bw.Write((byte)0);
                bw.Write((ushort)1);
                bw.Write((ushort)32);
                bw.Write((uint)data.Length);
                bw.Write(offset);
                offset += (uint)data.Length;
            }

            foreach (byte[] data in frames)
            {
                bw.Write(data);
            }
        }
    }

    private static Bitmap Render(int size)
    {
        var bmp = new Bitmap(size, size, PixelFormat.Format32bppArgb);
        using (var g = Graphics.FromImage(bmp))
        {
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.Clear(Color.FromArgb(255, 27, 29, 30));
            float s = size / 24f;
            using (var white = new SolidBrush(Color.White))
            using (var dot = new SolidBrush(Color.FromArgb(255, 162, 166, 168)))
            {
                g.FillRectangle(white, 3.2f * s, 3.8f * s, 4.6f * s, 16.4f * s);
                g.FillRectangle(white, 9.7f * s, 3.8f * s, 4.6f * s, 8.6f * s);
                float r = 2.4f * s;
                g.FillEllipse(dot, 12f * s - r, 17.6f * s - r, r * 2f, r * 2f);
                g.FillRectangle(white, 16.2f * s, 3.8f * s, 4.6f * s, 16.4f * s);
            }
        }
        return bmp;
    }

    private static byte[] ToPng(Bitmap bmp)
    {
        using (var ms = new MemoryStream())
        {
            bmp.Save(ms, ImageFormat.Png);
            return ms.ToArray();
        }
    }

    private static byte[] ToDib(Bitmap bmp)
    {
        int w = bmp.Width;
        int h = bmp.Height;
        int andRowBytes = ((w + 31) / 32) * 4;
        int xorLen = w * h * 4;
        int andLen = andRowBytes * h;

        using (var ms = new MemoryStream())
        using (var bw = new BinaryWriter(ms))
        {
            bw.Write((uint)40);
            bw.Write(w);
            bw.Write(h * 2);
            bw.Write((ushort)1);
            bw.Write((ushort)32);
            bw.Write((uint)0);
            bw.Write((uint)(xorLen + andLen));
            bw.Write(0);
            bw.Write(0);
            bw.Write((uint)0);
            bw.Write((uint)0);

            for (int y = h - 1; y >= 0; y--)
            {
                for (int x = 0; x < w; x++)
                {
                    Color c = bmp.GetPixel(x, y);
                    bw.Write(c.B);
                    bw.Write(c.G);
                    bw.Write(c.R);
                    bw.Write(c.A);
                }
            }
            bw.Write(new byte[andLen]);
            bw.Flush();
            return ms.ToArray();
        }
    }
}
"@

if (-not ('MosaikaIcoWriter' -as [type])) {
  Add-Type -TypeDefinition $icoGenCode -ReferencedAssemblies System.Drawing
}
[MosaikaIcoWriter]::WriteIco($IconPath)

if (-not $SkipBuild) {
  Write-Host "2/4 Building TypeScript packages & WebView2 bundle..." -ForegroundColor Cyan
  Push-Location $RepoRoot
  try {
    pnpm --filter @bento/contract build
    pnpm --filter @bento/core build
    pnpm --filter @bento/ui build
    pnpm --filter @bento/vsto-web build
  } finally {
    Pop-Location
  }

  Write-Host "3/4 Building .NET Framework 4.8 Release Add-in & running unit tests..." -ForegroundColor Cyan
  dotnet build (Join-Path $VstoRoot 'Mosaika.PowerPointAddIn.sln') -c Release
  if ($LASTEXITCODE -ne 0) { throw "dotnet build failed" }
  dotnet test (Join-Path $VstoRoot 'Mosaika.PowerPointAddIn.Tests\Mosaika.PowerPointAddIn.Tests.csproj') -c Release --no-build
  if ($LASTEXITCODE -ne 0) { throw "dotnet test failed" }
}

# 4. Compile Inno Setup 6 installer -> hosts/windows-vsto/dist/MosaikaSetup-0.1.0.exe
$iscc = "C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
if (-not (Test-Path $iscc)) {
  $cmd = Get-Command iscc -ErrorAction SilentlyContinue
  if ($cmd) { $iscc = $cmd.Source } else { throw "Inno Setup 6 (ISCC.exe) not found." }
}

Write-Host "4/4 Compiling MosaikaSetup-0.1.0.exe with Inno Setup 6..." -ForegroundColor Cyan
& $iscc $IssPath
if ($LASTEXITCODE -ne 0) { throw "ISCC.exe failed with exit code $LASTEXITCODE" }

$outExe = Join-Path $VstoRoot 'dist\MosaikaSetup-0.1.0.exe'
$info = Get-Item $outExe
Write-Host "`nPackaged installer successfully!" -ForegroundColor Green
Write-Host ("  File: {0} ({1:N0} KB)" -f $info.FullName, ($info.Length / 1KB))
