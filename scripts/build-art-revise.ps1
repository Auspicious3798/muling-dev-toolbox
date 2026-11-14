<#
  沐柠环境盒 · 美术成品生成（透明底版）
  源图目录：assets/revise  （用户手工抠好的透明底 PNG）
  产物目录：public/art、electron/assets、build/icon.ico

  与 build-art.ps1 的区别：源图已经是透明底，所以不再做「抠白」，
  改为按 alpha 通道裁边，场景类卡片图统一合成到纯白画布。
#>
param(
  [string]$SourceDir = "assets/revise",
  [string]$OutDir = "public/art"
)

Add-Type -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.Collections.Generic;
using System.Runtime.InteropServices;

public class Art2
{
    public static Bitmap Load(string path)
    {
        using (var src = new Bitmap(path))
        {
            var bmp = new Bitmap(src.Width, src.Height, PixelFormat.Format32bppArgb);
            using (var g = Graphics.FromImage(bmp))
            {
                g.CompositingMode = CompositingMode.SourceCopy;
                g.DrawImage(src, 0, 0, src.Width, src.Height);
            }
            return bmp;
        }
    }

    // 按 alpha 通道求内容边界
    public static Rectangle Bounds(Bitmap bmp, int minAlpha)
    {
        int w = bmp.Width, h = bmp.Height;
        var rect = new Rectangle(0, 0, w, h);
        var data = bmp.LockBits(rect, ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
        int stride = data.Stride;
        byte[] buf = new byte[stride * h];
        Marshal.Copy(data.Scan0, buf, 0, buf.Length);
        bmp.UnlockBits(data);

        int left = w, top = h, right = -1, bottom = -1;
        for (int y = 0; y < h; y++)
        {
            int row = y * stride;
            for (int x = 0; x < w; x++)
            {
                if (buf[row + x * 4 + 3] >= minAlpha)
                {
                    if (x < left) left = x;
                    if (x > right) right = x;
                    if (y < top) top = y;
                    if (y > bottom) bottom = y;
                }
            }
        }
        if (right < left || bottom < top) return new Rectangle(0, 0, w, h);
        return Rectangle.FromLTRB(left, top, right + 1, bottom + 1);
    }

    public static Bitmap Crop(Bitmap bmp, Rectangle r)
    {
        if (r.Width <= 0 || r.Height <= 0) return (Bitmap)bmp.Clone();
        var outBmp = new Bitmap(r.Width, r.Height, PixelFormat.Format32bppArgb);
        using (var g = Graphics.FromImage(outBmp))
        {
            g.CompositingMode = CompositingMode.SourceCopy;
            g.DrawImage(bmp, new Rectangle(0, 0, r.Width, r.Height), r, GraphicsUnit.Pixel);
        }
        return outBmp;
    }

    // 裁到内容，再按内容尺寸百分比留白，最后等比缩放到最大外框内
    public static Bitmap Fit(Bitmap bmp, int maxW, int maxH, double pad)
    {
        var r = Bounds(bmp, 8);
        var cropped = Crop(bmp, r);
        int padX = (int)Math.Round(cropped.Width * pad);
        int padY = (int)Math.Round(cropped.Height * pad);
        int cw = cropped.Width + padX * 2;
        int ch = cropped.Height + padY * 2;

        double scale = Math.Min((double)maxW / cw, (double)maxH / ch);
        if (scale > 1.0) scale = 1.0;
        int w = Math.Max(1, (int)Math.Round(cw * scale));
        int h = Math.Max(1, (int)Math.Round(ch * scale));

        var outBmp = new Bitmap(w, h, PixelFormat.Format32bppArgb);
        using (var g = Graphics.FromImage(outBmp))
        {
            g.Clear(Color.Transparent);
            g.InterpolationMode = InterpolationMode.HighQualityBicubic;
            g.PixelOffsetMode = PixelOffsetMode.HighQuality;
            g.SmoothingMode = SmoothingMode.AntiAlias;
            int dx = (int)Math.Round(padX * scale);
            int dy = (int)Math.Round(padY * scale);
            int dw = Math.Max(1, (int)Math.Round(cropped.Width * scale));
            int dh = Math.Max(1, (int)Math.Round(cropped.Height * scale));
            g.DrawImage(cropped, new Rectangle(dx, dy, dw, dh));
        }
        return outBmp;
    }

    // 合成到白底画布（画布尺寸贴合内容，四周留 pad）
    public static Bitmap OnWhiteAuto(Bitmap fitted, double pad)
    {
        int px = (int)Math.Round(fitted.Width * pad);
        int py = (int)Math.Round(fitted.Height * pad);
        int w = fitted.Width + px * 2;
        int h = fitted.Height + py * 2;
        var outBmp = new Bitmap(w, h, PixelFormat.Format32bppArgb);
        using (var g = Graphics.FromImage(outBmp))
        {
            g.Clear(Color.FromArgb(255, 255, 255, 255));
            g.InterpolationMode = InterpolationMode.HighQualityBicubic;
            g.PixelOffsetMode = PixelOffsetMode.HighQuality;
            g.DrawImage(fitted, px, py, fitted.Width, fitted.Height);
        }
        return outBmp;
    }

    // 合成到纯白画布（居中留白 pad）
    public static Bitmap OnWhite(Bitmap fitted, int size, double pad)
    {
        var outBmp = new Bitmap(size, size, PixelFormat.Format32bppArgb);
        using (var g = Graphics.FromImage(outBmp))
        {
            g.Clear(Color.FromArgb(255, 255, 255, 255));
            g.InterpolationMode = InterpolationMode.HighQualityBicubic;
            g.PixelOffsetMode = PixelOffsetMode.HighQuality;
            int inner = (int)Math.Round(size * (1 - pad * 2));
            double scale = Math.Min((double)inner / fitted.Width, (double)inner / fitted.Height);
            int w = Math.Max(1, (int)Math.Round(fitted.Width * scale));
            int h = Math.Max(1, (int)Math.Round(fitted.Height * scale));
            g.DrawImage(fitted, new Rectangle((size - w) / 2, (size - h) / 2, w, h));
        }
        return outBmp;
    }

    // 正方形外框里取圆，圆外透明
    public static Bitmap Circle(Bitmap bmp, int size, double fill)
    {
        var outBmp = new Bitmap(size, size, PixelFormat.Format32bppArgb);
        using (var g = Graphics.FromImage(outBmp))
        {
            g.Clear(Color.Transparent);
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.InterpolationMode = InterpolationMode.HighQualityBicubic;
            int inner = (int)Math.Round(size * fill);
            double scale = Math.Min((double)inner / bmp.Width, (double)inner / bmp.Height);
            int w = Math.Max(1, (int)Math.Round(bmp.Width * scale));
            int h = Math.Max(1, (int)Math.Round(bmp.Height * scale));

            using (var path = new GraphicsPath())
            {
                path.AddEllipse((size - w) / 2, (size - h) / 2, w, h);
                g.SetClip(path);
                g.DrawImage(bmp, new Rectangle((size - w) / 2, (size - h) / 2, w, h));
            }
        }
        return outBmp;
    }

    // 取上方比例区域（头部特写）
    public static Bitmap TopCrop(Bitmap bmp, double ratio)
    {
        int h = Math.Max(1, (int)Math.Round(bmp.Height * ratio));
        return Crop(bmp, new Rectangle(0, 0, bmp.Width, h));
    }

    public static void Save(Bitmap bmp, string path)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(path)));
        bmp.Save(path, ImageFormat.Png);
        bmp.Dispose();
    }

    // Windows ICO：仅 256 允许 PNG 帧，其余必须 DIB
    public static void SaveIco(string pngPath, string icoPath, int[] sizes, double pad)
    {
        var src = Load(pngPath);
        var frames = new List<byte[]>();

        foreach (int size in sizes)
        {
            var canvas = new Bitmap(size, size, PixelFormat.Format32bppArgb);
            var trimmed = Fit(src, size, size, pad);
            using (var g = Graphics.FromImage(canvas))
            {
                g.Clear(Color.Transparent);
                g.InterpolationMode = InterpolationMode.HighQualityBicubic;
                g.PixelOffsetMode = PixelOffsetMode.HighQuality;
                g.DrawImage(trimmed, (size - trimmed.Width) / 2, (size - trimmed.Height) / 2);
            }

            if (size >= 256)
            {
                using (var ms = new MemoryStream())
                {
                    canvas.Save(ms, ImageFormat.Png);
                    frames.Add(ms.ToArray());
                }
                canvas.Dispose();
                continue;
            }

            var rect = new Rectangle(0, 0, size, size);
            var data = canvas.LockBits(rect, ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
            byte[] pixels = new byte[data.Stride * size];
            Marshal.Copy(data.Scan0, pixels, 0, pixels.Length);
            canvas.UnlockBits(data);
            canvas.Dispose();

            int maskStride = ((size + 31) / 32) * 4;
            int andSize = maskStride * size;
            int xorSize = size * size * 4;
            int dibSize = 40 + xorSize + andSize;

            using (var ms = new MemoryStream())
            using (var bw = new BinaryWriter(ms))
            {
                bw.Write(40);
                bw.Write(size);
                bw.Write(size * 2);
                bw.Write((ushort)1);
                bw.Write((ushort)32);
                bw.Write(0);
                bw.Write(xorSize + andSize);
                bw.Write(0); bw.Write(0);
                bw.Write(0); bw.Write(0);

                for (int y = size - 1; y >= 0; y--)
                {
                    for (int x = 0; x < size; x++)
                    {
                        int o = y * data.Stride + x * 4;
                        bw.Write(pixels[o]);
                        bw.Write(pixels[o + 1]);
                        bw.Write(pixels[o + 2]);
                        bw.Write(pixels[o + 3]);
                    }
                }

                byte[] andMask = new byte[andSize];
                for (int y = 0; y < size; y++)
                {
                    for (int x = 0; x < size; x++)
                    {
                        int o = y * data.Stride + x * 4;
                        if (pixels[o + 3] == 0)
                        {
                            int bitIndex = (size - 1 - y) * maskStride + (x / 8);
                            andMask[bitIndex] |= (byte)(0x80 >> (x % 8));
                        }
                    }
                }
                bw.Write(andMask);
                frames.Add(ms.ToArray());
            }
        }

        src.Dispose();

        Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(icoPath)));
        using (var fs = new FileStream(icoPath, FileMode.Create, FileAccess.Write))
        using (var bw = new BinaryWriter(fs))
        {
            bw.Write((ushort)0);
            bw.Write((ushort)1);
            bw.Write((ushort)frames.Count);
            int offset = 6 + 16 * frames.Count;
            for (int i = 0; i < frames.Count; i++)
            {
                int size = sizes[i];
                bw.Write((byte)(size >= 256 ? 0 : size));
                bw.Write((byte)(size >= 256 ? 0 : size));
                bw.Write((byte)0);
                bw.Write((byte)0);
                bw.Write((ushort)1);
                bw.Write((ushort)32);
                bw.Write(frames[i].Length);
                bw.Write(offset);
                offset += frames[i].Length;
            }
            foreach (var f in frames) bw.Write(f);
        }
    }
}
'@ -ReferencedAssemblies System.Drawing

