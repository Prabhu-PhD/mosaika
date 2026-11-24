import { useEffect, useRef } from 'react';
import { AlertTriangle, Check, Info, X } from 'lucide-react';

export interface ToastNotice {
  id: number;
  kind: 'error' | 'warning' | 'info' | 'success';
  message: string;
  autoDismissMs?: number;
}

export interface ToastBannerProps {
  notice: ToastNotice | null;
  onDismiss: () => void;
}

export function ToastBanner({ notice, onDismiss }: ToastBannerProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remainingRef = useRef<number>(0);
  const startedAtRef = useRef<number>(0);

  const durationMs = notice?.autoDismissMs ?? (notice?.kind === 'success' ? 3000 : 0);

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (!notice || durationMs <= 0) {
      return;
    }
    remainingRef.current = durationMs;
    startedAtRef.current = Date.now();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      onDismiss();
    }, durationMs);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [notice, durationMs, onDismiss]);

  if (!notice) {
    return null;
  }

  const handlePause = () => {
    if (timerRef.current && durationMs > 0) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
      const elapsed = Date.now() - startedAtRef.current;
      remainingRef.current = Math.max(250, remainingRef.current - elapsed);
    }
  };

  const handleResume = () => {
    if (!timerRef.current && durationMs > 0 && remainingRef.current > 0) {
      startedAtRef.current = Date.now();
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        onDismiss();
      }, remainingRef.current);
    }
  };

  const toneStyle: React.CSSProperties =
    notice.kind === 'error'
      ? {
          background: 'var(--bento-bg)',
          borderColor: 'var(--bento-danger)',
          color: 'var(--bento-danger)',
        }
      : notice.kind === 'warning'
        ? {
            background: 'var(--bento-warn-bg)',
            borderColor: 'var(--bento-warn-border)',
            color: 'var(--bento-warn-text)',
          }
        : {
            background: 'var(--bento-well)',
            borderColor: 'var(--bento-border-strong)',
            color: 'var(--bento-fg)',
          };

  const Icon =
    notice.kind === 'error' || notice.kind === 'warning'
      ? AlertTriangle
      : notice.kind === 'success'
        ? Check
        : Info;

  return (
    <div
      key={notice.id}
      role="status"
      aria-live="polite"
      data-testid="bento-toast"
      onMouseEnter={handlePause}
      onMouseLeave={handleResume}
      style={toneStyle}
      className="bento-toast-container relative shrink-0 overflow-hidden border-b px-3 py-2 text-[11.5px] leading-snug"
    >
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <p className="min-w-0 flex-1 break-words">{notice.message}</p>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss notification"
          className="shrink-0 p-0.5 opacity-60 transition-opacity hover:opacity-100"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
      {durationMs > 0 && (
        <div
          className="bento-toast-progress absolute bottom-0 left-0 right-0 h-[2px] bg-[var(--bento-fg)] opacity-45"
          style={{ '--toast-duration': `${durationMs}ms` } as React.CSSProperties}
        />
      )}
    </div>
  );
}
