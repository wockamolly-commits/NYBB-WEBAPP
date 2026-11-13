"use client";

import {
  Bold,
  Eye,
  EyeOff,
  Heading3,
  Italic,
  Link2,
  List,
  ListOrdered,
  ShieldCheck,
  SquareDashed,
} from "lucide-react";
import { useId, useRef, useState } from "react";
import { RichText } from "@/components/content/RichText";
import { WorkspaceFieldLabel, WorkspaceInput } from "@/components/ui/WorkspaceField";
import { cn } from "@/lib/utils";

/**
 * The controls the content forms are built from.
 *
 * Every field shows its count against its limit, because the limits are real
 * (lib/content/schema.ts LIMITS) and finding out on save is worse than seeing
 * it while typing. Errors arrive from the server keyed by field path and are
 * shown under the field they belong to.
 */

function Counter({ length, max }: { length: number; max: number }) {
  const over = length > max;
  return (
    <span className={cn("font-mono-tabular text-xs", over ? "text-nybb-red" : "text-nybb-bone/55")}>
      {length}/{max}
    </span>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="text-nybb-red mt-1.5 text-sm">
      {message}
    </p>
  );
}

export function TextField({
  label,
  value,
  onChange,
  max,
  error,
  hint,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  max: number;
  error?: string;
  hint?: string;
  type?: "text" | "email";
}) {
  const id = useId();
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <WorkspaceFieldLabel htmlFor={id}>{label}</WorkspaceFieldLabel>
        <Counter length={value.length} max={max} />
      </div>
      <WorkspaceInput
        id={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
      />
      {hint && !error ? (
        <p id={`${id}-hint`} className="text-nybb-bone/55 mt-1.5 text-xs">
          {hint}
        </p>
      ) : null}
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}

export function TextAreaField({
  label,
  value,
  onChange,
  max,
  error,
  hint,
  rows = 3,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  max: number;
  error?: string;
  hint?: string;
  rows?: number;
}) {
  const id = useId();
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <WorkspaceFieldLabel htmlFor={id}>{label}</WorkspaceFieldLabel>
        <Counter length={value.length} max={max} />
      </div>
      <textarea
        id={id}
        rows={rows}
        value={value}
        onChange={(event) => onChange(event.target.value.replace(/\r?\n/g, " "))}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        className="mt-2 w-full resize-y px-3.5 py-2.5 text-base leading-relaxed sm:text-sm"
      />
      {hint && !error ? (
        <p id={`${id}-hint`} className="text-nybb-bone/55 mt-1.5 text-xs">
          {hint}
        </p>
      ) : null}
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}

type Edit = { text: string; selectionStart: number; selectionEnd: number };

/** Wrap the selection in a marker, or insert the marker pair with the cursor between. */
function wrap(text: string, start: number, end: number, before: string, after: string, filler: string): Edit {
  const selected = text.slice(start, end) || filler;
  const next = text.slice(0, start) + before + selected + after + text.slice(end);
  return {
    text: next,
    selectionStart: start + before.length,
    selectionEnd: start + before.length + selected.length,
  };
}

/** Prefix every line the selection touches. */
function prefixLines(text: string, start: number, end: number, prefix: (index: number) => string): Edit {
  const lineStart = text.lastIndexOf("\n", start - 1) + 1;
  const lineEndIndex = text.indexOf("\n", end);
  const lineEnd = lineEndIndex === -1 ? text.length : lineEndIndex;
  const lines = text.slice(lineStart, lineEnd).split("\n");
  const changed = lines
    .map((line, index) => prefix(index) + line.replace(/^\s*(?:[-*]|\d+[.)]|#{2,4})\s+/, ""))
    .join("\n");
  return {
    text: text.slice(0, lineStart) + changed + text.slice(lineEnd),
    selectionStart: lineStart,
    selectionEnd: lineStart + changed.length,
  };
}

/** Put a block on a line of its own, with blank lines around it. */
function insertBlock(text: string, start: number, block: string): Edit {
  const before = text.slice(0, start).replace(/\s*$/, "");
  const after = text.slice(start).replace(/^\s*/, "");
  const head = before ? `${before}\n\n` : "";
  const next = `${head}${block}${after ? `\n\n${after}` : ""}`;
  const at = head.length + block.length;
  return { text: next, selectionStart: at, selectionEnd: at };
}

type Tool = {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  kind?: "heading" | "seal";
  make: (text: string, start: number, end: number) => Edit;
};

/** The toolbar, in order. Bold and italic stay first: Ctrl+B and Ctrl+I use them. */
const TOOLS: readonly Tool[] = [
  { label: "Bold", icon: Bold, make: (t, s, e) => wrap(t, s, e, "**", "**", "bold text") },
  { label: "Italic", icon: Italic, make: (t, s, e) => wrap(t, s, e, "*", "*", "italic text") },
  {
    label: "Link",
    icon: Link2,
    make: (t, s, e) => {
      const selected = t.slice(s, e) || "link text";
      const before = `[${selected}](`;
      const url = "https://";
      return {
        text: t.slice(0, s) + before + url + ")" + t.slice(e),
        selectionStart: s + before.length,
        selectionEnd: s + before.length + url.length,
      };
    },
  },
  { label: "Bullet list", icon: List, make: (t, s, e) => prefixLines(t, s, e, () => "- ") },
  { label: "Numbered list", icon: ListOrdered, make: (t, s, e) => prefixLines(t, s, e, (i) => `${i + 1}. `) },
  { label: "Subheading", icon: Heading3, kind: "heading", make: (t, s, e) => prefixLines(t, s, e, () => "### ") },
  {
    label: "Owner placeholder",
    icon: SquareDashed,
    make: (t, s, e) => wrap(t, s, e, "[[pending: ", "]]", "what is still to be decided"),
  },
  { label: "NPC seal", icon: ShieldCheck, kind: "seal", make: (t, s) => insertBlock(t, s, "{{npc-seal}}") },
];

/**
 * A formatted text field: a text box with a toolbar that writes the
 * formatting for you, and a live preview set the way the page will set it.
 *
 * The preview is the page's own renderer (components/content/RichText.tsx),
 * on the page's own amber and ink, so what it shows is what publishes.
 */
export function RichTextField({
  label,
  value,
  onChange,
  max,
  error,
  hint,
  rows = 8,
  allowSeal = false,
  allowHeadings = true,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  max: number;
  error?: string;
  hint?: string;
  rows?: number;
  allowSeal?: boolean;
  allowHeadings?: boolean;
}) {
  const id = useId();
  const area = useRef<HTMLTextAreaElement>(null);
  const [preview, setPreview] = useState(false);

  function apply(make: (text: string, start: number, end: number) => Edit) {
    const node = area.current;
    if (!node) return;
    const edit = make(node.value, node.selectionStart, node.selectionEnd);
    onChange(edit.text);
    // After React has written the new value, put the selection where the
    // edit says, so the next keystroke lands inside what was just inserted.
    requestAnimationFrame(() => {
      node.focus();
      node.setSelectionRange(edit.selectionStart, edit.selectionEnd);
    });
  }

  const tools = TOOLS.filter(
    (tool) => (tool.kind !== "heading" || allowHeadings) && (tool.kind !== "seal" || allowSeal),
  );

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <WorkspaceFieldLabel htmlFor={id}>{label}</WorkspaceFieldLabel>
        <Counter length={value.length} max={max} />
      </div>

      <div className="border-nybb-bone/20 mt-2 overflow-hidden rounded-md border">
        <div
          role="toolbar"
          aria-label={`Formatting for ${label}`}
          aria-controls={id}
          className="bg-nybb-ink/40 border-nybb-bone/15 flex flex-wrap items-center gap-1 border-b p-1.5"
        >
          {tools.map((tool) => (
            <button
              key={tool.label}
              type="button"
              onClick={() => apply(tool.make)}
              title={tool.label}
              aria-label={tool.label}
              className="text-nybb-bone/80 hover:bg-nybb-bone/10 hover:text-nybb-bone flex size-11 items-center justify-center rounded transition-colors sm:size-9"
            >
              <tool.icon className="size-4" />
            </button>
          ))}
          <button
            type="button"
            onClick={() => setPreview((on) => !on)}
            aria-pressed={preview}
            className="text-nybb-bone/80 hover:bg-nybb-bone/10 hover:text-nybb-bone ml-auto flex min-h-11 items-center gap-1.5 rounded px-2.5 text-sm transition-colors sm:min-h-9"
          >
            {preview ? <EyeOff aria-hidden className="size-4" /> : <Eye aria-hidden className="size-4" />}
            {preview ? "Hide preview" : "Preview"}
          </button>
        </div>

        <div className={cn(preview && "lg:grid lg:grid-cols-2")}>
          <textarea
            ref={area}
            id={id}
            rows={rows}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => {
              if (!(event.ctrlKey || event.metaKey)) return;
              const key = event.key.toLowerCase();
              if (key === "b" || key === "i") {
                event.preventDefault();
                apply(key === "b" ? TOOLS[0].make : TOOLS[1].make);
              }
            }}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-error` : `${id}-hint`}
            className="block w-full resize-y rounded-none border-0 px-3.5 py-3 font-mono text-sm leading-relaxed"
          />
          {preview ? (
            <div
              aria-label={`Preview of ${label}`}
              className="bg-nybb-parchment text-nybb-ink/85 border-nybb-bone/15 max-h-[32rem] space-y-4 overflow-y-auto border-t p-4 text-base leading-relaxed lg:border-t-0 lg:border-l [&_li]:mt-2 [&_ul]:list-disc [&_ul]:pl-5"
            >
              {value.trim() ? (
                <RichText
                  source={value}
                  styles={{
                    heading: "text-nybb-ink pt-2 text-lg font-semibold",
                    strong: "text-nybb-ink",
                    link: "text-nybb-ink",
                    orderedList: "list-decimal pl-5",
                  }}
                />
              ) : (
                <p className="text-nybb-ink/60 text-sm">Nothing to preview yet.</p>
              )}
            </div>
          ) : null}
        </div>
      </div>

      <p id={`${id}-hint`} className="text-nybb-bone/55 mt-1.5 text-xs">
        {hint ? `${hint} ` : ""}A blank line starts a new paragraph.
      </p>
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}

/** The formatting guide, once per editor rather than once per field. */
export function FormattingHelp({ legal }: { legal: boolean }) {
  const rows: [string, string][] = [
    ["A blank line", "Starts a new paragraph"],
    ["One line break", "A new line inside the same paragraph"],
    ["**bold**", "Bold"],
    ["*italic*", "Italic"],
    ["[words](/menu)", "A link. Starts with /, #, https://, mailto: or tel:"],
    ["- item", "A bullet list, one item per line"],
    ["1. item", "A numbered list"],
    ["### Heading", "A subheading inside a section"],
    ["[[pending: what]]", "Shows “To be supplied by the owner” and marks the page as a draft"],
  ];
  if (legal) {
    rows.push(["::: center", "Starts a centred group. End it with a line of just :::"]);
    rows.push(["{{npc-seal}}", "The NPC registration seal, on a line of its own"]);
  }
  return (
    <details className="bg-nybb-charcoal group rounded-md p-4 sm:p-5">
      <summary className="text-nybb-bone cursor-pointer text-sm font-medium">
        How formatting works
      </summary>
      <p className="text-nybb-bone/70 mt-3 text-sm">
        The toolbar buttons write these for you. You can also type them, and Ctrl+B and Ctrl+I work
        in any formatted box.
      </p>
      <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[minmax(0,14rem)_1fr]">
        {rows.map(([syntax, meaning]) => (
          <div key={syntax} className="contents">
            <dt className="text-nybb-yellow font-mono">{syntax}</dt>
            <dd className="text-nybb-bone/75">{meaning}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
