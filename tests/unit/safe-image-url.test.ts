import { describe, expect, it } from "vitest";
import { isImagePlaceholder, isOwnStorageImageUrl } from "@/lib/images/safe-url";
import { resolveMenuImage } from "@/lib/menu/resolve-image";

const PROJECT = "https://ktltawglqblcqduavcre.supabase.co";
const GOOD = `${PROJECT}/storage/v1/object/public/menu-images/items/a1-900.webp`;

describe("isOwnStorageImageUrl", () => {
  it("accepts a file in this project's bucket", () => {
    expect(isOwnStorageImageUrl(GOOD, "menu-images", PROJECT)).toBe(true);
  });

  it.each([
    ["another Supabase project", GOOD.replace("ktltawglqblcqduavcre", "someoneelse0000000000")],
    ["another site", "https://evil.example.com/storage/v1/object/public/menu-images/a.webp"],
    ["another scheme", "javascript:alert(1)"],
    ["plain http", GOOD.replace("https:", "http:")],
    ["another bucket", GOOD.replace("menu-images", "voucher-posters")],
    ["a climb", `${PROJECT}/storage/v1/object/public/menu-images/../private/a.webp`],
    ["a query", `${GOOD}?a=1`],
    ["credentials", GOOD.replace("https://", "https://user:pw@")],
    ["a port", GOOD.replace(".co/", ".co:8443/")],
    ["nothing", ""],
  ])("refuses %s", (_label, url) => {
    expect(isOwnStorageImageUrl(url, "menu-images", PROJECT)).toBe(false);
  });
});

describe("isImagePlaceholder", () => {
  it("accepts a raster data URL and nothing else", () => {
    expect(isImagePlaceholder("data:image/webp;base64,UklGRg==")).toBe(true);
    expect(isImagePlaceholder("data:image/svg+xml;base64,PHN2Zz4=")).toBe(false);
    expect(isImagePlaceholder("https://evil.example.com/a.png")).toBe(false);
    expect(isImagePlaceholder(`data:image/png;base64,${"A".repeat(20_001)}`)).toBe(false);
  });
});

describe("resolveMenuImage", () => {
  it("shows no uploaded picture from another site, falling back to the archive or nothing", () => {
    expect(
      resolveMenuImage({
        src: "https://evil.example.com/pixel.gif",
        width: 1,
        height: 1,
        blurDataURL: "data:image/gif;base64,R0lGOD==",
        source: null,
      }),
    ).toBeNull();
  });
});
