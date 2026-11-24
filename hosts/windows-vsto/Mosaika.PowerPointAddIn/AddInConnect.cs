using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using Extensibility;
using Microsoft.Office.Core;
using Mosaika.PowerPointAddIn.PowerPoint;
using Mosaika.PowerPointAddIn.Resources;
using Mosaika.PowerPointAddIn.Rpc;
using PowerPointInterop = Microsoft.Office.Interop.PowerPoint;

namespace Mosaika.PowerPointAddIn
{
    /// <summary>
    /// Entry point for the Mosaika PowerPoint Add-in (.NET Framework 4.8).
    /// Implements IDTExtensibility2 + IRibbonExtensibility + ICustomTaskPaneConsumer
    /// so it builds cleanly via MSBuild/dotnet and loads per-user into PowerPoint (x64/x86).
    /// </summary>
    [ComVisible(true)]
    [Guid("B7E4F3A1-8C24-4B9E-9A1D-2F6C5D8E1000")]
    [ProgId("Mosaika.PowerPointAddIn")]
    [ClassInterface(ClassInterfaceType.AutoDual)]
    public sealed class AddInConnect : IDTExtensibility2, IRibbonExtensibility, ICustomTaskPaneConsumer
    {
        private static readonly object ResolverLock = new object();
        private static bool _resolverInstalled;

        private PowerPointInterop.Application _application;
        private ICTPFactory _ctpFactory;
        private readonly Dictionary<int, CustomTaskPane> _panesByHwnd = new Dictionary<int, CustomTaskPane>();
        private readonly Dictionary<int, TaskPaneHostControl> _controlsByHwnd = new Dictionary<int, TaskPaneHostControl>();
        private IRibbonUI _ribbon;
        private PowerPointAdapter _adapter;
        private RpcDispatcher _dispatcher;
        private bool _userClosedPane;

        static AddInConnect()
        {
            InstallAssemblyResolver();
        }

        private static void InstallAssemblyResolver()
        {
            lock (ResolverLock)
            {
                if (_resolverInstalled) return;
                _resolverInstalled = true;

                string addInDir = Path.GetDirectoryName(typeof(AddInConnect).Assembly.Location);
                AppDomain.CurrentDomain.AssemblyResolve += (sender, args) =>
                {
                    if (string.IsNullOrEmpty(addInDir)) return null;
                    try
                    {
                        var reqName = new AssemblyName(args.Name);
                        string candidate = Path.Combine(addInDir, reqName.Name + ".dll");
                        if (File.Exists(candidate))
                        {
                            return Assembly.LoadFrom(candidate);
                        }
                    }
                    catch (Exception ex)
                    {
                        LogDiagnostic("AssemblyResolve failed: " + ex);
                    }
                    return null;
                };
            }
        }

        public void OnConnection(object application, ext_ConnectMode connectMode, object addInInst, ref Array custom)
        {
            try
            {
                _application = (PowerPointInterop.Application)application;
                _adapter = new PowerPointAdapter(_application);
                _dispatcher = new RpcDispatcher(_adapter);

                _application.WindowSelectionChange += OnWindowSelectionChange;
                _application.AfterNewPresentation += OnAfterNewPresentation;
                _application.PresentationOpen += OnPresentationOpen;
                _application.WindowActivate += OnWindowActivate;
            }
            catch (Exception ex)
            {
                LogDiagnostic("OnConnection failed: " + ex);
            }
        }

        public void OnDisconnection(ext_DisconnectMode removeMode, ref Array custom)
        {
            if (_application != null)
            {
                try
                {
                    _application.WindowSelectionChange -= OnWindowSelectionChange;
                    _application.AfterNewPresentation -= OnAfterNewPresentation;
                    _application.PresentationOpen -= OnPresentationOpen;
                    _application.WindowActivate -= OnWindowActivate;
                }
                catch
                {
                    // Ignore teardown COM exceptions
                }
            }

            foreach (var pane in _panesByHwnd.Values)
            {
                try
                {
                    pane.VisibleStateChange -= OnTaskPaneVisibleChanged;
                    pane.Delete();
                }
                catch
                {
                    // Ignore teardown COM exceptions
                }
            }
            _panesByHwnd.Clear();

            foreach (var ctrl in _controlsByHwnd.Values)
            {
                try
                {
                    ctrl.Dispose();
                }
                catch
                {
                    // Ignore teardown exceptions
                }
            }
            _controlsByHwnd.Clear();
            _application = null;
        }

        public void OnAddInsUpdate(ref Array custom) { }

        public void OnStartupComplete(ref Array custom)
        {
            // If PowerPoint started directly into an open presentation, show Mosaika right away
            TryOpenPaneForActiveWindow(autoOpen: true);
        }

        public void OnBeginShutdown(ref Array custom) { }

        // --- ICustomTaskPaneConsumer ---

        public void CTPFactoryAvailable(ICTPFactory ctpFactoryInst)
        {
            _ctpFactory = ctpFactoryInst;
            TryOpenPaneForActiveWindow(autoOpen: true);
        }

        // --- IRibbonExtensibility ---

