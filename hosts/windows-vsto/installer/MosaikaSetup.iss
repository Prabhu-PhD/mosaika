; Mosaika for PowerPoint — Per-User Windows Installer (Inno Setup 6)
; Installs to %LOCALAPPDATA%\Mosaika\PowerPointAddIn with zero Admin/UAC required.

#define MyAppName "Mosaika for PowerPoint"
#define MyAppShortName "Mosaika"
#define MyAppVersion "0.1.0"
#define MyAppPublisher "Mosaika"
#define MyAppExeCheck "POWERPNT.EXE"
#define SourceDir "..\Mosaika.PowerPointAddIn\bin\Release\net48"
#define AddInGuid "{{B7E4F3A1-8C24-4B9E-9A1D-2F6C5D8E1000}"
#define PaneGuid "{{B7E4F3A1-8C24-4B9E-9A1D-2F6C5D8E2001}"
#define NetCategoryGuid "{{62C8FE65-4EBB-45e7-B440-6E39B2CDBF29}"
#define AssemblyFullName "Mosaika.PowerPointAddIn, Version=1.0.0.0, Culture=neutral, PublicKeyToken=null"

[Setup]
AppId={{B7E4F3A1-8C24-4B9E-9A1D-2F6C5D8E9000}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={localappdata}\Mosaika\PowerPointAddIn
DisableProgramGroupPage=yes
DisableDirPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible x86compatible
OutputDir=..\dist
OutputBaseFilename=MosaikaSetup-{#MyAppVersion}
SetupIconFile=mosaika.ico
UninstallDisplayIcon={app}\mosaika.ico
UninstallDisplayName={#MyAppName}
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
CloseApplications=yes

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
Source: "mosaika.ico"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#SourceDir}\Mosaika.PowerPointAddIn.dll"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#SourceDir}\Newtonsoft.Json.dll"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#SourceDir}\Microsoft.Web.WebView2.Core.dll"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#SourceDir}\Microsoft.Web.WebView2.WinForms.dll"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#SourceDir}\runtimes\win-x64\native\WebView2Loader.dll"; DestDir: "{app}\runtimes\win-x64\native"; Flags: ignoreversion
Source: "{#SourceDir}\runtimes\win-x86\native\WebView2Loader.dll"; DestDir: "{app}\runtimes\win-x86\native"; Flags: ignoreversion
Source: "{#SourceDir}\webview\*"; DestDir: "{app}\webview"; Flags: ignoreversion recursesubdirs createallsubdirs

[Registry]
; 1. COM Registration for AddInConnect (HKCU — zero admin required)
Root: HKCU; Subkey: "Software\Classes\Mosaika.PowerPointAddIn"; ValueType: string; ValueData: "Mosaika.PowerPointAddIn.AddInConnect"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\Mosaika.PowerPointAddIn\CLSID"; ValueType: string; ValueData: "{#AddInGuid}"; Flags: uninsdeletekey

Root: HKCU; Subkey: "Software\Classes\CLSID\{#AddInGuid}"; ValueType: string; ValueData: "Mosaika.PowerPointAddIn.AddInConnect"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\CLSID\{#AddInGuid}\ProgId"; ValueType: string; ValueData: "Mosaika.PowerPointAddIn"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\CLSID\{#AddInGuid}\Implemented Categories\{#NetCategoryGuid}"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\CLSID\{#AddInGuid}\InprocServer32"; ValueType: string; ValueData: "mscoree.dll"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\CLSID\{#AddInGuid}\InprocServer32"; ValueType: string; ValueName: "ThreadingModel"; ValueData: "Both"
Root: HKCU; Subkey: "Software\Classes\CLSID\{#AddInGuid}\InprocServer32"; ValueType: string; ValueName: "Class"; ValueData: "Mosaika.PowerPointAddIn.AddInConnect"
Root: HKCU; Subkey: "Software\Classes\CLSID\{#AddInGuid}\InprocServer32"; ValueType: string; ValueName: "Assembly"; ValueData: "{#AssemblyFullName}"
Root: HKCU; Subkey: "Software\Classes\CLSID\{#AddInGuid}\InprocServer32"; ValueType: string; ValueName: "RuntimeVersion"; ValueData: "v4.0.30319"
Root: HKCU; Subkey: "Software\Classes\CLSID\{#AddInGuid}\InprocServer32"; ValueType: string; ValueName: "CodeBase"; ValueData: "{code:GetAddInCodeBaseUri}"
Root: HKCU; Subkey: "Software\Classes\CLSID\{#AddInGuid}\InprocServer32\1.0.0.0"; ValueType: string; ValueName: "Class"; ValueData: "Mosaika.PowerPointAddIn.AddInConnect"
Root: HKCU; Subkey: "Software\Classes\CLSID\{#AddInGuid}\InprocServer32\1.0.0.0"; ValueType: string; ValueName: "Assembly"; ValueData: "{#AssemblyFullName}"
Root: HKCU; Subkey: "Software\Classes\CLSID\{#AddInGuid}\InprocServer32\1.0.0.0"; ValueType: string; ValueName: "RuntimeVersion"; ValueData: "v4.0.30319"
Root: HKCU; Subkey: "Software\Classes\CLSID\{#AddInGuid}\InprocServer32\1.0.0.0"; ValueType: string; ValueName: "CodeBase"; ValueData: "{code:GetAddInCodeBaseUri}"

; 2. COM Registration for TaskPaneHostControl (WebView2 WinForms host)
Root: HKCU; Subkey: "Software\Classes\Mosaika.TaskPaneHostControl"; ValueType: string; ValueData: "Mosaika.PowerPointAddIn.TaskPaneHostControl"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\Mosaika.TaskPaneHostControl\CLSID"; ValueType: string; ValueData: "{#PaneGuid}"; Flags: uninsdeletekey

Root: HKCU; Subkey: "Software\Classes\CLSID\{#PaneGuid}"; ValueType: string; ValueData: "Mosaika.PowerPointAddIn.TaskPaneHostControl"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\CLSID\{#PaneGuid}\ProgId"; ValueType: string; ValueData: "Mosaika.TaskPaneHostControl"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\CLSID\{#PaneGuid}\Implemented Categories\{#NetCategoryGuid}"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\CLSID\{#PaneGuid}\InprocServer32"; ValueType: string; ValueData: "mscoree.dll"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\CLSID\{#PaneGuid}\InprocServer32"; ValueType: string; ValueName: "ThreadingModel"; ValueData: "Both"
Root: HKCU; Subkey: "Software\Classes\CLSID\{#PaneGuid}\InprocServer32"; ValueType: string; ValueName: "Class"; ValueData: "Mosaika.PowerPointAddIn.TaskPaneHostControl"
Root: HKCU; Subkey: "Software\Classes\CLSID\{#PaneGuid}\InprocServer32"; ValueType: string; ValueName: "Assembly"; ValueData: "{#AssemblyFullName}"
Root: HKCU; Subkey: "Software\Classes\CLSID\{#PaneGuid}\InprocServer32"; ValueType: string; ValueName: "RuntimeVersion"; ValueData: "v4.0.30319"
Root: HKCU; Subkey: "Software\Classes\CLSID\{#PaneGuid}\InprocServer32"; ValueType: string; ValueName: "CodeBase"; ValueData: "{code:GetAddInCodeBaseUri}"
Root: HKCU; Subkey: "Software\Classes\CLSID\{#PaneGuid}\InprocServer32\1.0.0.0"; ValueType: string; ValueName: "Class"; ValueData: "Mosaika.PowerPointAddIn.TaskPaneHostControl"
Root: HKCU; Subkey: "Software\Classes\CLSID\{#PaneGuid}\InprocServer32\1.0.0.0"; ValueType: string; ValueName: "Assembly"; ValueData: "{#AssemblyFullName}"
Root: HKCU; Subkey: "Software\Classes\CLSID\{#PaneGuid}\InprocServer32\1.0.0.0"; ValueType: string; ValueName: "RuntimeVersion"; ValueData: "v4.0.30319"
Root: HKCU; Subkey: "Software\Classes\CLSID\{#PaneGuid}\InprocServer32\1.0.0.0"; ValueType: string; ValueName: "CodeBase"; ValueData: "{code:GetAddInCodeBaseUri}"

; 3. PowerPoint Add-in Auto-Load Entry (LoadBehavior = 3)
Root: HKCU; Subkey: "Software\Microsoft\Office\PowerPoint\Addins\Mosaika.PowerPointAddIn"; ValueType: string; ValueName: "FriendlyName"; ValueData: "{#MyAppShortName}"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Microsoft\Office\PowerPoint\Addins\Mosaika.PowerPointAddIn"; ValueType: string; ValueName: "Description"; ValueData: "Mosaika — Bounded Swiss Bento Layout Engine for PowerPoint"
Root: HKCU; Subkey: "Software\Microsoft\Office\PowerPoint\Addins\Mosaika.PowerPointAddIn"; ValueType: dword; ValueName: "LoadBehavior"; ValueData: 3

[Code]
function GetAddInCodeBaseUri(Param: String): String;
var
  DllPath: String;
begin
  DllPath := ExpandConstant('{app}\Mosaika.PowerPointAddIn.dll');
  StringChangeEx(DllPath, '\', '/', True);
  Result := 'file:///' + DllPath;
end;

function IsPowerPointRunning(): Boolean;
var
  ResultCode: Integer;
begin
  Result := False;
  if Exec('cmd.exe', '/C tasklist /FI "IMAGENAME eq POWERPNT.EXE" | find /I "POWERPNT.EXE" >nul', '', SW_HIDE, ewWaitUntilTerminated, ResultCode) then
  begin
    Result := (ResultCode = 0);
  end;
end;

function InitializeSetup(): Boolean;
begin
  Result := True;
  while IsPowerPointRunning() do
  begin
    if MsgBox('Microsoft PowerPoint is currently running. Please close PowerPoint before installing Mosaika, then click Retry.', mbConfirmation, MB_RETRYCANCEL) = IDCANCEL then
    begin
      Result := False;
      Exit;
    end;
  end;
end;

function InitializeUninstall(): Boolean;
begin
  Result := True;
  while IsPowerPointRunning() do
  begin
    if MsgBox('Microsoft PowerPoint is currently running. Please close PowerPoint before uninstalling Mosaika, then click Retry.', mbConfirmation, MB_RETRYCANCEL) = IDCANCEL then
    begin
      Result := False;
      Exit;
    end;
  end;
end;
