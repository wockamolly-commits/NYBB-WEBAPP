import { describe, expect, it } from "vitest";
import { BANNER_MAX } from "@/lib/themes/presets";
import { previewQuery, previewSetting } from "@/lib/themes/preview";

describe("previewSetting", () => {
  it("refuses unknown ids and the everyday look", () => {
    expect(previewSetting("easter", {})).toBeNull();
    expect(previewSetting("default", {})).toBeNull();
  });

  it("reads flags as off unless they are exactly 1", () => {
    expect(previewSetting("christmas", {})).toEqual({
      id: "christmas",
      banner: { show: false, text: "" },
      effects: false,
    });
    expect(previewSetting("christmas", { banner: "true", fx: "yes" })?.effects).toBe(false);
  });

  it("trims the text to the banner limit", () => {
    const setting = previewSetting("halloween", { banner: "1", fx: "1", text: ` ${"x".repeat(200)} ` });
    expect(setting?.banner.text).toHaveLength(BANNER_MAX);
    expect(setting?.effects).toBe(true);
  });

  it("round trips through previewQuery", () => {
    const setting = { id: "summer" as const, banner: { show: true, text: "Beach & wings?" }, effects: true };
    const query = Object.fromEntries(new URLSearchParams(previewQuery(setting)));
    expect(previewSetting("summer", query)).toEqual(setting);
  });
});
