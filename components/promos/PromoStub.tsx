import { cn } from "@/lib/utils";

/**
 * A promo code as the counter's tear-off ticket stub. See `.promo-stub` in
 * globals.css for why it is yellow and why the torn edge is a mask.
 *
 * The code is always whole. Every surface that holds one of these lets the
 * sentence beside it truncate first, because the code is the one thing the
 * customer might type or read back at the counter.
 */
export function PromoStub({
  code,
  size = "md",
  className,
}: {
  code: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "promo-stub font-display shrink-0 leading-none tracking-wide whitespace-nowrap",
        size === "sm" && "min-h-9 px-2.5 pr-3 text-sm",
        size === "md" && "min-h-11 px-3 pr-3.5 text-base",
        size === "lg" && "min-h-16 px-5 pr-6 text-2xl sm:text-3xl",
        className,
      )}
    >
      {/* Its own span so a code longer than the room it is given ends in an
          ellipsis rather than pushing past the ticket. Text sitting directly
          in a flex box cannot truncate. */}
      <span className="min-w-0 truncate">{code}</span>
    </span>
  );
}
