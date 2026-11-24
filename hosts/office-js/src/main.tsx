import { StrictMode, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BentoTaskPane } from '@bento/ui';
import './index.css';
import { OfficeJsBentoHost } from './OfficeJsBentoHost.js';

function OfficeJsTaskPaneApp() {
  const host = useMemo(() => new OfficeJsBentoHost(), []);
  const [theme] = useState<'light' | 'dark'>(() => host.getOfficeTheme());

  return (
    <div className={theme === 'dark' ? 'dark h-full w-full' : 'h-full w-full'}>
      <div className="flex h-full w-full bg-white dark:bg-[#111313]">
        <BentoTaskPane host={host} theme={theme} fullWidth />
      </div>
    </div>
  );
}

function mountApp() {
  const rootEl = document.getElementById('root');
  if (!rootEl) return;
  createRoot(rootEl).render(
    <StrictMode>
      <OfficeJsTaskPaneApp />
    </StrictMode>
  );
}

const g = globalThis as unknown as { Office?: { onReady?: (cb: () => void) => void } };
if (g.Office?.onReady) {
  g.Office.onReady(() => {
    mountApp();
  });
} else {
  mountApp();
}
