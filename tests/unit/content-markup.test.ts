import { describe, expect, it } from "vitest";
import { hasPending, hasSeal, isSafeHref, linkTargets, parseInline, parseMarkup } from "@/lib/content/markup";

describe("parseInline", () => {
  it("reads bold, italic, links and placeholders", () => {
    expect(parseInline("a **b** *c* [d](/menu) [[pending: e]]")).toEqual([
      { t: "text", v: "a " },
      { t: "strong", c: [{ t: "text", v: "b" }] },
      { t: "text", v: " " },
      { t: "em", c: [{ t: "text", v: "c" }] },
      { t: "text", v: " " },
      { t: "link", href: "/menu", c: [{ t: "text", v: "d" }] },
      { t: "text", v: " " },
      { t: "pending", label: "e" },
    ]);
  });

  it("nests a link inside bold, the way the DPO address is written", () => {
    expect(parseInline("**Email: [x@5bdf.ph](mailto:x@5bdf.ph)**")).toEqual([
      {
        t: "strong",
        c: [
          { t: "text", v: "Email: " },
          { t: "link", href: "mailto:x@5bdf.ph", c: [{ t: "text", v: "x@5bdf.ph" }] },
        ],
      },
    ]);
  });

  it("turns a single newline into a line break", () => {
    expect(parseInline("one\ntwo")).toEqual([{ t: "text", v: "one" }, { t: "br" }, { t: "text", v: "two" }]);
  });

  it("keeps the words of an unsafe link and drops the link", () => {
    expect(parseInline("[click](data:text/html,x)")).toEqual([{ t: "text", v: "click" }]);
    expect(parseInline("[click](javascript:alert(1))")).toEqual([{ t: "text", v: "click" }]);
  });

  it("reads a link whose address has brackets in it", () => {
    expect(parseInline("[Cebu](https://en.wikipedia.org/wiki/Cebu_(province))")).toEqual([
      { t: "link", href: "https://en.wikipedia.org/wiki/Cebu_(province)", c: [{ t: "text", v: "Cebu" }] },
    ]);
  });

  it("leaves markup characters it cannot pair as text", () => {
    expect(parseInline("5 * 3 and a lone ** pair")).toEqual([{ t: "text", v: "5 * 3 and a lone ** pair" }]);
    expect(parseInline("\\*not italic\\*")).toEqual([{ t: "text", v: "*not italic*" }]);
  });

  it("never produces HTML: a script tag is text", () => {
    expect(parseInline("<script>alert(1)</script>")).toEqual([
      { t: "text", v: "<script>alert(1)</script>" },
    ]);
  });
});

describe("parseMarkup", () => {
  it("splits paragraphs on blank lines and reads lists and subheadings", () => {
    expect(parseMarkup("### Title\n\nFirst para.\n\n- one\n- two\n\n1. a\n2. b")).toEqual([
      { t: "h", c: [{ t: "text", v: "Title" }] },
      { t: "p", c: [{ t: "text", v: "First para." }] },
      { t: "ul", items: [[{ t: "text", v: "one" }], [{ t: "text", v: "two" }]] },
      { t: "ol", items: [[{ t: "text", v: "a" }], [{ t: "text", v: "b" }]] },
    ]);
  });

  it("does not read a legal clause number as a numbered list", () => {
    const [block] = parseMarkup("4.1.1. **Promo and Raffle Management**");
    expect(block.t).toBe("p");
  });

  it("reads the seal and a centred group", () => {
    expect(parseMarkup("::: center\n**Brand**\n\n{{npc-seal}}\n:::\n\nAfter")).toEqual([
      {
        t: "center",
        c: [{ t: "p", c: [{ t: "strong", c: [{ t: "text", v: "Brand" }] }] }, { t: "seal" }],
      },
      { t: "p", c: [{ t: "text", v: "After" }] },
    ]);
  });

  it("treats an unclosed centre group as running to the end", () => {
    expect(parseMarkup("::: center\nText")).toEqual([
      { t: "center", c: [{ t: "p", c: [{ t: "text", v: "Text" }] }] },
    ]);
  });

  it("answers nothing for an empty field", () => {
    expect(parseMarkup("")).toEqual([]);
    expect(parseMarkup("\n\n  \n")).toEqual([]);
  });
});

describe("isSafeHref", () => {
  it.each(["/menu", "/menu#x", "#cookies", "https://example.com/a?b=c", "mailto:a@b.co", "tel:+63 32 520 4930"])(
    "accepts %s",
    (href) => expect(isSafeHref(href)).toBe(true),
  );

  it.each(["javascript:alert(1)", "JAVASCRIPT:alert(1)", "data:text/html,x", "//evil.example", "vbscript:x", "ftp://x", ""])(
    "refuses %s",
    (href) => expect(isSafeHref(href)).toBe(false),
  );
});

describe("helpers", () => {
  it("finds link targets, placeholders and the seal", () => {
    expect(linkTargets("[a](/x) and [b](javascript:y)")).toEqual(["/x", "javascript:y"]);
    expect(linkTargets("[b](javascript:alert(1))")).toEqual(["javascript:alert(1)"]);
    expect(hasPending("x [[pending: refund rule]]")).toBe(true);
    expect(hasPending("x")).toBe(false);
    expect(hasSeal("a\n{{npc-seal}}\nb")).toBe(true);
    expect(hasSeal("inline {{npc-seal}} is not a seal")).toBe(false);
  });
});
