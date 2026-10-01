import { describe, expect, it } from "vitest";
import { mergeStores } from "@/lib/branches/merge";
import {
  RECOMMEND_WITHIN_KM,
  ROAD_FACTOR,
  distanceKm,
  distanceLabel,
  distancesBySlug,
  formatDistance,
  rankByDistance,
  roadKm,
  suggestNearest,
} from "@/lib/branches/nearest";
import type { Branch } from "@/lib/catalog/types";
import type { OrderableBranch, Store } from "@/lib/branches/types";

// Real pins from lib/catalog/branches.ts, so the distances below are the ones
// a customer in Cebu would actually be shown.
const MANGO = { lat: 10.3107153, lng: 123.8962067 };
const CENTRAL_BLOC = { lat: 10.3311738, lng: 123.9058611 };
const SM_CITY = { lat: 10.3120356, lng: 123.9179292 };

function catalogEntry(slug: string, pin?: { lat: number; lng: number }): Branch {
  return {
    slug,
    name: `NYBB Hot Wings, ${slug}`,
    shortName: slug,
    addressLine: "Somewhere",
    city: "Cebu City",
    phones: ["0900-000-0000"],
    format: "street",
    ...(pin ? { pin } : {}),
  };
}

function live(slug: string): OrderableBranch {
  return {
    slug,
    name: `NYBB Hot Wings, ${slug}`,
    shortName: slug,
    format: "street",
    addressLine: "Somewhere",
    city: "Cebu City",
    phones: ["0900-000-0000"],
    timezone: "Asia/Manila",
    slotMinutes: 15,
    prepMinutes: 20,
    acceptsOrdersNow: true,
    isOpenNow: true,
  };
}

function storesFrom(catalog: Branch[], liveSlugs: string[]): Store[] {
  return mergeStores(catalog, liveSlugs.map(live));
}

describe("how far a counter is", () => {
  it("is zero from the counter itself", () => {
    expect(distanceKm(MANGO, MANGO)).toBe(0);
  });

  // Mango Avenue to Central Bloc is a short hop up to Lahug. Measured on a map
  // as a straight line it is about two and a half kilometres.
  it("measures a straight line between two Cebu counters", () => {
    expect(distanceKm(MANGO, CENTRAL_BLOC)).toBeCloseTo(2.5, 1);
    expect(distanceKm(CENTRAL_BLOC, MANGO)).toBeCloseTo(distanceKm(MANGO, CENTRAL_BLOC), 10);
  });

  // Manila is roughly 570 km from Cebu City. Past the recommendation cutoff by
  // an order of magnitude, which is the case the cutoff exists for.
  it("measures a long distance on a sphere, not a flat grid", () => {
    const manila = { lat: 14.5995, lng: 120.9842 };
    expect(distanceKm(manila, MANGO)).toBeGreaterThan(550);
    expect(distanceKm(manila, MANGO)).toBeLessThan(590);
  });
});

// Google Maps measures the road, and customers compare against it. A bare
// straight line reads as the page being wrong, so rows show the road estimate.
describe("how far it is by road", () => {
  it("stretches the straight line by the road factor", () => {
    expect(roadKm(MANGO, CENTRAL_BLOC)).toBeCloseTo(distanceKm(MANGO, CENTRAL_BLOC) * ROAD_FACTOR, 10);
    expect(roadKm(MANGO, CENTRAL_BLOC)).toBeCloseTo(3.5, 1);
  });

  it("is what every row and the suggestion carry", () => {
    const stores = storesFrom([catalogEntry("central-bloc", CENTRAL_BLOC)], ["central-bloc"]);

    expect(distancesBySlug(stores, MANGO).get("central-bloc")).toBeCloseTo(roadKm(MANGO, CENTRAL_BLOC), 10);
    expect(suggestNearest(stores, distancesBySlug(stores, MANGO))).toMatchObject({
      km: roadKm(MANGO, CENTRAL_BLOC),
      measured: false,
    });
  });

  // Mapbox's own road distance replaces the estimate wherever it answered.
  it("gives way to a measured road distance, counter by counter", () => {
    const stores = storesFrom(
      [catalogEntry("mango", MANGO), catalogEntry("central-bloc", CENTRAL_BLOC)],
      ["mango", "central-bloc"],
    );
    const distances = distancesBySlug(stores, SM_CITY, { "central-bloc": 4.1 });

    expect(distances.get("central-bloc")).toBe(4.1);
    expect(distances.get("mango")).toBeCloseTo(roadKm(SM_CITY, MANGO), 10);
  });

  // Measured road distances can rank counters differently from the straight
  // line: a river or a one way system puts the nearer pin further away.
  it("suggests by the measured road, not the straight line", () => {
    const stores = storesFrom(
      [catalogEntry("mango", MANGO), catalogEntry("central-bloc", CENTRAL_BLOC)],
      ["mango", "central-bloc"],
    );
    const measured = { mango: 5.2, "central-bloc": 2.3 };

    expect(suggestNearest(stores, distancesBySlug(stores, MANGO, measured), measured)).toMatchObject({
      store: { slug: "central-bloc" },
      km: 2.3,
      measured: true,
    });
  });

  it("does not invent a distance for an unpinned counter Mapbox answered for", () => {
    const stores = storesFrom([catalogEntry("shell-naga")], ["shell-naga"]);
    expect(distancesBySlug(stores, MANGO, { "shell-naga": 3 }).has("shell-naga")).toBe(false);
  });
});

