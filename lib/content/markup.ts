/**
 * The formatting language the Workspace content editor writes, and its parser.
 *
 * WHY NOT HTML, AND WHY NOT A MARKDOWN LIBRARY.
 *
 * What the editor stores is shown to every visitor of the public site, so the
 * one property that matters most is that nothing typed into it can become
 * markup the browser executes. This parser turns text into a small tree of
 * plain objects, and components/content/RichText.tsx turns that tree into
 * React elements. There is no dangerouslySetInnerHTML anywhere on that path,
 * so a pasted `<script>` is shown as the characters it is.
 *
 * It is also deliberately small. The pages it feeds have a fixed design, and
 * every construct here is one the existing pages already use: paragraphs,
 * bold, italic, links, bullet and numbered lists, a subheading, a centred
 * group, the owner placeholder and the NPC seal. A table or an image would
 * have no styling to land on, so the language cannot express one.
 *
 * THE SYNTAX, as the editor's help panel explains it:
 *
 *   Blank line              starts a new paragraph
 *   Single line break       a line break inside the paragraph
 *   **bold**   *italic*     emphasis
 *   [words](/path)          a link: /page, #section, https://, mailto: or tel:
 *   - item                  a bullet list, one item per line
 *   1. item                 a numbered list
 *   ### Heading             a subheading inside a section
 *   ::: center ... :::      a centred group of lines
 *   {{npc-seal}}            the NPC registration seal (Privacy Notice only)
 *   [[pending: what]]       "To be supplied by the owner: what"
 *   \*                      a literal asterisk (any character after \)
 *
 * The parser never throws. Text it cannot read as a construct is text.
 */

export type Inline =
  | { t: "text"; v: string }
  | { t: "br" }
  | { t: "strong"; c: Inline[] }
  | { t: "em"; c: Inline[] }
  | { t: "link"; href: string; c: Inline[] }
  | { t: "pending"; label: string };

export type Block =
  | { t: "p"; c: Inline[] }
  | { t: "h"; c: Inline[] }
  | { t: "ul"; items: Inline[][] }
  | { t: "ol"; items: Inline[][] }
  | { t: "seal" }
  | { t: "center"; c: Block[] };

const BULLET = /^\s*[-*]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;
const HEADING = /^\s*#{2,4}\s+(.*)$/;
const SEAL = /^\s*\{\{\s*npc-seal\s*\}\}\s*$/i;
const CENTER_OPEN = /^\s*:::\s*center\s*$/i;
const CENTER_CLOSE = /^\s*:::\s*$/;

/**
 * A link: [words](target). The target has no spaces, and brackets only in
 * balanced pairs one deep, so "https://en.wikipedia.org/wiki/Cebu_(province)"
 * is read whole, and so is the "javascript:alert(1)" the validator has to
 * quote back in full when it refuses one.
 */
const LINK_AT_START = /^\[([^\]\n]+)\]\(((?:[^()\s]|\([^()\s]*\))+)\)/;
const LINK_ANYWHERE = /\[[^\]\n]+\]\(((?:[^()\s]|\([^()\s]*\))+)\)/g;

/**
 * Whether a link target is one the site will render as a link.
 *
 * Same-site paths and anchors, web addresses, email and phone. Anything else,
 * `javascript:` and `data:` above all, is shown as plain text by the renderer
 * and refused by the editor's validation, so it can never reach an href.
 */
