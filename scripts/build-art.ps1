<#
.SYNOPSIS
    把 assets/art 下的源图（纯白背景）处理成可直接使用的成品：
    抠白底 → 裁掉多余留白 → 缩放 → 生成多尺寸 ico。

.DESCRIPTION
    依赖 System.Drawing（Windows PowerShell / PowerShell 7 均可）。
    源图要求：纯白背景、主体不贴边。
    产物：
      public\art\*.png      品牌图标、看板娘、表情、场景
      build\icon.ico        多尺寸应用图标

.EXAMPLE
    pwsh -File scripts/build-art.ps1
#>
param(
    [string]$SourceDir = "assets\art",
    [string]$OutDir = "public\art"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;

public static class ArtTool{
    // 从四边泛洪，把与边界连通的近白像素判为背景
    public static Bitmap CutWhite(string path, int tolerance = 26)
    {
        var src = new Bitmap(path);
        int w = src.Width, h = src.Height;
        var rect = new Rectangle(0, 0, w, h);
        var data = src.LockBits(rect, ImageLockMode.ReadWrite, PixelFormat.Format32bppArgb);
        int stride = data.Stride;
        int len = stride * h;
        byte[] buf = new byte[len];
        Marshal.Copy(data.Scan0, buf, 0, len);

        bool[] bg = new bool[w * h];
        var queue = new Queue<int>();
        int whiteMin = 255 - tolerance;

        Func<int, bool> isWhite = idx =>
        {
            int y = idx / w, x = idx % w;
            int p = y * stride + x * 4;
            int b = buf[p], g = buf[p + 1], r = buf[p + 2];
            int mn = Math.Min(r, Math.Min(g, b));
            int mx = Math.Max(r, Math.Max(g, b));
            return mn >= whiteMin && (mx - mn) <= 12;
        };

        for (int x = 0; x < w; x++)
        {
            int top = x, bottom = (h - 1) * w + x;
            if (!bg[top]) { bg[top] = true; queue.Enqueue(top); }
            if (!bg[bottom]) { bg[bottom] = true; queue.Enqueue(bottom); }
        }
        for (int y = 0; y < h; y++)
        {
            int left = y * w, right = y * w + (w - 1);
            if (!bg[left]) { bg[left] = true; queue.Enqueue(left); }
            if (!bg[right]) { bg[right] = true; queue.Enqueue(right); }
        }

        int[] dx = { 1, -1, 0, 0 };
        int[] dy = { 0, 0, 1, -1 };
        while (queue.Count > 0)
        {
            int idx = queue.Dequeue();
            int y = idx / w, x = idx % w;
            for (int k = 0; k < 4; k++)
            {
                int nx = x + dx[k], ny = y + dy[k];
                if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
                int ni = ny * w + nx;
                if (bg[ni]) continue;
                if (isWhite(ni)) { bg[ni] = true; queue.Enqueue(ni); }
            }
        }

        // 腐蚀 1px：把紧贴背景的前景像素也去掉，避免深色主题下的白色描边
        bool[] shrink = (bool[])bg.Clone();
        for (int y = 0; y < h; y++)
        {
            for (int x = 0; x < w; x++)
            {
                int idx = y * w + x;
                if (bg[idx]) continue;
                bool touches = false;
                for (int k = 0; k < 4 && !touches; k++)
                {
                    int nx = x + dx[k], ny = y + dy[k];
                    if (nx < 0 || ny < 0 || nx >= w || ny >= h) { touches = true; break; }
                    if (bg[ny * w + nx]) touches = true;
                }
                if (touches) shrink[idx] = true;
            }
        }

        for (int y = 0; y < h; y++)
        {
            for (int x = 0; x < w; x++)
            {
                int idx = y * w + x;
                int p = y * stride + x * 4;
                if (shrink[idx])
                {
                    buf[p] = 0; buf[p + 1] = 0; buf[p + 2] = 0; buf[p + 3] = 0;
                }
                else
                {
                    buf[p + 3] = 255;
                }
            }
        }

        Marshal.Copy(buf, 0, data.Scan0, len);
        src.UnlockBits(data);
        return src;
    }

    public static Rectangle ContentBounds(Bitmap bmp)
    {
        int w = bmp.Width, h = bmp.Height;
        var rect = new Rectangle(0, 0, w, h);
        var data = bmp.LockBits(rect, ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
        int stride = data.Stride;
        byte[] buf = new byte[stride * h];
        Marshal.Copy(data.Scan0, buf, 0, buf.Length);
        bmp.UnlockBits(data);

        int minX = w, minY = h, maxX = -1, maxY = -1;
        for (int y = 0; y < h; y++)
        {
            for (int x = 0; x < w; x++)
            {
                byte a = buf[y * stride + x * 4 + 3];
                if (a > 12)
                {
                    if (x < minX) minX = x;
                    if (x > maxX) maxX = x;
                    if (y < minY) minY = y;
                    if (y > maxY) maxY = y;
                }
            }
        }
        if (maxX < 0) return rect;
        return Rectangle.FromLTRB(minX, minY, maxX + 1, maxY + 1);
    }

    static Bitmap EnsureArgb(Bitmap src)
    {
        var dst = new Bitmap(src.Width, src.Height, PixelFormat.Format32bppArgb);
        using (var g = Graphics.FromImage(dst))
        {
            g.CompositingMode = CompositingMode.SourceCopy;
            g.DrawImage(src, new Rectangle(0, 0, src.Width, src.Height));
        }
        return dst;
    }

    // 裁到内容边界，再按内容尺寸的百分比留白
    public static Bitmap TrimPad(Bitmap bmp, double padPercent = 0.08)
    {
        var b = ContentBounds(bmp);
        var src = EnsureArgb(bmp);
        int padX = (int)Math.Round(b.Width * padPercent);
        int padY = (int)Math.Round(b.Height * padPercent);
        int cw = b.Width + padX * 2;
        int ch = b.Height + padY * 2;
        var outBmp = new Bitmap(cw, ch, PixelFormat.Format32bppArgb);
        using (var g = Graphics.FromImage(outBmp))
        {
            g.Clear(Color.Transparent);
            g.InterpolationMode = InterpolationMode.HighQualityBicubic;
            g.PixelOffsetMode = PixelOffsetMode.HighQuality;
            g.DrawImage(src, new Rectangle(padX, padY, b.Width, b.Height), b, GraphicsUnit.Pixel);
        }
        src.Dispose();
        return outBmp;
    }

    // 等比缩放进 maxW × maxH 的盒子
    public static Bitmap Fit(Bitmap bmp, int maxW, int maxH)
    {
        double scale = Math.Min((double)maxW / bmp.Width, (double)maxH / bmp.Height);
        int w = Math.Max(1, (int)Math.Round(bmp.Width * scale));
        int h = Math.Max(1, (int)Math.Round(bmp.Height * scale));
        var outBmp = new Bitmap(w, h, PixelFormat.Format32bppArgb);
        using (var g = Graphics.FromImage(outBmp))
        {
            g.Clear(Color.Transparent);
            g.InterpolationMode = InterpolationMode.HighQualityBicubic;
            g.PixelOffsetMode = PixelOffsetMode.HighQuality;
            g.SmoothingMode = SmoothingMode.HighQuality;
            g.DrawImage(bmp, new Rectangle(0, 0, w, h));
        }
        return outBmp;
    }

    // 取上半部分（头部特写用），用于小尺寸头像
    public static Bitmap CropTop(Bitmap bmp, double ratio)
    {
        int h = Math.Max(1, (int)Math.Round(bmp.Height * ratio));
        var outBmp = new Bitmap(bmp.Width, h, PixelFormat.Format32bppArgb);
        using (var g = Graphics.FromImage(outBmp))
        {
            g.Clear(Color.Transparent);
            g.DrawImage(bmp, new Rectangle(0, 0, bmp.Width, h),
                new Rectangle(0, 0, bmp.Width, h), GraphicsUnit.Pixel);
        }
        return outBmp;
    }

    // 居中裁成正方形（头像用）
    public static Bitmap CropCenterSquare(Bitmap bmp)
    {
        int side = Math.Min(bmp.Width, bmp.Height);
        int x = (bmp.Width - side) / 2;
        int y = (bmp.Height - side) / 2;
        var outBmp = new Bitmap(side, side, PixelFormat.Format32bppArgb);
        using (var g = Graphics.FromImage(outBmp))
        {
            g.Clear(Color.Transparent);
            g.DrawImage(bmp, new Rectangle(0, 0, side, side),
                new Rectangle(x, y, side, side), GraphicsUnit.Pixel);
        }
        return outBmp;
    }

    public static void SavePng(Bitmap bmp, string path)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(path));
        bmp.Save(path, ImageFormat.Png);
    }

    // 生成多尺寸 ico（PNG 压缩格式，Vista 及以上支持）
    public static void SaveIco(string sourcePng, string outPath, int[] sizes, double padPercent = 0.04)
    {
        var frames = new List<byte[]>();
        using (var src = new Bitmap(sourcePng))
        {
            foreach (int size in sizes)
            {
                var canvas = new Bitmap(size, size, PixelFormat.Format32bppArgb);
                using (var g = Graphics.FromImage(canvas))
                {
                    g.Clear(Color.Transparent);
                    g.InterpolationMode = InterpolationMode.HighQualityBicubic;
                    g.PixelOffsetMode = PixelOffsetMode.HighQuality;
                    g.SmoothingMode = SmoothingMode.HighQuality;
                    int pad = (int)Math.Round(size * padPercent);
                    int box = size - pad * 2;
                    double scale = Math.Min((double)box / src.Width, (double)box / src.Height);
                    int w = Math.Max(1, (int)Math.Round(src.Width * scale));
                    int h = Math.Max(1, (int)Math.Round(src.Height * scale));
                    g.DrawImage(src, new Rectangle((size - w) / 2, (size - h) / 2, w, h));
                }
                using (var ms = new MemoryStream())
                {
                    canvas.Save(ms, ImageFormat.Png);
                    frames.Add(ms.ToArray());
                }
                canvas.Dispose();
            }
        }

        Directory.CreateDirectory(Path.GetDirectoryName(outPath));
        using (var fs = new FileStream(outPath, FileMode.Create, FileAccess.Write))
        using (var bw = new BinaryWriter(fs))
        {
            bw.Write((ushort)0);            // reserved
            bw.Write((ushort)1);            // type = icon
            bw.Write((ushort)frames.Count); // count
            int offset = 6 + 16 * frames.Count;
            for (int i = 0; i < frames.Count; i++)
            {
                int size = sizes[i];
                bw.Write((byte)(size >= 256 ? 0 : size));
                bw.Write((byte)(size >= 256 ? 0 : size));
                bw.Write((byte)0);   // palette
                bw.Write((byte)0);   // reserved
                bw.Write((ushort)1); // planes
                bw.Write((ushort)32);// bpp
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
if (-not (Test-Path "build")) { New-Item -ItemType Directory -Force -Path "build" | Out-Null }

function Get-Source([string]$name) {
    $p = Join-Path $SourceDir $name
    if (-not (Test-Path $p)) { throw "缺少源图：$p" }
    return (Resolve-Path $p).Path
}

function New-Art([string]$srcName, [string]$outName, [int]$maxW, [int]$maxH, [double]$pad = 0.06, [bool]$cut = $true) {
    $src = Get-Source $srcName
    $bmp = if ($cut) { [ArtTool]::CutWhite($src) } else { New-Object System.Drawing.Bitmap $src }
    $trimmed = [ArtTool]::TrimPad($bmp, $pad)
    $fitted = [ArtTool]::Fit($trimmed, $maxW, $maxH)
    $out = Join-Path $OutDir $outName
    [ArtTool]::SavePng($fitted, $out)
    "{0,-34} {1,5}x{2,-5} {3:N0} KB" -f $outName, $fitted.Width, $fitted.Height, ((Get-Item $out).Length / 1KB)
    $bmp.Dispose(); $trimmed.Dispose(); $fitted.Dispose()
}

Write-Host "== 品牌图标 ==" -ForegroundColor Cyan
New-Art "app-icon.png" "brand-128.png" 128 128 0.04
New-Art "app-icon.png" "brand-64.png" 64 64 0.04
New-Art "app-icon.png" "brand-32.png" 32 32 0.04

Write-Host "== 看板娘 ==" -ForegroundColor Cyan
New-Art "xiaoning-fullbody.png" "xiaoning-fullbody.png" 720 1080 0.02
New-Art "xiaoning-portrait.png" "xiaoning-portrait.png" 760 760 0.02
New-Art "scene-splash.png" "scene-splash.png" 820 820 0.02

Write-Host "== 头像（保留白底圆盘，不抠） ==" -ForegroundColor Cyan
New-Art "xiaoning-avatar.png" "xiaoning-256.png" 256 256 0.0 $false
New-Art "xiaoning-avatar.png" "xiaoning-128.png" 128 128 0.0 $false

Write-Host "== 表情 ==" -ForegroundColor Cyan
foreach ($face in @("happy", "think", "sorry", "cheer", "wow")) {
    New-Art "xiaoning-face-$face.png" "face-$face.png" 220 220 0.03
}

Write-Host "== 表情头部特写（气泡/小头像用） ==" -ForegroundColor Cyan
foreach ($face in @("happy", "think", "sorry", "cheer", "wow")) {
    $src = Get-Source "xiaoning-face-$face.png"
    $bmp = [ArtTool]::CutWhite($src)
    $trimmed = [ArtTool]::TrimPad($bmp, 0.03)
    $head = [ArtTool]::CropCenterSquare([ArtTool]::CropTop($trimmed, 0.62))
    $fitted = [ArtTool]::Fit($head, 160, 160)
    $out = Join-Path $OutDir "face-$face-head.png"
    [ArtTool]::SavePng($fitted, $out)
    "{0,-34} {1,5}x{2,-5} {3:N0} KB" -f "face-$face-head.png", $fitted.Width, $fitted.Height, ((Get-Item $out).Length / 1KB)
    $bmp.Dispose(); $trimmed.Dispose(); $head.Dispose(); $fitted.Dispose()
}

Write-Host "== 场景 ==" -ForegroundColor Cyan
New-Art "scene-empty.png" "scene-empty.png" 760 570 0.03
New-Art "scene-about.png" "scene-about.png" 1100 733 0.03

Write-Host "== 场景（不抠图，白底卡片版） ==" -ForegroundColor Cyan
New-Art "scene-empty.png" "scene-empty-card.png" 520 390 0.0 $false
New-Art "scene-about.png" "scene-about-card.png" 760 507 0.0 $false
New-Art "scene-splash.png" "scene-splash-card.png" 520 520 0.0 $false
Write-Host "== 应用图标 ico ==" -ForegroundColor Cyan
$iconSource = Join-Path $OutDir "brand-256.png"
$bmp = [ArtTool]::CutWhite((Get-Source "app-icon.png"))
$trimmed = [ArtTool]::TrimPad($bmp, 0.03)
$fitted = [ArtTool]::Fit($trimmed, 256, 256)
[ArtTool]::SavePng($fitted, $iconSource)
[ArtTool]::SaveIco($iconSource, (Join-Path $root "build\icon.ico"), @(16, 24, 32, 48, 64, 128, 256), 0.02)
$bmp.Dispose(); $trimmed.Dispose(); $fitted.Dispose()
"build\icon.ico                 {0:N0} KB" -f ((Get-Item "build\icon.ico").Length / 1KB)

Write-Host ""
Write-Host "完成。产物目录：$OutDir" -ForegroundColor Green
