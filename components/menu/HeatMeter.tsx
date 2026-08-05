import { cn } from "@/lib/utils";

/**
 * The heat meter.
 *
 * NYBB sells heat as a priced product (Lite 20% through Insane 100%) and the
 * current website spends it as plain text. This component is the brand's best
 * visual hook, so it is built once and used everywhere the level appears: the
 * wings configurator, the order confirmation, the staff ticket and the printed
 * pickup slip. Same five swatches every time, which is why the ramp is five
 * fixed tokens rather than a gradient function.
 */

const RAMP = [
  "bg-nybb-heat-1",
  "bg-nybb-heat-2",
  "bg-nybb-heat-3",
  "bg-nybb-heat-4",
  "bg-nybb-heat-5",
] as const;

const SEGMENTS = RAMP.length;

export function HeatMeter({
  percent,
  label,
  size = "md",
  className,
}: {
  /** 0 to 100. */
  percent: number;
  label?: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const filled = Math.round((Math.min(Math.max(percent, 0), 100) / 100) * SEGMENTS);

  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div
        className="flex items-center gap-1"
        role="img"
        aria-label={`Heat level ${percent} percent${label ? `, ${label}` : ""}`}
      >
        {RAMP.map((tone, index) => (
          <span
            key={tone}
            className={cn(
              "block rounded-[1px] transition-colors",
              size === "sm" ? "h-2 w-3" : "h-2.5 w-4",
              index < filled ? tone : "bg-nybb-graphite",
            )}
          />
        ))}
      </div>
      <span
        aria-hidden
        className={cn(
          "font-mono-tabular tracking-tight text-nybb-bone/70",
          size === "sm" ? "text-[11px]" : "text-xs",
        )}
      >
        {percent}%
      </span>
      {label ? (
        <span
          aria-hidden
          className={cn(
            "font-display tracking-wide text-nybb-bone",
            size === "sm" ? "text-[11px]" : "text-xs",
          )}
        >
          {label}
        </span>
      ) : null}
    </div>
  );
}
