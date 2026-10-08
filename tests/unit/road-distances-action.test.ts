import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The route line on the branch map is drawn from what this action returns,
 * so a branch missing from its destinations gets a map with no line. It once
 * read the static catalog, which left every branch added or pinned from the
 * workspace without one.
 */

const roadRoutes = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/rate-limit/limiter", () => ({ withinAddressLimit: async () => true }));
vi.mock("@/lib/branches/road", () => ({
  roadRoutesConfigured: () => true,
  roadRoutes: (...args: unknown[]) => roadRoutes(...args),
}));
vi.mock("@/lib/branches/reader", () => ({
  listBranches: async () => [
    {
      slug: "shell-gorordo",
      name: "Shell Gorordo",
      shortName: "Shell Gorordo",
      addressLine: "839 Gorordo Avenue",
      city: "Cebu City",
      phones: [],
      format: "petrol",
      // A workspace pin laid over the catalog's.
      pin: { lat: 10.33, lng: 123.91 },
    },
    {
      slug: "ayala-center",
      name: "Ayala Center",
      shortName: "Ayala Center",
      addressLine: "Level 2",
      city: "Cebu City",
      phones: [],
      format: "mall",
      pin: { lat: 10.318, lng: 123.905 },
    },
    {
      slug: "unpinned",
      name: "Unpinned",
      shortName: "Unpinned",
      addressLine: "Somewhere",
      city: "Cebu City",
      phones: [],
      format: "street",
    },
  ],
}));

describe("fetchRoadRoutes", () => {
  beforeEach(() => {
    roadRoutes.mockReset();
    roadRoutes.mockResolvedValue({});
  });

  it("routes to every pinned branch, including ones added or pinned from the workspace", async () => {
    const { fetchRoadRoutes } = await import("@/app/actions/road-distances");
    await fetchRoadRoutes({ lat: 10.31, lng: 123.89 });

    expect(roadRoutes).toHaveBeenCalledWith({ lat: 10.31, lng: 123.89 }, [
      { slug: "shell-gorordo", pin: { lat: 10.33, lng: 123.91 } },
      { slug: "ayala-center", pin: { lat: 10.318, lng: 123.905 } },
    ]);
  });

  it("asks for nothing from somebody nowhere near a branch", async () => {
    const { fetchRoadRoutes } = await import("@/app/actions/road-distances");
    expect(await fetchRoadRoutes({ lat: 14.6, lng: 121.0 })).toBeNull();
    expect(roadRoutes).not.toHaveBeenCalled();
  });
});
