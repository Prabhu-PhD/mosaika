import { StrictMode, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BentoTaskPane } from '@bento/ui';
import './index.css';
import { VstoBentoHost } from './VstoBentoHost.js';

function VstoTaskPaneApp() {
  const host = useMemo(() => new VstoBentoHost(), []);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    return host.onThemeChanged((nextTheme) => {
      setTheme(nextTheme);
    });
  }, [host]);

  return (
    <div className={theme === 'dark' ? 'dark h-full w-full' : 'h-full w-full'}>
      <div className="flex h-full w-full bg-white dark:bg-[#111313]">
        <BentoTaskPane host={host} theme={theme} fullWidth />
      </div>
    </div>
  );
}

const rootEl = document.getElementById('root');
if (rootEl) {
  createRoot(rootEl).render(
    <StrictMode>
      <VstoTaskPaneApp />
    </StrictMode>
  );
}
