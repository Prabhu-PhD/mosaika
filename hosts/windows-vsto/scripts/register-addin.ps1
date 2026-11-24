param(
  [ValidateSet('Debug', 'Release')]
  [string]$Configuration = 'Release'
)

$ErrorActionPreference = 'Stop'
$VstoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$DllPath = Join-Path $VstoRoot "Mosaika.PowerPointAddIn\bin\$Configuration\net48\Mosaika.PowerPointAddIn.dll"

if (-not (Test-Path $DllPath)) {
  throw "Add-in DLL not found at '$DllPath'. Run build-vsto.ps1 -Configuration $Configuration first."
}

$CodeBaseUri = ([System.Uri]$DllPath).AbsoluteUri
$AssemblyFullName = "Mosaika.PowerPointAddIn, Version=1.0.0.0, Culture=neutral, PublicKeyToken=null"

function Register-ComClass {
  param(
    [string]$Guid,
    [string]$ProgId,
    [string]$ClassName
  )

  $clsidKey = "HKCU:\Software\Classes\CLSID\$Guid"
  $inprocKey = "$clsidKey\InprocServer32"
  $versionKey = "$inprocKey\1.0.0.0"
  $categoryKey = "$clsidKey\Implemented Categories\{62C8FE65-4EBB-45e7-B440-6E39B2CDBF29}"
  $progIdKey = "HKCU:\Software\Classes\$ProgId"
  $progIdClsidKey = "$progIdKey\CLSID"

  New-Item -Path $versionKey -Force | Out-Null
  New-Item -Path "$clsidKey\ProgId" -Force | Out-Null
  New-Item -Path $categoryKey -Force | Out-Null
  New-Item -Path $progIdClsidKey -Force | Out-Null

  Set-ItemProperty -Path $clsidKey -Name '(Default)' -Value $ClassName
  Set-ItemProperty -Path "$clsidKey\ProgId" -Name '(Default)' -Value $ProgId
  Set-ItemProperty -Path $inprocKey -Name '(Default)' -Value 'mscoree.dll'
  Set-ItemProperty -Path $inprocKey -Name 'ThreadingModel' -Value 'Both'
  Set-ItemProperty -Path $inprocKey -Name 'Class' -Value $ClassName
  Set-ItemProperty -Path $inprocKey -Name 'Assembly' -Value $AssemblyFullName
  Set-ItemProperty -Path $inprocKey -Name 'RuntimeVersion' -Value 'v4.0.30319'
  Set-ItemProperty -Path $inprocKey -Name 'CodeBase' -Value $CodeBaseUri

  Set-ItemProperty -Path $versionKey -Name 'Class' -Value $ClassName
  Set-ItemProperty -Path $versionKey -Name 'Assembly' -Value $AssemblyFullName
  Set-ItemProperty -Path $versionKey -Name 'RuntimeVersion' -Value 'v4.0.30319'
  Set-ItemProperty -Path $versionKey -Name 'CodeBase' -Value $CodeBaseUri

  Set-ItemProperty -Path $progIdKey -Name '(Default)' -Value $ClassName
  Set-ItemProperty -Path $progIdClsidKey -Name '(Default)' -Value $Guid
}

Write-Host "Registering Mosaika PowerPoint Add-in per-user (HKCU, no Admin required)..." -ForegroundColor Cyan

# 1. Register Add-in COM Connect class
Register-ComClass `
  -Guid '{B7E4F3A1-8C24-4B9E-9A1D-2F6C5D8E1000}' `
  -ProgId 'Mosaika.PowerPointAddIn' `
  -ClassName 'Mosaika.PowerPointAddIn.AddInConnect'

# 2. Register WebView2 CustomTaskPane WinForms host control
Register-ComClass `
  -Guid '{B7E4F3A1-8C24-4B9E-9A1D-2F6C5D8E2001}' `
  -ProgId 'Mosaika.TaskPaneHostControl' `
  -ClassName 'Mosaika.PowerPointAddIn.TaskPaneHostControl'

# 3. Register PowerPoint Add-in auto-load entry (LoadBehavior = 3)
$pptAddInKey = 'HKCU:\Software\Microsoft\Office\PowerPoint\Addins\Mosaika.PowerPointAddIn'
New-Item -Path $pptAddInKey -Force | Out-Null
Set-ItemProperty -Path $pptAddInKey -Name 'FriendlyName' -Value 'Mosaika'
Set-ItemProperty -Path $pptAddInKey -Name 'Description' -Value 'Mosaika — Bounded Swiss Bento Layout Engine for PowerPoint'
New-ItemProperty -Path $pptAddInKey -Name 'LoadBehavior' -Value 3 -PropertyType DWord -Force | Out-Null

Write-Host "Registered successfully!" -ForegroundColor Green
Write-Host "  CodeBase: $CodeBaseUri"
Write-Host "Launch Microsoft PowerPoint and click 'Mosaika' on the Home ribbon tab." -ForegroundColor Yellow