export function isSafeHref(href: string): boolean {
  const value = href.trim();
  if (/^\/(?!\/)/.test(value)) return true; // "/menu", but not "//evil.example"
  if (/^#[\w-]*$/.test(value)) return true;
  if (/^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(value)) return true;
  if (/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(value)) return true;
  if (/^tel:\+?[\d\s()-]{3,}$/i.test(value)) return true;
  return false;
}

/** Parse one run of inline text. Newlines become line breaks. */
export function parseInline(source: string): Inline[] {
  const out: Inline[] = [];
  let text = "";
  const flush = () => {
    if (text) out.push({ t: "text", v: text });
    text = "";
  };

  let i = 0;
  while (i < source.length) {
    const ch = source[i];

    if (ch === "\\" && i + 1 < source.length) {
      text += source[i + 1];
      i += 2;
      continue;
    }

    if (ch === "\n") {
      flush();
      out.push({ t: "br" });
      i += 1;
      continue;
    }

    if (source.startsWith("[[", i)) {
      const end = source.indexOf("]]", i + 2);
      const inner = end === -1 ? "" : source.slice(i + 2, end);
      const match = /^\s*pending\s*:\s*([\s\S]+?)\s*$/i.exec(inner);
      if (end !== -1 && match) {
        flush();
        out.push({ t: "pending", label: match[1] });
        i = end + 2;
        continue;
      }
    }

    if (source.startsWith("**", i)) {
      const end = source.indexOf("**", i + 2);
      if (end > i + 2) {
        flush();
        out.push({ t: "strong", c: parseInline(source.slice(i + 2, end)) });
        i = end + 2;
        continue;
      }
    }

    if (ch === "*" && source[i + 1] !== "*" && source[i + 1] !== " ") {
      const end = findClosingStar(source, i + 1);
      if (end !== -1) {
        flush();
        out.push({ t: "em", c: parseInline(source.slice(i + 1, end)) });
        i = end + 1;
        continue;
      }
    }

    if (ch === "[") {
      const link = LINK_AT_START.exec(source.slice(i));
      if (link) {
        flush();
        const [whole, label, href] = link;
        if (isSafeHref(href)) {
          out.push({ t: "link", href: href.trim(), c: parseInline(label) });
        } else {
          // An unsafe target keeps its words and loses the link.
          out.push(...parseInline(label));
        }
        i += whole.length;
        continue;
      }
    }

    text += ch;
    i += 1;
  }

  flush();
  return out;
}

/** The single `*` closing an italic run, skipping escapes and `**`. */
function findClosingStar(source: string, from: number): number {
  for (let j = from; j < source.length; j += 1) {
    if (source[j] === "\\") {
      j += 1;
      continue;
    }
    if (source[j] === "\n") return -1;
    if (source[j] === "*") {
      if (source[j + 1] === "*") {
        j += 1;
        continue;
      }
      return source[j - 1] === " " ? -1 : j;
    }
  }
  return -1;
}

/** Parse a whole field into blocks. */
export function parseMarkup(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  return parseLines(lines, 0, false).blocks;
}

function parseLines(
  lines: string[],
  start: number,
  insideCenter: boolean,
): { blocks: Block[]; next: number } {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let list: { kind: "ul" | "ol"; items: string[] } | null = null;

  const endParagraph = () => {
    if (paragraph.length) blocks.push({ t: "p", c: parseInline(paragraph.join("\n")) });
    paragraph = [];
  };
  const endList = () => {
    if (list) blocks.push({ t: list.kind, items: list.items.map((item) => parseInline(item)) });
    list = null;
  };

  let i = start;
  while (i < lines.length) {
    const line = lines[i];

    if (insideCenter && CENTER_CLOSE.test(line)) {
      endParagraph();
      endList();
      return { blocks, next: i + 1 };
    }

    if (!insideCenter && CENTER_OPEN.test(line)) {
      endParagraph();
      endList();
      const inner = parseLines(lines, i + 1, true);
      blocks.push({ t: "center", c: inner.blocks });
      i = inner.next;
      continue;
    }

    if (line.trim() === "") {
      endParagraph();
      endList();
      i += 1;
      continue;
    }

    if (SEAL.test(line)) {
      endParagraph();
      endList();
      blocks.push({ t: "seal" });
      i += 1;
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      endParagraph();
      endList();
      blocks.push({ t: "h", c: parseInline(heading[1].trim()) });
      i += 1;
      continue;
    }

    const bullet = BULLET.exec(line);
    const numbered = bullet ? null : NUMBERED.exec(line);
    if (bullet || numbered) {
      const kind = bullet ? "ul" : "ol";
      endParagraph();
      if (list && list.kind !== kind) endList();
      if (!list) list = { kind, items: [] };
      list.items.push((bullet ?? numbered)![1].trim());
      i += 1;
      continue;
    }

    if (list) {
      // A plain line straight under a list item continues that item.
      const items: string[] = (list as { items: string[] }).items;
      items[items.length - 1] += `\n${line.trim()}`;
      i += 1;
      continue;
    }

    paragraph.push(line.trim());
    i += 1;
  }

  endParagraph();
  endList();
  return { blocks, next: i };
}

/** Every link target written in a field, safe or not, for validation. */
export function linkTargets(source: string): string[] {
  return [...source.matchAll(LINK_ANYWHERE)].map((match) => match[1]);
}

/** Whether a field still carries an owner placeholder. */
export function hasPending(source: string): boolean {
  return /\[\[\s*pending\s*:/i.test(source);
}

/** Whether a field places the NPC seal. */
export function hasSeal(source: string): boolean {
  return source.split(/\r?\n/).some((line) => SEAL.test(line));
}