if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Force -Path $OutDir | Out-Null }

function Get-Source([string]$name) {
  $p = Join-Path $SourceDir $name
  if (-not (Test-Path $p)) { throw "缺少源图：$p" }
  return (Resolve-Path $p).Path
}

# 透明成品：裁边 → 缩放 → 保留 alpha
function New-Transparent([string]$srcName, [string]$outName, [int]$maxW, [int]$maxH, [double]$pad = 0.04) {
  $bmp = [Art2]::Load((Get-Source $srcName))
  $fitted = [Art2]::Fit($bmp, $maxW, $maxH, $pad)
  [Art2]::Save($fitted, (Join-Path $OutDir $outName))
  Write-Host ("  {0,-32} {1}x{2}" -f $outName, $fitted.Width, $fitted.Height)
}

# 白底成品：透明图合成到白底画布（画布按内容比例，只留一圈窄边）
function New-White([string]$srcName, [string]$outName, [int]$maxW, [int]$maxH, [double]$pad = 0.02, [double]$platePad = 0.06) {
  $bmp = [Art2]::Load((Get-Source $srcName))
  $fitted = [Art2]::Fit($bmp, $maxW, $maxH, $pad)
  $flat = [Art2]::OnWhiteAuto($fitted, $platePad)
  Write-Host ("  {0,-32} {1}x{2} (白底)" -f $outName, $flat.Width, $flat.Height)
  [Art2]::Save($flat, (Join-Path $OutDir $outName))
}

