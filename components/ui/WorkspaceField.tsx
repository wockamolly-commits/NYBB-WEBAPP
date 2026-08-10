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

export function WorkspaceInput({
  className,
  ...props
}: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "workspace-input mt-2 w-full px-3.5 py-2.5 text-base sm:text-sm",
        className,
      )}
      {...props}
    />
  );
}
