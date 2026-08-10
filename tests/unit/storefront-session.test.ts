import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@supabase/supabase-js";

const mocks = vi.hoisted(() => ({
  customerGetUser: vi.fn(),
  staffGetUser: vi.fn(),
}));

const customerClient = {
  auth: { getUser: mocks.customerGetUser },
};
const staffClient = {
  auth: { getUser: mocks.staffGetUser },
};

vi.mock("@/lib/supabase/server", () => ({
  supabaseConfigured: () => true,
  createReadOnlyCustomerClient: async () => customerClient,
  createReadOnlyStaffClient: async () => staffClient,
}));

import { readStorefrontSession } from "@/lib/auth/session";

function user(id: string): User {
  return { id, email: `${id}@example.com` } as User;
}

describe("Storefront session selection", () => {
  beforeEach(() => {
    mocks.customerGetUser.mockReset();
    mocks.staffGetUser.mockReset();
  });

  it("prefers the customer cookie when both surfaces are signed in", async () => {
    const customer = user("customer");
    mocks.customerGetUser.mockResolvedValue({ data: { user: customer } });

    const session = await readStorefrontSession();

    expect(session?.user).toBe(customer);
    expect(session?.source).toBe("customer");
    expect(mocks.staffGetUser).not.toHaveBeenCalled();
  });

  it("keeps a Workspace-only account signed in on the Storefront", async () => {
    const staff = user("staff");
    mocks.customerGetUser.mockResolvedValue({ data: { user: null } });
    mocks.staffGetUser.mockResolvedValue({ data: { user: staff } });

    const session = await readStorefrontSession();

    expect(session?.user).toBe(staff);
    expect(session?.source).toBe("staff");
  });

  it("stays signed out when neither cookie contains a session", async () => {
    mocks.customerGetUser.mockResolvedValue({ data: { user: null } });
    mocks.staffGetUser.mockResolvedValue({ data: { user: null } });

    await expect(readStorefrontSession()).resolves.toBeNull();
  });
});
