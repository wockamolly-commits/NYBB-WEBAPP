import type { ThemeId } from "@/lib/themes/presets";
import { cn } from "@/lib/utils";

/**
 * A small seasonal mark for the banner and the Workspace cards.
 *
 * Drawn in currentColor so it takes whatever ink it sits in, with cut outs in
 * --theme-emblem-cut (the surface behind it) where a shape needs a hole.
 * Always decoration: the theme's name is written next to it wherever it
 * appears, so it carries no accessible name of its own.
 */
const CUT = "var(--theme-emblem-cut, transparent)";

const ART: Record<ThemeId, React.ReactNode> = {
  default: (
    <path d="M16 3c2 5 8 8 8 15a8 8 0 01-16 0c0-4 2-6 4-8 0 3 1 5 3 5-1-4 0-8 1-12z" />
  ),
  "new-year": (
    <>
      <path d="M16 2l2.6 8.4L27 8l-5.6 6.6L30 18l-8.8.6L22 27l-6-6-6 6 .8-8.4L2 18l8.6-3.4L5 8l8.4 2.4z" />
      <circle cx="16" cy="16" r="3" fill={CUT} />
    </>
  ),
  sinulog: (
    <>
      <path d="M16 2l3 6 6-2-2 6 6 3-6 3 2 6-6-2-3 6-3-6-6 2 2-6-6-3 6-3-2-6 6 2z" />
      <circle cx="16" cy="16" r="4.5" fill={CUT} />
    </>
  ),
  "chinese-new-year": (
    <>
      <rect x="13" y="2" width="6" height="3" rx="1" />
      <ellipse cx="16" cy="15" rx="11" ry="9" />
      <path d="M16 6v18M10 7q-4 8 0 16M22 7q4 8 0 16" stroke={CUT} strokeWidth="1.4" fill="none" />
      <rect x="12" y="24" width="8" height="2.5" rx="1" />
      <path d="M14 27v4M16 27v4.5M18 27v4" stroke="currentColor" strokeWidth="1.4" />
    </>
  ),
  valentines: <path d="M16 28S3 20 3 11c0-6 8-9 13-2 5-7 13-4 13 2 0 9-13 17-13 17z" />,
  summer: (
    <>
      <circle cx="16" cy="16" r="7" />
      <g stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
        <path d="M16 2v4M16 26v4M2 16h4M26 16h4M6 6l3 3M23 23l3 3M26 6l-3 3M9 23l-3 3" />
      </g>
    </>
  ),
  "independence-day": (
    <>
      <circle cx="16" cy="16" r="6" />
      <g stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
        <path d="M16 3v5M16 24v5M3 16h5M24 16h5M7 7l3.5 3.5M21.5 21.5L25 25M25 7l-3.5 3.5M10.5 21.5L7 25" />
      </g>
    </>
  ),
  "back-to-school": (
    <>
      <path d="M16 9c-3-2-12-2-12 8 0 8 6 13 9 13 1.5 0 2-.8 3-.8s1.5.8 3 .8c3 0 9-5 9-13 0-10-9-10-12-8z" />
      <path d="M16 9q-.5-4 1.5-7" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M18 6q4-5 9-2-4 5-9 2z" />
    </>
  ),
  halloween: (
    <>
      <path d="M16 8c-2-1-6-1-9 2-4 4-4 12 0 16 3 3 6 3 9 2 3 1 6 1 9-2 4-4 4-12 0-16-3-3-7-3-9-2z" />
      <path d="M16 8q0-4 3-6" stroke="currentColor" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <path d="M10 15l3 3h-4zM22 15l1 3h-4zM10 22q6 4 12 0l-2 2-2-1-2 2-2-2-2 1z" fill={CUT} />
    </>
  ),
  christmas: (
    <>
      <path d="M16 2l5 7h-3l6 7h-3l7 8H4l7-8H8l6-7h-3z" />
      <rect x="13.5" y="24" width="5" height="6" />
    </>
  ),
};

export function ThemeEmblem({ id, className }: { id: ThemeId; className?: string }) {
  // Sinulog's mark is the Sto. Nino himself, in full colour. A one colour
  // silhouette of a revered image would read as a stencil, not as him.
  if (id === "sinulog") {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- a 24px static SVG; next/image adds nothing
      <img
        src="/themes/santo-nino.svg"
        alt=""
        aria-hidden="true"
        width={32}
        height={36}
        className={cn("theme-emblem shrink-0 object-contain", className)}
      />
    );
  }
  return (
    <svg
      viewBox="0 0 32 32"
      width="32"
      height="32"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      className={cn("theme-emblem shrink-0", className)}
    >
      {ART[id]}
    </svg>
  );
}
