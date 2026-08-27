import { cn } from "@/lib/utils";

export function WorkspaceFieldLabel({
  className,
  ...props
}: React.ComponentProps<"label">) {
  return (
    <label
      className={cn("type-caps text-nybb-bone/65 block cursor-default", className)}
      {...props}
    />
  );
}

/**
 * Only the box model and type scale are set here. The material (border,
 * graphite fill, bone text, orange caret, and the hover, focus, invalid and
 * disabled states) comes from the `.workspace-shell :where(input, ...)` rules
 * in app/globals.css, which also supply the 2.75rem minimum height. Every
 * screen that uses this control sits inside app/(workspace)/workspace/layout.tsx,
 * which carries that class. Do not add a per-component class for the same job:
 * one of the two would drift.
 */
export function WorkspaceInput({
  className,
  ...props
}: React.ComponentProps<"input">) {
  return (
    <input
      className={cn("mt-2 w-full px-3.5 py-2.5 text-base sm:text-sm", className)}
      {...props}
    />
  );
}
