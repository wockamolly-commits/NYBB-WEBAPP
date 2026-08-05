import { describe, expect, it } from "vitest";
import { formatPeso, formatPesoCompact, formatPesoRange } from "@/lib/format";
import { telHref } from "@/lib/phone";

describe("formatPeso", () => {
  it("renders centavos as pesos", () => {
    expect(formatPeso(32900)).toBe("₱329.00");
    expect(formatPeso(0)).toBe("₱0.00");
  });

  it("keeps two decimals on values that are not whole pesos", () => {
    expect(formatPeso(10550)).toBe("₱105.50");
  });

  it("never loses a centavo to floating point", () => {
    // 0.1 + 0.2 arithmetic is exactly why money stays in integer minor units.
    expect(formatPeso(1010)).toBe("₱10.10");
    expect(formatPeso(2020)).toBe("₱20.20");
    expect(formatPeso(1010 + 2020)).toBe("₱30.30");
  });
});

describe("formatPesoCompact", () => {
  it("drops the decimals on a whole peso value", () => {
    expect(formatPesoCompact(32900)).toBe("329");
    expect(formatPesoCompact(3000)).toBe("30");
  });

  it("keeps them when there are centavos", () => {
    expect(formatPesoCompact(10550)).toBe("105.50");
  });
});

describe("formatPesoRange", () => {
  it("collapses when both ends match", () => {
    expect(formatPesoRange(34900, 34900)).toBe("349");
  });

  it("spans when they differ", () => {
    expect(formatPesoRange(32900, 52900)).toBe("329-529");
  });
});

describe("telHref", () => {
  it("converts a published mobile number to an international dial string", () => {
    expect(telHref("0906-440-5297")).toBe("tel:+639064405297");
  });

  it("converts a landline with an area code in brackets", () => {
    expect(telHref("(032) 318-2405")).toBe("tel:+63323182405");
  });

  it("leaves a number that already lacks the trunk zero alone", () => {
    expect(telHref("917 790 0243")).toBe("tel:+639177900243");
  });
});