function New-Circle([string]$srcName, [string]$outName, [int]$size, [double]$fill = 0.94) {
  $bmp = [Art2]::Load((Get-Source $srcName))
  $fitted = [Art2]::Fit($bmp, $size, $size, 0.0)
  $disc = [Art2]::Circle($fitted, $size, $fill)
  [Art2]::Save($disc, (Join-Path $OutDir $outName))
  Write-Host ("  {0,-32} {1}x{2} (圆形)" -f $outName, $disc.Width, $disc.Height)
}

function New-Head([string]$srcName, [string]$outName, [int]$size, [double]$ratio = 0.62, [double]$fill = 0.96) {
  $bmp = [Art2]::Load((Get-Source $srcName))
  $fitted = [Art2]::Fit($bmp, 900, 900, 0.02)
  $head = [Art2]::TopCrop($fitted, $ratio)
  $disc = [Art2]::Circle($head, $size, $fill)
  [Art2]::Save($disc, (Join-Path $OutDir $outName))
  Write-Host ("  {0,-32} {1}x{2} (圆头)" -f $outName, $disc.Width, $disc.Height)
}

Write-Host "== 品牌图标 ==" -ForegroundColor Cyan
foreach ($s in @(32, 64, 128, 256)) {
  New-Transparent "app-icon.png" ("brand-{0}.png" -f $s) $s $s 0.02
}
$bmp = [Art2]::Load((Get-Source "app-icon.png"))
$fitted = [Art2]::Fit($bmp, 132, 132, 0.02)
$flat = [Art2]::OnWhite($fitted, 144, 0.04)
[Art2]::Save($flat, (Join-Path $OutDir "brand-128-flat.png"))
Write-Host "  brand-128-flat.png               144x144 (白底)"

