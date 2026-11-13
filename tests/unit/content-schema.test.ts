import { describe, expect, it } from "vitest";
import { CONTENT_DEFAULTS, DEFAULT_HOME, DEFAULT_PRIVACY, DEFAULT_TERMS } from "@/lib/content/defaults";
import { hasPending, hasSeal } from "@/lib/content/markup";
import {
  CONTENT_PAGES,
  CONTENT_SCHEMAS,
  aboutSchema,
  fieldErrors,
  homeSchema,
  legalSchema,
  sectionIdFor,
} from "@/lib/content/schema";

describe("built-in text", () => {
  it.each(CONTENT_PAGES)("%s parses against its own schema", (page) => {
    const parsed = CONTENT_SCHEMAS[page].safeParse(CONTENT_DEFAULTS[page]);
    expect(parsed.success ? null : parsed.error.issues).toBeNull();
  });

  it("carries no em dash anywhere (AGENTS.md rule 4)", () => {
    expect(JSON.stringify(CONTENT_DEFAULTS)).not.toContain("—");
  });

  it("keeps the Privacy Notice final and the Terms a draft, as the hand-built pages were", () => {
    expect(DEFAULT_PRIVACY.date).toBe("2026-02-18");
    expect(DEFAULT_PRIVACY.sections.some((s) => hasPending(s.body))).toBe(false);
    expect(DEFAULT_PRIVACY.sections.some((s) => hasSeal(s.body))).toBe(true);
    expect(DEFAULT_TERMS.date).toBe("");
    expect(hasPending(DEFAULT_TERMS.intro)).toBe(true);
  });

  it("keeps the anchors existing links point at", () => {
    expect(DEFAULT_PRIVACY.sections.map((s) => s.id)).toContain("cookies");
    expect(DEFAULT_TERMS.sections.map((s) => s.id)).toEqual([
      "ordering",
      "prices",
      "pickup",
      "cancellations",
      "refunds",
      "promos",
      "accounts",
      "liability",
      "law",
    ]);
  });
});

describe("validation", () => {
  it("refuses a link the site would not render", () => {
    const result = legalSchema.safeParse({ ...DEFAULT_PRIVACY, intro: "See [this](javascript:alert(1))." });
    expect(result.success).toBe(false);
    if (!result.success) expect(fieldErrors(result.error).intro).toMatch(/cannot be a link/);
  });

  it("keeps an empty date as empty, never a made-up date (AGENTS.md rule 6)", () => {
    expect(legalSchema.parse({ ...DEFAULT_TERMS, date: "" }).date).toBe("");
    expect(legalSchema.safeParse({ ...DEFAULT_TERMS, date: "2026-02-30" }).success).toBe(false);
    expect(legalSchema.safeParse({ ...DEFAULT_TERMS, date: "18 February 2026" }).success).toBe(false);
  });

  it("refuses two sections with one anchor", () => {
    const [first] = DEFAULT_TERMS.sections;
    const result = legalSchema.safeParse({ ...DEFAULT_TERMS, sections: [first, { ...first }] });
    expect(result.success).toBe(false);
    if (!result.success) expect(fieldErrors(result.error)["sections.1.id"]).toMatch(/share/);
  });

  it("refuses an empty policy and an empty required line", () => {
    expect(legalSchema.safeParse({ ...DEFAULT_TERMS, sections: [] }).success).toBe(false);
    const result = homeSchema.safeParse({ ...DEFAULT_HOME, hero: { ...DEFAULT_HOME.hero, headline: "   " } });
    expect(result.success).toBe(false);
    if (!result.success) expect(fieldErrors(result.error)["hero.headline"]).toBeDefined();
  });

  it("holds the landing page to exactly four pickup steps", () => {
    const three = {
      ...DEFAULT_HOME,
      pickup: { ...DEFAULT_HOME.pickup, steps: DEFAULT_HOME.pickup.steps.slice(0, 3) },
    };
    expect(homeSchema.safeParse(three).success).toBe(false);
  });

  it("takes an empty franchise email as none, and refuses a malformed one", () => {
    const none = homeSchema.parse({ ...DEFAULT_HOME, franchise: { ...DEFAULT_HOME.franchise, email: "" } });
    expect(none.franchise.email).toBe("");
    const bad = { ...DEFAULT_HOME, franchise: { ...DEFAULT_HOME.franchise, email: "nope" } };
    expect(homeSchema.safeParse(bad).success).toBe(false);
  });

  it("enforces the length limits", () => {
    const about = CONTENT_DEFAULTS.about;
    expect(aboutSchema.safeParse({ ...about, claim: { ...about.claim, title: "x".repeat(81) } }).success).toBe(false);
  });

  it("strips unknown keys rather than storing them", () => {
    const parsed = homeSchema.parse({ ...DEFAULT_HOME, extra: "<script>" });
    expect("extra" in parsed).toBe(false);
  });
});

describe("sectionIdFor", () => {
  it("makes an anchor from a numbered title and avoids collisions", () => {
    expect(sectionIdFor("8. Cookies", [])).toBe("cookies");
    expect(sectionIdFor("8. Cookies", ["cookies"])).toBe("cookies-2");
    expect(sectionIdFor("!!!", [])).toBe("section");
  });
});
