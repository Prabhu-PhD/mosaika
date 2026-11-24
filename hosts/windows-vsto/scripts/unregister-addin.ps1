$ErrorActionPreference = 'SilentlyContinue'

$keys = @(
  'HKCU:\Software\Microsoft\Office\PowerPoint\Addins\Mosaika.PowerPointAddIn',
  'HKCU:\Software\Classes\Mosaika.PowerPointAddIn',
  'HKCU:\Software\Classes\Mosaika.TaskPaneHostControl',
  'HKCU:\Software\Classes\CLSID\{B7E4F3A1-8C24-4B9E-9A1D-2F6C5D8E1000}',
  'HKCU:\Software\Classes\CLSID\{B7E4F3A1-8C24-4B9E-9A1D-2F6C5D8E2001}'
)

foreach ($key in $keys) {
  if (Test-Path $key) {
    Remove-Item -Path $key -Recurse -Force
    Write-Host "Removed $key"
  }
}

Write-Host "Mosaika PowerPoint Add-in unregistered cleanly." -ForegroundColor Green
