<#
.SYNOPSIS
    生成一个用于本地联调的代码签名证书，并对安装包签名。

.DESCRIPTION
    自签名证书不能消除 SmartScreen 警告，只能用来验证「签名流程本身是否跑通」。
    正式发布必须换成正规 CA 签发的证书（见 docs/代码签名.md）。

.PARAMETER Subject
    证书主体，默认 CN=Auspicious3798。

.PARAMETER Password
    导出 pfx 时使用的密码，默认 muling-dev。

.PARAMETER SignTarget
    需要签名的 exe，默认取 dist_electron 下最新的 Setup.exe；传空字符串则只生成证书。

.EXAMPLE
    pwsh -File scripts/make-dev-cert.ps1
    pwsh -File scripts/make-dev-cert.ps1 -SignTarget "dist_electron\沐柠环境盒-Setup-v1.0.0.exe"
#>
param(
    [string]$Subject = "CN=Auspicious3798",
    [string]$Password = "muling-dev",
    [string]$SignTarget = ""
)

$ErrorActionPreference = "Stop"
$certDir = Join-Path $PSScriptRoot "..\build\certs"
$pfxPath = Join-Path $certDir "dev-signing.pfx"

New-Item -ItemType Directory -Force -Path $certDir | Out-Null

Write-Host "[1/4] 生成自签名证书（$Subject）…" -ForegroundColor Cyan
$cert = New-SelfSignedCertificate `
    -Type CodeSigningCert `
    -Subject $Subject `
    -KeyUsage DigitalSignature `
    -KeyExportPolicy Exportable `
    -KeyLength 2048 `
    -KeyAlgorithm RSA `
    -HashAlgorithm SHA256 `
    -CertStoreLocation "Cert:\CurrentUser\My" `
    -NotAfter (Get-Date).AddYears(2)

Write-Host "      指纹：$($cert.Thumbprint)"

Write-Host "[2/4] 导出 pfx → $pfxPath" -ForegroundColor Cyan
$secure = ConvertTo-SecureString -String $Password -Force -AsPlainText
Export-PfxCertificate -Cert $cert -FilePath $pfxPath -Password $secure | Out-Null

Write-Host "[3/4] 把证书装进「受信任的根证书颁发机构」（仅本机联调用）…" -ForegroundColor Cyan
$cerPath = Join-Path $certDir "dev-signing.cer"
Export-Certificate -Cert $cert -FilePath $cerPath | Out-Null
Import-Certificate -FilePath $cerPath -CertStoreLocation "Cert:\CurrentUser\Root" | Out-Null

if (-not $SignTarget) {
    $SignTarget = (Get-ChildItem -Path (Join-Path $PSScriptRoot "..\dist_electron") -Filter "*Setup*.exe" -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1).FullName
}

if (-not $SignTarget) {
    Write-Host "[4/4] 没有找到安装包，跳过签名" -ForegroundColor Yellow
} else {
    Write-Host "[4/4] 签名：$(Split-Path $SignTarget -Leaf)" -ForegroundColor Cyan
    $signtool = (Get-ChildItem "${env:ProgramFiles(x86)}\Windows Kits\10\bin" -Filter signtool.exe -Recurse -ErrorAction SilentlyContinue |
        Where-Object { $_.FullName -match 'x64' } |
        Sort-Object FullName -Descending |
        Select-Object -First 1).FullName

    if (-not $signtool) {
        Write-Host "      找不到 signtool.exe，请安装 Windows SDK；或改用 electron-builder 的 CSC_LINK 方式" -ForegroundColor Yellow
        exit 1
    }

    & $signtool sign /fd SHA256 /f $pfxPath /p $Password /tr http://timestamp.digicert.com /td SHA256 $SignTarget
    & $signtool verify /pa /v $SignTarget
}

Write-Host ""
Write-Host "完成。pfx 路径：$pfxPath" -ForegroundColor Green
Write-Host "联调时这样用：" -ForegroundColor Green
Write-Host "  `$env:CSC_LINK = '$pfxPath'"
Write-Host "  `$env:CSC_KEY_PASSWORD = '$Password'"
Write-Host "  npm run electron:build"