Write-Host "== 看板娘 ==" -ForegroundColor Cyan
New-Transparent "xiaoning-portrait.png" "xiaoning-portrait.png" 720 720 0.02
New-Circle "xiaoning-portrait.png" "xiaoning-portrait-disc.png" 790 0.98
New-Transparent "xiaoning-avatar.png" "xiaoning-256.png" 256 256 0.02
New-Transparent "xiaoning-avatar.png" "xiaoning-128.png" 128 128 0.02
New-Transparent "xiaoning-fullbody.png" "xiaoning-fullbody.png" 640 960 0.02
New-Transparent "xiaoning-fullbody-code.png" "xiaoning-fullbody-code.png" 720 720 0.02
New-Transparent "xiaoning-fullbody-think.png" "xiaoning-fullbody-think.png" 640 960 0.02

Write-Host "== 表情 ==" -ForegroundColor Cyan
foreach ($m in @('cheer', 'happy', 'sorry', 'think', 'wow')) {
  New-Transparent ("xiaoning-face-{0}.png" -f $m) ("face-{0}.png" -f $m) 512 512 0.02
  New-Circle ("xiaoning-face-{0}.png" -f $m) ("face-{0}-disc.png" -f $m) 172 0.92
  New-Head ("xiaoning-face-{0}.png" -f $m) ("face-{0}-head.png" -f $m) 160 0.62 0.96
}

Write-Host "== 场景图（透明 + 白底） ==" -ForegroundColor Cyan
New-Transparent "scene-empty.png" "scene-empty.png" 760 570 0.02
New-White "scene-empty.png" "scene-empty-card.png" 520 390 0.02 0.05

New-Transparent "scene-about.png" "scene-about.png" 900 600 0.02
New-White "scene-about.png" "scene-about-card.png" 760 507 0.02 0.04

New-Transparent "scene-splash.png" "scene-splash.png" 720 720 0.02
New-White "scene-splash.png" "scene-splash-card.png" 520 520 0.02 0.04

Write-Host "== 应用图标 ico ==" -ForegroundColor Cyan
[Art2]::SaveIco((Get-Source "app-icon.png"), (Join-Path (Get-Location) "build/icon.ico"), @(16, 24, 32, 48, 64, 128, 256), 0.02)
Write-Host "  build/icon.ico                  7 帧"

Write-Host "== 启动页副本 ==" -ForegroundColor Cyan
$bmp = [Art2]::Load((Get-Source "xiaoning-portrait.png"))
$fitted = [Art2]::Fit($bmp, 512, 512, 0.0)
$disc = [Art2]::Circle($fitted, 512, 0.98)
$flat = [Art2]::OnWhite($disc, 512, 0.0)
[Art2]::Save($flat, (Join-Path (Get-Location) "electron/assets/xiaoning-portrait.png"))
Write-Host "  electron/assets/xiaoning-portrait.png  512x512 (白底圆盘)"

Write-Host ""
Write-Host "完成。" -ForegroundColor Green
