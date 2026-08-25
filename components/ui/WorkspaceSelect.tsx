"use client";

import { Select } from "@base-ui/react/select";
import { Check, ChevronDown } from "lucide-react";
import { PRESSABLE } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

export type WorkspaceSelectOption<Value extends string = string> = {
  value: Value;
  label: string;
  description?: string;
};

export function WorkspaceSelect<Value extends string>({
  id,
  name,
  label,
  options,
  defaultValue,
  placeholder,
  onValueChange,
  disabled,
  className,
}: {
  id: string;
  name: string;
  label: string;
  options: readonly WorkspaceSelectOption<Value>[];
  /**
   * Omit (or pass null) to render the control with no preselected value. Used
   * by a roving manager's counter picker, where choosing a default for them
   * would be a silent guess.
   */
  defaultValue?: Value | null;
  /** Shown in the trigger while nothing is selected. */
  placeholder?: string;
  onValueChange?: (value: Value | null) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <Select.Root<Value>
      id={id}
      name={name}
      items={options}
      defaultValue={defaultValue ?? null}
      onValueChange={onValueChange}
      disabled={disabled}
    >
      <div className={cn("min-w-0", className)}>
        <Select.Label className="type-caps text-nybb-bone/65 block cursor-default">
          {label}
        </Select.Label>
        <Select.Trigger
          className={cn(
            PRESSABLE,
            "group border-nybb-bone/40 bg-nybb-graphite text-nybb-bone mt-2 flex min-h-11 w-full min-w-0 items-stretch justify-between rounded-md border text-left text-base outline-none sm:text-sm",
            "hover:not-data-disabled:border-nybb-bone/65 hover:not-data-disabled:bg-nybb-bone/5",
            "data-popup-open:border-nybb-orange data-popup-open:bg-nybb-bone/5",
            "data-disabled:border-nybb-bone/15 data-disabled:text-nybb-bone/35",
          )}
        >
          <Select.Value className="flex min-w-0 flex-1 items-center truncate px-3.5 py-2.5" placeholder={placeholder} />
          <Select.Icon className="border-nybb-bone/15 text-nybb-orange grid w-11 shrink-0 place-items-center border-l">
            <ChevronDown
              aria-hidden
              className="size-4 transition-transform duration-150 group-data-popup-open:rotate-180"
            />
          </Select.Icon>
        </Select.Trigger>
      </div>

      <Select.Portal>
        <Select.Positioner
          align="start"
          alignItemWithTrigger={false}
          className="z-[100] outline-none select-none"
          collisionPadding={8}
          sideOffset={6}
        >
          <Select.Popup
            className={cn(
              "border-nybb-bone/40 bg-nybb-charcoal text-nybb-bone max-h-[var(--available-height)] min-w-[var(--anchor-width)] origin-[var(--transform-origin)] overflow-hidden rounded-md border outline-none",
              "transition-[transform,opacity] duration-100 ease-out data-starting-style:scale-[0.98] data-starting-style:opacity-0 data-ending-style:scale-[0.98] data-ending-style:opacity-0 motion-reduce:transition-none",
            )}
          >
            <Select.List className="max-h-[min(22rem,var(--available-height))] overflow-y-auto p-1.5">
              {options.map((option) => (
                <Select.Item
                  key={option.value}
                  value={option.value}
                  className={cn(
                    "group text-nybb-bone/75 grid min-h-11 cursor-default grid-cols-[1.25rem_1fr] items-center gap-2 rounded-sm px-2.5 py-2 text-sm outline-none",
                    "data-selected:bg-nybb-bone/8 data-selected:text-nybb-bone",
                    "data-highlighted:bg-nybb-orange data-highlighted:text-nybb-ink",
                    "data-disabled:text-nybb-bone/30",
                  )}
                >
                  <Select.ItemIndicator className="text-nybb-orange group-data-highlighted:text-nybb-ink col-start-1">
                    <Check aria-hidden className="size-4" strokeWidth={2.5} />
                  </Select.ItemIndicator>
                  <Select.ItemText className="col-start-2 min-w-0">
                    <span className="font-medium">{option.label}</span>
                    {option.description ? (
                      <span className="mt-0.5 block max-w-72 text-xs leading-snug opacity-55">
                        {option.description}
                      </span>
                    ) : null}
                  </Select.ItemText>
                </Select.Item>
              ))}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}
