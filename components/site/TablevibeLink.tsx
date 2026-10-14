import { TABLEVIBE_URL } from "@/lib/site/delivery-card";
import { cn } from "@/lib/utils";

/**
 * "Tablevibe", as a link inside a sentence, wherever the site says that
 * delivery is ordered there.
 *
 * Delivery is not ordered on this site: it is pickup here and delivery on
 * Tablevibe. Every sentence that says so links the same address through this,
 * so the URL lives in one place (lib/site/delivery-card.ts) and the floating
 * card and the copy can never point at two different pages.
 *
 * Inline prose styling rather than TextLink, which is a display-face control
 * with a 2.75rem target and would break the line it sits in. The underline
 * takes the sentence's own colour, so it reads on bone, amber and photograph.
 */
export function TablevibeLink({ className }: { className?: string }) {
  return (
    <a
      href={TABLEVIBE_URL}
      className={cn(
        "underline decoration-current/45 underline-offset-4 transition-colors hover:decoration-current",
        className,
      )}
    >
      Tablevibe
    </a>
  );
}
