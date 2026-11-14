<#
.SYNOPSIS
    检查沐柠环境盒安装包的数字签名状态。

.DESCRIPTION
    遍历 dist_electron 下的 exe（或传入指定文件），打印 Authenticode 签名信息。
    签名有效的判定标准：Status = Valid 且 SignerCertificate 不为空。

.PARAMETER Path
    待检查的文件或目录，默认 dist_electron。

.EXAMPLE
    pwsh -File scripts/verify-signature.ps1
    pwsh -File scripts/verify-signature.ps1 -Path dist_electron\沐柠环境盒-Setup-v1.0.0.exe
#>
param(
    [string]$Path = "dist_electron"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $Path)) {
    Write-Host "[x] 找不到路径：$Path" -ForegroundColor Red
    exit 1
}

$targets = if ((Get-Item $Path).PSIsContainer) {
    Get-ChildItem -Path $Path -Filter *.exe -Recurse | Where-Object { $_.Length -gt 1MB }
} else {
    Get-Item $Path
}

if (-not $targets) {
    Write-Host "[x] 没有找到 exe 文件" -ForegroundColor Red
    exit 1
}

$failed = 0
foreach ($file in $targets) {
    $sig = Get-AuthenticodeSignature -FilePath $file.FullName
    $ok = $sig.Status -eq 'Valid' -and $sig.SignerCertificate -ne $null
    $color = if ($ok) { 'Green' } else { 'Red' }

    Write-Host ""
    Write-Host "文件：$($file.Name)" -ForegroundColor Cyan
    Write-Host "  大小：$([math]::Round($file.Length / 1MB, 1)) MB"
    Write-Host "  状态：$($sig.Status)" -ForegroundColor $color
    if ($sig.SignerCertificate) {
        Write-Host "  签名者：$($sig.SignerCertificate.Subject)"
        Write-Host "  颁发者：$($sig.SignerCertificate.Issuer)"
        Write-Host "  有效期：$($sig.SignerCertificate.NotBefore.ToString('yyyy-MM-dd')) ~ $($sig.SignerCertificate.NotAfter.ToString('yyyy-MM-dd'))"
        Write-Host "  时间戳：$(if ($sig.TimeStamperCertificate) { '已加盖' } else { '未加盖（证书过期后签名会失效）' })"
    } else {
        Write-Host "  签名者：无（未签名）"
        $failed++
    }
}

Write-Host ""
if ($failed -gt 0) {
    Write-Host "[!] $failed 个文件未签名或签名无效" -ForegroundColor Yellow
    exit 1
}
Write-Host "[√] 全部文件签名有效" -ForegroundColor Green
exit 0