describe("the pin a store carries", () => {
  it("comes from the catalog, and is null where the catalog has none", () => {
    const stores = storesFrom(
      [catalogEntry("mango", MANGO), catalogEntry("shell-naga")],
      ["mango"],
    );
    expect(stores.find((s) => s.slug === "mango")?.pin).toEqual(MANGO);
    expect(stores.find((s) => s.slug === "shell-naga")?.pin).toBeNull();
  });

  it("is null for a branch the database has and the catalog does not", () => {
    const stores = storesFrom([], ["brand-new"]);
    expect(stores[0].pin).toBeNull();
  });
});

describe("distances shown on each row", () => {
  it("covers every pinned counter, orderable or not, and skips the unpinned", () => {
    const stores = storesFrom(
      [catalogEntry("mango", MANGO), catalogEntry("sm-city", SM_CITY), catalogEntry("shell-naga")],
      ["mango"],
    );
    const distances = distancesBySlug(stores, MANGO);

    expect(distances.get("mango")).toBe(0);
    expect(distances.get("sm-city")).toBeGreaterThan(0);
    expect(distances.has("shell-naga")).toBe(false);
  });
});

describe("the order the boards run in once there is a position", () => {
  const slugs = (stores: { slug: string }[]) => stores.map((store) => store.slug);

  it("puts the nearest counter first", () => {
    const stores = storesFrom(
      [catalogEntry("mango", MANGO), catalogEntry("sm-city", SM_CITY), catalogEntry("central-bloc", CENTRAL_BLOC)],
      [],
    );
    const standingInLahug = { lat: 10.33, lng: 123.905 };

    expect(slugs(rankByDistance(stores, distancesBySlug(stores, standingInLahug)))).toEqual([
      "central-bloc",
      "mango",
      "sm-city",
    ]);
  });

  // No distance is not a distance of zero, and not a reason to go first.
  it("puts counters with no pin after every counter with a distance, in published order", () => {
    const stores = storesFrom(
      [catalogEntry("naga"), catalogEntry("sm-city", SM_CITY), catalogEntry("country-club"), catalogEntry("mango", MANGO)],
      [],
    );

    expect(slugs(rankByDistance(stores, distancesBySlug(stores, MANGO)))).toEqual([
      "mango",
      "sm-city",
      "naga",
      "country-club",
    ]);
  });

  it("keeps the published order between counters equally near, and leaves its input alone", () => {
    const stores = storesFrom([catalogEntry("first", MANGO), catalogEntry("second", MANGO)], []);
    const ranked = rankByDistance(stores, distancesBySlug(stores, SM_CITY));

    expect(slugs(ranked)).toEqual(["first", "second"]);
    expect(ranked).not.toBe(stores);
  });
});

