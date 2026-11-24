export interface MosaikaLogoProps {
  className?: string;
}

/**
 * Mosaika bespoke monochrome Swiss brand mark (Concept B — Mosaic M).
 * 3-column bento grid forming a crisp geometric "M" with accent dot.
 */
export function MosaikaLogo({ className = 'h-3.5 w-3.5' }: MosaikaLogoProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
      data-testid="mosaika-logo-mark"
    >
      <rect x="2.5" y="3" width="5" height="18" rx="1.4" />
      <rect x="9.5" y="3" width="5" height="9.5" rx="1.4" />
      <circle cx="12" cy="17.8" r="2.7" opacity="0.52" />
      <rect x="16.5" y="3" width="5" height="18" rx="1.4" />
    </svg>
  );
}
