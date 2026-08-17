"use client";

import { LoaderCircle, Save } from "lucide-react";
import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import type { CustomerProfile } from "@/lib/auth/session";
import type { AccountFormState } from "@/lib/auth/types";
import { updateCustomerProfile } from "./actions";

const INITIAL: AccountFormState = { status: "idle" };

export function AccountProfileForm({ profile }: { profile: CustomerProfile }) {
  const [state, action, pending] = useActionState(updateCustomerProfile, INITIAL);

  return (
    <form action={action} className="mt-6 space-y-4">
      <div>
        <label htmlFor="account-name" className="type-caps text-nybb-bone/55">
          Pickup name
        </label>
        <input
          id="account-name"
          name="displayName"
          type="text"
          autoComplete="name"
          maxLength={120}
          defaultValue={profile.displayName}
          className="border-nybb-bone/40 text-nybb-bone caret-nybb-orange mt-2 h-12 w-full rounded-md border bg-transparent px-3 text-base outline-none transition-colors focus:border-nybb-bone"
        />
      </div>
      <div>
        <label htmlFor="account-phone" className="type-caps text-nybb-bone/55">
          Mobile number
        </label>
        <input
          id="account-phone"
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          maxLength={40}
          defaultValue={profile.phone}
          className="border-nybb-bone/40 text-nybb-bone caret-nybb-orange mt-2 h-12 w-full rounded-md border bg-transparent px-3 text-base outline-none transition-colors focus:border-nybb-bone"
        />
      </div>

      {state.message ? (
        <p
          role={state.status === "error" ? "alert" : "status"}
          className={
            state.status === "error"
              ? "border-nybb-red-deep bg-nybb-red-deep/15 rounded-md border px-3 py-2 text-sm"
              : "text-nybb-bone/70 text-sm"
          }
        >
          {state.message}
        </p>
      ) : null}

      <Button
        type="submit"
        tone="dark"
        block
        disabled={pending}
        aria-busy={pending || undefined}
      >
        {pending ? (
          <LoaderCircle aria-hidden className="size-4 animate-spin motion-reduce:animate-none" />
        ) : (
          <Save aria-hidden className="size-4" />
        )}
        {pending ? "Saving details" : "Save pickup details"}
      </Button>
    </form>
  );
}