describe("which counter is suggested", () => {
  it("suggests the nearest counter that can take an order", () => {
    const stores = storesFrom(
      [catalogEntry("mango", MANGO), catalogEntry("central-bloc", CENTRAL_BLOC)],
      ["mango", "central-bloc"],
    );
    const standingInLahug = { lat: 10.33, lng: 123.905 };

    expect(suggestNearest(stores, distancesBySlug(stores, standingInLahug))).toMatchObject({
      kind: "nearest",
      store: { slug: "central-bloc" },
    });
  });

  // A phone-only counter next door is still shown with its distance on its own
  // row. It is not what the suggestion offers, because the suggestion's button
  // chooses a counter for this order and that one cannot be chosen.
  it("passes over a closer counter that cannot take an online order", () => {
    const stores = storesFrom(
      [catalogEntry("mango", MANGO), catalogEntry("sm-city", SM_CITY)],
      ["mango"],
    );

    expect(suggestNearest(stores, distancesBySlug(stores, SM_CITY))).toMatchObject({
      kind: "nearest",
      store: { slug: "mango" },
    });
  });

  // A shut counter is shown greyed out on the board and cannot be chosen, so
  // the suggestion's button would offer a press the server refuses.
  it("passes over a closer counter that is closed right now", () => {
    const stores = storesFrom(
      [catalogEntry("mango", MANGO), catalogEntry("sm-city", SM_CITY)],
      ["mango", "sm-city"],
    ).map((store) => (store.slug === "sm-city" ? { ...store, closedNow: true } : store));

    expect(suggestNearest(stores, distancesBySlug(stores, SM_CITY))).toMatchObject({
      kind: "nearest",
      store: { slug: "mango" },
    });
  });

  it("keeps the published order when two counters are equally near", () => {
    const stores = storesFrom(
      [catalogEntry("first", MANGO), catalogEntry("second", MANGO)],
      ["first", "second"],
    );
    expect(suggestNearest(stores, distancesBySlug(stores, MANGO))).toMatchObject({
      store: { slug: "first" },
    });
  });

  // Guessing a location for a counter with no confirmed pin would be the
  // suggestion inventing the one fact it is built on.
  it("leaves out a counter with no pin", () => {
    const stores = storesFrom(
      [catalogEntry("shell-naga"), catalogEntry("nustar", { lat: 10.2715457, lng: 123.8802395 })],
      ["shell-naga", "nustar"],
    );
    expect(suggestNearest(stores, distancesBySlug(stores, MANGO))).toMatchObject({
      store: { slug: "nustar" },
    });
  });

  it("suggests nothing when no orderable counter has a pin", () => {
    const stores = storesFrom(
      [catalogEntry("shell-naga"), catalogEntry("sm-city", SM_CITY)],
      ["shell-naga"],
    );
    expect(suggestNearest(stores, distancesBySlug(stores, MANGO))).toEqual({ kind: "none" });
  });

  // Somebody browsing from Manila should not be told to collect from a counter
  // an hour's flight away as though it were round the corner.
  it("says the customer is far away instead of suggesting past the cutoff", () => {
    const stores = storesFrom([catalogEntry("mango", MANGO)], ["mango"]);
    const manila = { lat: 14.5995, lng: 120.9842 };

    const result = suggestNearest(stores, distancesBySlug(stores, manila));
    expect(result).toMatchObject({ kind: "far", store: { slug: "mango" } });
    expect(result.kind === "far" && result.km).toBeGreaterThan(RECOMMEND_WITHIN_KM);
  });
});

describe("how a distance is written", () => {
  it("writes metres under a kilometre, rounded to fifty", () => {
    expect(formatDistance(0.42)).toBe("400 m");
    expect(formatDistance(0.46)).toBe("450 m");
  });

  it("does not claim zero metres for somebody at the counter", () => {
    expect(formatDistance(0)).toBe("under 100 m");
    expect(formatDistance(0.07)).toBe("under 100 m");
  });

  it("moves to kilometres rather than writing 1000 m", () => {
    expect(formatDistance(0.99)).toBe("1.0 km");
  });

  it("keeps one decimal under ten kilometres and drops it after", () => {
    expect(formatDistance(2.51)).toBe("2.5 km");
    expect(formatDistance(12.4)).toBe("12 km");
    expect(formatDistance(1234)).toBe("1,234 km");
  });

  it("reads as a sentence on a counter row", () => {
    expect(distanceLabel(2.51)).toBe("About 2.5 km away by road");
    expect(distanceLabel(2.31, true)).toBe("2.3 km away by road");
    expect(distanceLabel(0.05, true)).toBe("Under 100 m away");
    expect(distanceLabel(0.02)).toBe("Under 100 m away");
  });
});
