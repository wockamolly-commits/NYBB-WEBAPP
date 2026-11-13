import { z } from "zod";
import { isSafeHref, linkTargets } from "./markup";

/**
 * What each editable page stores.
 *
 * TWO KINDS OF FIELD, ON PURPOSE.
 *
 * The landing page is held to plain text in fixed slots. Its layout is a
 * designed object, every line sits at a measured size over a photograph or a
 * band, and the request was to edit what it says without changing how it is
 * built. So the editor offers exactly the sentences the page already has, and
 * no field there can add a paragraph, a list or a link.
 *
 * The About page and the two legal pages are reading, and their bodies take
 * the formatting language in markup.ts. The legal pages are additionally a
 * list of sections the editor can add to, remove and reorder, because a
 * revised policy is often a revised structure.
 *
 * Kept out of the "use server" actions file so it can be unit tested (AGENTS.md
 * rule 6). There are no numbers in any of these, so the empty-is-not-zero rule
 * has nothing to bite on, but the same discipline applies to the one optional
 * value: a legal page's `date` is "" for "not decided yet", which renders the
 * owner placeholder, and never a made-up date.
 */

export const CONTENT_PAGES = ["home", "about", "privacy", "terms"] as const;
export type ContentPage = (typeof CONTENT_PAGES)[number];

export function isContentPage(value: string): value is ContentPage {
  return (CONTENT_PAGES as readonly string[]).includes(value);
}

export const CONTENT_PAGE_INFO: Record<
  ContentPage,
  { name: string; path: string; summary: string }
> = {
  home: {
    name: "Landing page",
    path: "/",
    summary: "The headline, the section introductions, the pickup steps and the franchise line.",
  },
  about: {
    name: "About",
    path: "/about",
    summary: "The heading, the story and the two sections under it.",
  },
  privacy: {
    name: "Privacy Policy",
    path: "/privacy",
    summary: "The full Privacy Notice, section by section.",
  },
  terms: {
    name: "Terms of Service",
    path: "/terms",
    summary: "The full Terms of Service, section by section.",
  },
};

/** Characters, per kind of field. */
export const LIMITS = {
  line: 80,
  sentence: 200,
  blurb: 320,
  body: 8_000,
  legalBody: 20_000,
  legalSections: 40,
} as const;

const trimmed = (max: number) => z.string().trim().max(max, `Keep this to ${max} characters.`);
const required = (max: number) => trimmed(max).min(1, "This cannot be empty.");

/** A formatted field: length-limited, and every link must be one the site will render. */
const markup = (max: number, { optional = false } = {}) =>
  (optional ? trimmed(max) : required(max)).superRefine((value, ctx) => {
    const bad = linkTargets(value).find((href) => !isSafeHref(href));
    if (bad) {
      ctx.addIssue({
        code: "custom",
        message: `"${bad}" cannot be a link. Links start with /, #, https://, mailto: or tel:.`,
      });
    }
  });

// ---------------------------------------------------------------------------
// Landing page
// ---------------------------------------------------------------------------

const step = z.object({ title: required(LIMITS.line), body: required(LIMITS.sentence) });

export const homeSchema = z.object({
  hero: z.object({
    tagline: required(LIMITS.line),
    headline: required(LIMITS.line),
    headlineAccent: trimmed(LIMITS.line),
    lede: required(LIMITS.sentence),
  }),
  flavours: z.object({ title: required(LIMITS.line), body: required(LIMITS.blurb) }),
  heat: z.object({
    title: required(LIMITS.line),
    body: required(LIMITS.blurb),
    note: trimmed(LIMITS.sentence),
  }),
  pickup: z.object({
    title: required(LIMITS.line),
    steps: z.array(step).length(4),
  }),
  more: z.object({ title: required(LIMITS.line), body: required(LIMITS.blurb) }),
  branches: z.object({ body: required(LIMITS.sentence) }),
  franchise: z.object({
    line: required(LIMITS.sentence),
    email: z.union([z.literal(""), z.email("Enter an email address, or leave it empty.").max(120)]),
  }),
});
export type HomeContent = z.infer<typeof homeSchema>;

// ---------------------------------------------------------------------------
// About
// ---------------------------------------------------------------------------

export const aboutSchema = z.object({
  heading: z.object({ first: required(LIMITS.line), second: trimmed(LIMITS.line) }),
  intro: markup(LIMITS.body),
  claim: z.object({
    title: required(LIMITS.line),
    body: markup(LIMITS.body),
    signature: trimmed(LIMITS.line),
  }),
  fried: z.object({ title: required(LIMITS.line), body: markup(LIMITS.body) }),
});
export type AboutContent = z.infer<typeof aboutSchema>;

// ---------------------------------------------------------------------------
// Privacy Policy and Terms of Service
// ---------------------------------------------------------------------------

const SECTION_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const legalSectionSchema = z.object({
  /** The section's #anchor. Kept stable across edits so old links still land. */
  id: z.string().regex(SECTION_ID, "Use lowercase letters, numbers and dashes.").max(60),
  title: required(120),
  body: markup(LIMITS.legalBody),
});

export const legalSchema = z
  .object({
    title: required(120),
    /** "effective" prints "Effective <date>", "updated" prints "Last updated <date>". */
    dateLabel: z.enum(["effective", "updated"]),
    /** YYYY-MM-DD, or "" while the date is still the owner's to decide. */
    date: z.union([
      z.literal(""),
      z.iso.date("Use a real date, or leave it empty."),
    ]),
    intro: markup(LIMITS.body, { optional: true }),
    sections: z
      .array(legalSectionSchema)
      .min(1, "A policy needs at least one section.")
      .max(LIMITS.legalSections, `Keep this to ${LIMITS.legalSections} sections.`),
  })
  .superRefine((value, ctx) => {
    const seen = new Set<string>();
    value.sections.forEach((section, index) => {
      if (seen.has(section.id)) {
        ctx.addIssue({
          code: "custom",
          path: ["sections", index, "id"],
          message: "Two sections cannot share a link name.",
        });
      }
      seen.add(section.id);
    });
  });
export type LegalContent = z.infer<typeof legalSchema>;
export type LegalSectionContent = z.infer<typeof legalSectionSchema>;

// ---------------------------------------------------------------------------
// Per page
// ---------------------------------------------------------------------------

export type ContentFor = {
  home: HomeContent;
  about: AboutContent;
  privacy: LegalContent;
  terms: LegalContent;
};

export const CONTENT_SCHEMAS: { [P in ContentPage]: z.ZodType<ContentFor[P]> } = {
  home: homeSchema,
  about: aboutSchema,
  privacy: legalSchema,
  terms: legalSchema,
};

/** Field path to message, for the editor. Only the first problem per field. */
export type ContentFieldErrors = Record<string, string>;

export function fieldErrors(error: z.ZodError): ContentFieldErrors {
  const out: ContentFieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".");
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}

/** A section anchor made from its title, unique among the ones already taken. */
export function sectionIdFor(title: string, taken: readonly string[]): string {
  const base =
    title
      .toLowerCase()
      .replace(/^[\d.\s]+/, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48)
      .replace(/-+$/g, "") || "section";
  let id = base;
  for (let n = 2; taken.includes(id); n += 1) id = `${base}-${n}`;
  return id;
}
