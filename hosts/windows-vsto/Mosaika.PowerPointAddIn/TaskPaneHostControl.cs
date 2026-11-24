using System;
using System.Drawing;
using System.IO;
using System.Runtime.InteropServices;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using Microsoft.Win32;
using Mosaika.PowerPointAddIn.Rpc;

namespace Mosaika.PowerPointAddIn
{
    /// <summary>
    /// WinForms UserControl embedded inside PowerPoint's CustomTaskPane.
    /// Hosts Microsoft Edge WebView2 with an explicit %LOCALAPPDATA%\ProjectBento\WebView2
    /// UserDataFolder (Rule 7) and virtual host mapping "bento.local" (PRD Section 7.2).
    /// </summary>
    [ComVisible(true)]
    [Guid("B7E4F3A1-8C24-4B9E-9A1D-2F6C5D8E2001")]
    [ProgId("Mosaika.TaskPaneHostControl")]
    public sealed class TaskPaneHostControl : UserControl
    {
        private const string VirtualHostName = "bento.local";

        private WebView2 _webView;
        private RpcDispatcher _dispatcher;
        private Timer _selectionDebounceTimer;
        private bool _isReady;

        public TaskPaneHostControl()
        {
            BackColor = Color.White;
            Dock = DockStyle.Fill;
            MinimumSize = new Size(280, 400);

            _webView = new WebView2
            {
                Dock = DockStyle.Fill
            };
            Controls.Add(_webView);

            // PRD Section 7.2: 80ms debounced selectionChanged event on main STA UI thread
            _selectionDebounceTimer = new Timer { Interval = 80 };
            _selectionDebounceTimer.Tick += OnSelectionDebounceTick;
        }

        public async void InitializeBridge(RpcDispatcher dispatcher)
        {
            _dispatcher = dispatcher ?? throw new ArgumentNullException(nameof(dispatcher));

            try
            {
                string assemblyDir = Path.GetDirectoryName(typeof(TaskPaneHostControl).Assembly.Location) ?? AppDomain.CurrentDomain.BaseDirectory;

                // Ensure WebView2 finds the matching x64/x86 native WebView2Loader.dll when hosted inside POWERPNT.EXE
                string arch = Environment.Is64BitProcess ? "win-x64" : "win-x86";
                string nativeLoaderDir = Path.Combine(assemblyDir, "runtimes", arch, "native");
                if (Directory.Exists(nativeLoaderDir))
                {
                    CoreWebView2Environment.SetLoaderDllFolderPath(nativeLoaderDir);
                }

                // Rule 7: Mandatory explicit UserDataFolder under %LOCALAPPDATA%\ProjectBento\WebView2
                string userDataFolder = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    "ProjectBento",
                    "WebView2");

                Directory.CreateDirectory(userDataFolder);

                var env = await CoreWebView2Environment.CreateAsync(null, userDataFolder);
                await _webView.EnsureCoreWebView2Async(env);

                var core = _webView.CoreWebView2;
                core.Settings.IsStatusBarEnabled = false;
                core.Settings.AreDefaultContextMenusEnabled = false;
                core.Settings.IsZoomControlEnabled = false;

                string webviewDir = Path.Combine(assemblyDir, "webview");

                if (!Directory.Exists(webviewDir))
                {
                    ShowMissingBundleFallback(webviewDir);
                    return;
                }

                core.SetVirtualHostNameToFolderMapping(
                    VirtualHostName,
                    webviewDir,
                    CoreWebView2HostResourceAccessKind.Allow);

                core.WebMessageReceived += OnWebMessageReceived;
                core.NavigationCompleted += OnNavigationCompleted;
                core.Navigate($"https://{VirtualHostName}/index.html");
            }
            catch (Exception ex)
            {
                ShowErrorFallback($"Mosaika WebView2 failed to initialize:\n\n{ex.Message}");
            }
        }

        public void NotifySelectionChangedDebounced()
        {
            if (IsDisposed || !_isReady) return;

            if (InvokeRequired)
            {
                BeginInvoke(new Action(NotifySelectionChangedDebounced));
                return;
            }

            _selectionDebounceTimer.Stop();
            _selectionDebounceTimer.Start();
        }

        private void OnSelectionDebounceTick(object sender, EventArgs e)
        {
            _selectionDebounceTimer.Stop();
            if (!_isReady || _webView?.CoreWebView2 == null) return;

            try
            {
                _webView.CoreWebView2.PostWebMessageAsJson("{\"event\":\"selectionChanged\"}");
            }
            catch
            {
                // Ignore transient errors if PowerPoint is shutting down
            }
        }

        private void OnNavigationCompleted(object sender, CoreWebView2NavigationCompletedEventArgs e)
        {
            if (!e.IsSuccess) return;
            _isReady = true;

            // Sync initial Office UI theme (Black / Dark Gray -> dark, else light)
            string theme = DetectOfficeTheme();
            try
            {
                _webView.CoreWebView2.PostWebMessageAsJson($"{{\"event\":\"themeChanged\",\"theme\":\"{theme}\"}}");
                _webView.CoreWebView2.PostWebMessageAsJson("{\"event\":\"selectionChanged\"}");
            }
            catch
            {
                // Ignore if webview closed
            }
        }

        private void OnWebMessageReceived(object sender, CoreWebView2WebMessageReceivedEventArgs e)
        {
            if (_dispatcher == null) return;

            string rawJson;
            try
            {
                rawJson = e.TryGetWebMessageAsString();
            }
            catch
            {
                rawJson = e.WebMessageAsJson;
            }

            // Executes synchronously on the WinForms STA UI thread so all PowerPoint COM calls are thread-safe (Rule 6)
            string responseJson = _dispatcher.Dispatch(rawJson);
            if (!string.IsNullOrEmpty(responseJson))
            {
                _webView.CoreWebView2.PostWebMessageAsJson(responseJson);
            }
        }

        private static string DetectOfficeTheme()
        {
            try
            {
                using (var key = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Office\16.0\Common"))
                {
                    object val = key?.GetValue("UI Theme");
                    if (val is int themeCode && (themeCode == 3 || themeCode == 4))
                    {
                        return "dark";
                    }
                }
            }
            catch
            {
                // Fallback to light theme
            }

            return "light";
        }

        private void ShowMissingBundleFallback(string expectedPath)
        {
            ShowErrorFallback(
                "Mosaika UI bundle was not found.\n\n" +
                $"Expected folder:\n{expectedPath}\n\n" +
                "Run hosts/windows-vsto/scripts/build-vsto.ps1 to bundle @bento/vsto-web.");
        }

        private void ShowErrorFallback(string message)
        {
            Controls.Clear();
            var label = new Label
            {
                Dock = DockStyle.Fill,
                Padding = new Padding(16),
                Text = message,
                ForeColor = Color.FromArgb(27, 29, 30),
                BackColor = Color.White,
                Font = new Font("Segoe UI", 9.5f)
            };
            Controls.Add(label);
        }

        protected override void Dispose(bool disposing)
        {
            if (disposing)
            {
                _isReady = false;
                if (_selectionDebounceTimer != null)
                {
                    _selectionDebounceTimer.Stop();
                    _selectionDebounceTimer.Dispose();
                    _selectionDebounceTimer = null;
                }
                if (_webView != null)
                {
                    _webView.Dispose();
                    _webView = null;
                }
            }
            base.Dispose(disposing);
        }
    }
}