        public string GetCustomUI(string ribbonId)
        {
            var asm = Assembly.GetExecutingAssembly();
            string resourceName = "Mosaika.PowerPointAddIn.Ribbon.xml";
            using (var stream = asm.GetManifestResourceStream(resourceName))
            {
                if (stream == null) return string.Empty;
                using (var reader = new StreamReader(stream))
                {
                    return reader.ReadToEnd();
                }
            }
        }

        public void OnRibbonLoad(IRibbonUI ribbonUi)
        {
            _ribbon = ribbonUi;
        }

        public object GetMosaikaIcon(IRibbonControl control)
        {
            return MosaikaIcon.CreateRibbonPictureDisp(32);
        }

        public bool GetTaskPanePressed(IRibbonControl control)
        {
            var pane = GetActivePane();
            return pane != null && pane.Visible;
        }

        public void OnToggleTaskPane(IRibbonControl control, bool pressed)
        {
            _userClosedPane = !pressed;
            var pane = EnsurePaneForActiveWindow();
            if (pane != null)
            {
                pane.Visible = pressed;
            }
        }

        // --- Presentation & Window Events ---

        private void OnAfterNewPresentation(PowerPointInterop.Presentation pres)
        {
            // Automatically show Mosaika whenever the user opens a new deck
            _userClosedPane = false;
            TryOpenPaneForActiveWindow(autoOpen: true);
        }

        private void OnPresentationOpen(PowerPointInterop.Presentation pres)
        {
            TryOpenPaneForActiveWindow(autoOpen: true);
        }

        private void OnWindowActivate(PowerPointInterop.Presentation pres, PowerPointInterop.DocumentWindow wn)
        {
            TryOpenPaneForActiveWindow(autoOpen: true);
            _ribbon?.InvalidateControl("ToggleMosaikaPane");
        }

        private void TryOpenPaneForActiveWindow(bool autoOpen)
        {
            if (autoOpen && _userClosedPane) return;
            try
            {
                var pane = EnsurePaneForActiveWindow();
                if (pane != null && autoOpen && !pane.Visible)
                {
                    pane.Visible = true;
                }
            }
            catch (Exception ex)
            {
                LogDiagnostic("TryOpenPaneForActiveWindow failed: " + ex);
            }
        }

        private CustomTaskPane GetActivePane()
        {
            int hwnd = GetActiveWindowHwnd();
            if (hwnd != 0 && _panesByHwnd.TryGetValue(hwnd, out var pane))
            {
                return pane;
            }
            return null;
        }

        private CustomTaskPane EnsurePaneForActiveWindow()
        {
            if (_ctpFactory == null || _application == null) return null;

            PowerPointInterop.DocumentWindow activeWindow;
            try
            {
                if (_application.Windows == null || _application.Windows.Count == 0)
                {
                    return null;
                }
                activeWindow = _application.ActiveWindow;
                if (activeWindow == null) return null;
            }
            catch
            {
                return null;
            }

            int hwnd = activeWindow.HWND;
            if (_panesByHwnd.TryGetValue(hwnd, out var existing))
            {
                return existing;
            }

            var pane = _ctpFactory.CreateCTP("Mosaika.TaskPaneHostControl", "Mosaika", activeWindow);
            pane.DockPosition = MsoCTPDockPosition.msoCTPDockPositionRight;
            pane.Width = 340; // PRD Section 7.2: 340 DIPs right-docked pane
            pane.VisibleStateChange += OnTaskPaneVisibleChanged;

            var control = pane.ContentControl as TaskPaneHostControl;
            control?.InitializeBridge(_dispatcher);

            _panesByHwnd[hwnd] = pane;
            if (control != null)
            {
                _controlsByHwnd[hwnd] = control;
            }
            return pane;
        }

        private int GetActiveWindowHwnd()
        {
            try
            {
                if (_application?.Windows != null && _application.Windows.Count > 0)
                {
                    return _application.ActiveWindow?.HWND ?? 0;
                }
            }
            catch
            {
                // No active window yet (e.g. Backstage Start screen)
            }
            return 0;
        }

        private void OnTaskPaneVisibleChanged(CustomTaskPane ctpInst)
        {
            if (!ctpInst.Visible)
            {
                _userClosedPane = true;
            }
            _ribbon?.InvalidateControl("ToggleMosaikaPane");

            if (ctpInst.Visible)
            {
                int hwnd = GetActiveWindowHwnd();
                if (hwnd != 0 && _controlsByHwnd.TryGetValue(hwnd, out var ctrl))
                {
                    ctrl.NotifySelectionChangedDebounced();
                }
            }
        }

        private void OnWindowSelectionChange(PowerPointInterop.Selection sel)
        {
            int hwnd = GetActiveWindowHwnd();
            if (hwnd == 0) return;

            if (_panesByHwnd.TryGetValue(hwnd, out var pane) &&
                pane.Visible &&
                _controlsByHwnd.TryGetValue(hwnd, out var ctrl))
            {
                ctrl.NotifySelectionChangedDebounced();
            }
        }

        internal static void LogDiagnostic(string message)
        {
            try
            {
                string logDir = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    "ProjectBento");
                Directory.CreateDirectory(logDir);
                string logPath = Path.Combine(logDir, "addin.log");
                File.AppendAllText(logPath, $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] {message}{Environment.NewLine}");
            }
            catch
            {
                // Never throw from diagnostic logger
            }
        }
    }
}
