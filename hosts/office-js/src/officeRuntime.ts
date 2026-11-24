/**
 * Minimal, strictly typed Office.js PowerPoint runtime abstraction so
 * OfficeJsBentoHost compiles cleanly without global `any` casts and can be
 * exhaustively unit-tested in Vitest using an in-memory mock PowerPoint runtime.
 */

export interface OfficeTagItem {
  key: string;
  value: string;
}

export interface OfficeTagCollection {
  items: OfficeTagItem[];
  load(props: string): OfficeTagCollection;
  add(key: string, value: string): void;
  delete(key: string): void;
}

export interface OfficeFillFormat {
  type?: string;
  foregroundColor?: string;
  transparency?: number;
  load(props: string): OfficeFillFormat;
  clear(): void;
  setSolidColor(color: string): void;
}

export interface OfficeLineFormat {
  visible?: boolean;
  color?: string;
  weight?: number;
  transparency?: number;
  dashStyle?: string;
  load(props: string): OfficeLineFormat;
}

export interface OfficeFontFormat {
  color?: string;
  load(props: string): OfficeFontFormat;
}

export interface OfficeTextRange {
  text?: string;
  font: OfficeFontFormat;
  load(props: string): OfficeTextRange;
}

export interface OfficeTextFrame {
  textRange: OfficeTextRange;
  leftMargin?: number;
  rightMargin?: number;
  topMargin?: number;
  bottomMargin?: number;
  wordWrap?: boolean;
  verticalAlignment?: string;
  load(props: string): OfficeTextFrame;
}

export interface OfficeShapeAdjustments {
  set?(index: number, value: number): void;
  getItem?(index: number): { value: number };
}

export interface OfficeShape {
  id: string;
  name: string;
  left: number;
  top: number;
  width: number;
  height: number;
  tags: OfficeTagCollection;
  fill: OfficeFillFormat;
  lineFormat: OfficeLineFormat;
  textFrame?: OfficeTextFrame;
  adjustments?: OfficeShapeAdjustments;
  load(props: string): OfficeShape;
  delete(): void;
  setZOrder?(position: 'BringToFront' | 'SendToBack' | 'BringForward' | 'SendBackward'): void;
}

export interface OfficeShapeCollection {
  items: OfficeShape[];
  load(props: string): OfficeShapeCollection;
  addGeometricShape(
    type: 'RoundRectangle' | string,
    options?: { left?: number; top?: number; width?: number; height?: number }
  ): OfficeShape;
}

export interface OfficeSlide {
  id: string;
  shapes: OfficeShapeCollection;
  slideMaster?: { id: string; load(props: string): unknown };
  layout?: { id: string; load(props: string): unknown };
  load(props: string): OfficeSlide;
}

export interface OfficeSlideCollection {
  items: OfficeSlide[];
  load(props: string): OfficeSlideCollection;
  add(options?: { slideMasterId?: string; layoutId?: string }): OfficeSlide;
}

export interface OfficePageSetup {
  slideWidth?: number;
  slideHeight?: number;
  load(props: string): OfficePageSetup;
}

export interface OfficePresentation {
  slides: OfficeSlideCollection;
  pageSetup?: OfficePageSetup;
  getSelectedSlides(): OfficeSlideCollection;
  getSelectedShapes(): OfficeShapeCollection;
}

export interface OfficeRequestContext {
  presentation: OfficePresentation;
  sync(): Promise<void>;
}

export interface OfficeRuntimeAdapter {
  isRequirementSetSupported(name: string, version: string): boolean;
  run<T>(callback: (context: OfficeRequestContext) => Promise<T>): Promise<T>;
  getOfficeTheme(): 'light' | 'dark';
}

interface GlobalOfficeNamespace {
  context?: {
    requirements?: {
      isSetSupported(name: string, version: string): boolean;
    };
    officeTheme?: {
      bodyBackgroundColor?: string;
    };
  };
  onReady?(callback?: () => void): Promise<unknown>;
}

interface GlobalPowerPointNamespace {
  run<T>(callback: (context: OfficeRequestContext) => Promise<T>): Promise<T>;
}

function isDarkHexColor(hex?: string): boolean {
  if (!hex) return false;
  const clean = hex.replace('#', '').trim();
  if (clean.length !== 6) return false;
  const r = Number.parseInt(clean.slice(0, 2), 16);
  const g = Number.parseInt(clean.slice(2, 4), 16);
  const b = Number.parseInt(clean.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return false;
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return lum < 0.45;
}

/**
 * Default browser runtime adapter binding to Microsoft's global `Office` and `PowerPoint` objects.
 */
export function createBrowserOfficeRuntime(): OfficeRuntimeAdapter {
  const g = globalThis as unknown as {
    Office?: GlobalOfficeNamespace;
    PowerPoint?: GlobalPowerPointNamespace;
  };

  return {
    isRequirementSetSupported(name: string, version: string): boolean {
      try {
        return Boolean(g.Office?.context?.requirements?.isSetSupported(name, version));
      } catch {
        return false;
      }
    },

    run<T>(callback: (context: OfficeRequestContext) => Promise<T>): Promise<T> {
      if (!g.PowerPoint?.run) {
        return Promise.reject(
          new Error('PowerPoint Office.js runtime is not available. Open Mosaika inside PowerPoint.')
        );
      }
      return g.PowerPoint.run(callback);
    },

    getOfficeTheme(): 'light' | 'dark' {
      const bg = g.Office?.context?.officeTheme?.bodyBackgroundColor;
      return isDarkHexColor(bg) ? 'dark' : 'light';
    },
  };
}
