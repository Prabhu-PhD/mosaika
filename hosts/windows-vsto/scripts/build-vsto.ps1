param(
  [ValidateSet('Debug', 'Release')]
  [string]$Configuration = 'Release'
)

$ErrorActionPreference = 'Stop'
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..\..')
$VstoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')

Write-Host "1/3 Building @bento/contract, @bento/core, @bento/ui, and @bento/vsto-web..." -ForegroundColor Cyan
Push-Location $RepoRoot
try {
  pnpm --filter @bento/contract build
  pnpm --filter @bento/core build
  pnpm --filter @bento/ui build
  pnpm --filter @bento/vsto-web build
} finally {
  Pop-Location
}

Write-Host "2/3 Building Mosaika.PowerPointAddIn (.NET Framework 4.8, $Configuration)..." -ForegroundColor Cyan
dotnet build (Join-Path $VstoRoot 'Mosaika.PowerPointAddIn.sln') -c $Configuration

Write-Host "3/3 Running .NET 4.8 unit tests..." -ForegroundColor Cyan
dotnet test (Join-Path $VstoRoot 'Mosaika.PowerPointAddIn.Tests\Mosaika.PowerPointAddIn.Tests.csproj') -c $Configuration --no-build

$OutDll = Join-Path $VstoRoot "Mosaika.PowerPointAddIn\bin\$Configuration\net48\Mosaika.PowerPointAddIn.dll"
Write-Host "`nBuild succeeded! Output DLL:" -ForegroundColor Green
Write-Host "  $OutDll"
Write-Host "Next: run .\hosts\windows-vsto\scripts\register-addin.ps1 -Configuration $Configuration" -ForegroundColor Yellow
