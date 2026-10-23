import { describe, expect, it } from "vitest";
import {
  PENDING_PROMO_KEY,
  readPendingPromo,
  rememberPendingPromo,
} from "@/lib/promos/pending";

/** A Storage stand in. Only the three methods the module calls. */
function memory(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  } as unknown as Storage;
}

function throwing(): Storage {
  const fail = () => {
    throw new Error("SecurityError");
  };
  return { getItem: fail, setItem: fail, removeItem: fail } as unknown as Storage;
}

describe("pending promo", () => {
  it("remembers a code and reads it back normalised", () => {
    const store = memory();
    rememberPendingPromo(" testing50 ", store);
    expect(readPendingPromo(store)).toBe("TESTING50");
  });

  it("forgets the code when given null", () => {
    const store = memory();
    rememberPendingPromo("TESTING50", store);
    rememberPendingPromo(null, store);
    expect(readPendingPromo(store)).toBeNull();
  });

  it("refuses anything that could not be a code", () => {
    const store = memory();
    store.setItem(PENDING_PROMO_KEY, "TWO WORDS");
    expect(readPendingPromo(store)).toBeNull();
    store.setItem(PENDING_PROMO_KEY, "X".repeat(41));
    expect(readPendingPromo(store)).toBeNull();
    store.setItem(PENDING_PROMO_KEY, "   ");
    expect(readPendingPromo(store)).toBeNull();
  });

  it("survives a store that throws from its own methods", () => {
    expect(() => rememberPendingPromo("TESTING50", throwing())).not.toThrow();
    expect(readPendingPromo(throwing())).toBeNull();
  });
});
