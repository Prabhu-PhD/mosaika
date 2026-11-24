import type {
  BentoRpcEvent,
  BentoRpcMethod,
  BentoRpcRequest,
  BentoRpcResponse,
  HostCapabilities,
  IBentoHost,
  LayoutDiffPayload,
  MultiSlideItem,
  SelectionContext,
  StyleApplyPayload,
} from '@bento/contract';

interface WebView2ChromeHost {
  postMessage(message: unknown): void;
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
  removeEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
}

declare global {
  interface Window {
    chrome?: {
      webview?: WebView2ChromeHost;
    };
  }
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const RPC_TIMEOUT_MS = 30_000;

/**
 * IBentoHost bridge over Microsoft Edge WebView2 (`window.chrome.webview.postMessage`).
 * Strictly conforms to the PRD Section 7.2 JSON-RPC 2.0 envelope.
 */
export class VstoBentoHost implements IBentoHost {
  private nextId = 1;
  private readonly pending = new Map<string, PendingRequest>();
  private readonly selectionHandlers = new Set<() => void>();
  private readonly themeHandlers = new Set<(theme: 'light' | 'dark') => void>();

  constructor() {
    const webview = window.chrome?.webview;
    if (webview) {
      webview.addEventListener('message', this.handleMessage);
    }
  }

  private readonly handleMessage = (event: { data: unknown }): void => {
    let payload: unknown = event.data;
    if (typeof payload === 'string') {
      try {
        payload = JSON.parse(payload);
      } catch {
        return;
      }
    }
    if (typeof payload !== 'object' || payload === null) {
      return;
    }

    const obj = payload as Record<string, unknown>;

    // Host-pushed event
    if (typeof obj.event === 'string') {
      if (obj.event === ('selectionChanged' satisfies BentoRpcEvent['event'])) {
        for (const handler of this.selectionHandlers) {
          handler();
        }
      } else if (obj.event === 'themeChanged' && (obj.theme === 'light' || obj.theme === 'dark')) {
        for (const handler of this.themeHandlers) {
          handler(obj.theme);
        }
      }
      return;
    }

    // JSON-RPC 2.0 response correlated by request id
    if (typeof obj.id === 'string') {
      const entry = this.pending.get(obj.id);
      if (!entry) return;
      this.pending.delete(obj.id);
      clearTimeout(entry.timer);

      const response = obj as unknown as BentoRpcResponse<unknown>;
      if ('error' in response && response.error) {
        entry.reject(new Error(response.error.message || response.error.code || 'PowerPoint host error.'));
      } else if ('result' in response) {
        entry.resolve(response.result);
      } else {
        entry.resolve(undefined);
      }
    }
  };

  private call<TParams, TResult>(method: BentoRpcMethod, params: TParams): Promise<TResult> {
    const webview = window.chrome?.webview;
    if (!webview) {
      return Promise.reject(new Error('WebView2 host bridge is not available.'));
    }

    const id = `req_${this.nextId++}`;
    const request: BentoRpcRequest<TParams> = { id, method, params };

    return new Promise<TResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`PowerPoint host timed out on "${method}".`));
      }, RPC_TIMEOUT_MS);

      this.pending.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timer,
      });

      webview.postMessage(JSON.stringify(request));
    });
  }

  public onThemeChanged(handler: (theme: 'light' | 'dark') => void): () => void {
    this.themeHandlers.add(handler);
    return () => {
      this.themeHandlers.delete(handler);
    };
  }

  public getCapabilities(): Promise<HostCapabilities> {
    return this.call<Record<string, never>, HostCapabilities>('getCapabilities', {});
  }

  public getSelectionContext(): Promise<SelectionContext> {
    return this.call<Record<string, never>, SelectionContext>('getSelectionContext', {});
  }

  public applyLayoutDiff(diff: LayoutDiffPayload): Promise<{ stashedCount: number }> {
    return this.call<LayoutDiffPayload, { stashedCount: number }>('applyLayoutDiff', diff);
  }

  public applyStyle(bentoId: string, payload: StyleApplyPayload): Promise<void> {
    return this.call<{ bentoId: string; payload: StyleApplyPayload }, void>('applyStyle', {
      bentoId,
      payload,
    });
  }

  public syncStyleFromSelected(bentoId: string): Promise<void> {
    return this.call<{ bentoId: string }, void>('syncStyleFromSelected', { bentoId });
  }

  public setImageSlot(
    bentoId: string,
    slotId: string,
    imageBase64: string,
    addScrim: boolean
  ): Promise<void> {
    return this.call<
      { bentoId: string; slotId: string; imageBase64: string; addScrim: boolean },
      void
    >('setImageSlot', { bentoId, slotId, imageBase64, addScrim });
  }

  public generateMultiSlides(items: MultiSlideItem[]): Promise<{ createdSlideCount: number }> {
    return this.call<{ items: MultiSlideItem[] }, { createdSlideCount: number }>(
      'generateMultiSlides',
      { items }
    );
  }

  public reorderReadingOrder(bentoId: string, orderedSlotIds: string[]): Promise<void> {
    return this.call<{ bentoId: string; orderedSlotIds: string[] }, void>('reorderReadingOrder', {
      bentoId,
      orderedSlotIds,
    });
  }

  public detachBento(bentoId: string): Promise<void> {
    return this.call<{ bentoId: string }, void>('detachBento', { bentoId });
  }

  public onSelectionChanged(handler: () => void): () => void {
    this.selectionHandlers.add(handler);
    return () => {
      this.selectionHandlers.delete(handler);
    };
  }
}
