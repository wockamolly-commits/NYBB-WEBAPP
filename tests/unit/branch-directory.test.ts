import { describe, expect, it } from "vitest";
import { withDirectory, type DirectoryBranch } from "@/lib/branches/directory";
import type { Branch } from "@/lib/catalog/types";

const catalog: Branch[] = [
  {
    slug: "shell-gorordo",
    name: "NYBB Hot Wings, Shell Gorordo",
    shortName: "Shell Gorordo",
    addressLine: "839 Gorordo Avenue",
    city: "Cebu City",
    phones: ["0917-114-1392"],
    format: "petrol",
    pin: { lat: 10.3203694, lng: 123.8994126 },
  },
  {
    slug: "shell-naga",
    name: "NYBB Hot Wings, Shell Mobility Naga",
    shortName: "Shell Naga",
    addressLine: "Uling Road",
    city: "Naga, Cebu",
    phones: ["0946-352-0538"],
    format: "petrol",
  },
];

function row(overrides: Partial<DirectoryBranch> = {}): DirectoryBranch {
  return {
    slug: "shell-gorordo",
    name: "NYBB Hot Wings, Shell Gorordo",
    shortName: "Shell Gorordo",
    format: "petrol",
    addressLine: "839 Gorordo Avenue",
    city: "Cebu City",
    phones: [],
    pin: null,
    ...overrides,
  };
}

describe("withDirectory", () => {
  it("returns the catalog unchanged when the directory read gave nothing", () => {
    expect(withDirectory(catalog, [])).toEqual(catalog);
  });

  it("appends a branch the catalog does not know, switched on or not", () => {
    const added = row({ slug: "ayala-center", shortName: "Ayala Center", format: "mall", phones: ["0917"] });
    const branches = withDirectory(catalog, [row(), added]);
    expect(branches.map((branch) => branch.slug)).toEqual(["shell-gorordo", "shell-naga", "ayala-center"]);
    expect(branches[2]).not.toHaveProperty("pin");
    expect(branches[2]!.phones).toEqual(["0917"]);
  });

  it("takes every published detail from the database, keeping the catalog's photograph", () => {
    const withImage: Branch[] = [{ ...catalog[0]!, imageKey: "branch-gorordo" }];
    const [gorordo] = withDirectory(withImage, [
      row({ name: "Renamed", shortName: "Gorordo", addressLine: "840 Gorordo Avenue", phones: [] }),
    ]);
    expect(gorordo).toMatchObject({
      name: "Renamed",
      shortName: "Gorordo",
      addressLine: "840 Gorordo Avenue",
      phones: [],
      imageKey: "branch-gorordo",
    });
  });

  it("lays a workspace pin over the catalog's, and keeps the catalog's when there is none", () => {
    const pin = { lat: 10.33, lng: 123.91 };
    const [gorordo, naga] = withDirectory(catalog, [row({ pin }), row({ slug: "shell-naga", name: catalog[1]!.name, shortName: "Shell Naga", addressLine: "Uling Road", city: "Naga, Cebu", phones: ["0946-352-0538"] })]);
    expect(gorordo!.pin).toEqual(pin);
    expect(naga).toEqual(catalog[1]);

    const [unpinned] = withDirectory(catalog, [row()]);
    expect(unpinned!.pin).toEqual(catalog[0]!.pin);
  });

  it("gives an added branch its own pin", () => {
    const pin = { lat: 10.31, lng: 123.9 };
    const branches = withDirectory(catalog, [row({ slug: "new-site", pin })]);
    expect(branches[2]!.pin).toEqual(pin);
  });
});
