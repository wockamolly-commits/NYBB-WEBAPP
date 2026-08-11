"use client";

import type { CheckoutDetails, CheckoutField } from "@/lib/checkout/types";
import { cn } from "@/lib/utils";

/**
 * Who the order is for, and how to reach them if the kitchen has a question.
 *
 * Four fields, two of them optional, and that is the whole form. Every field on
 * a checkout screen is a chance to abandon it, and none of these can be
 * dropped: the counter needs a name to call out, and the kitchen needs a number
 * when the last order of Insane wings has just gone out.
 *
 * Nothing here validates. The Server Action parses the same four values and
 * `place_order` refuses what it will not take, so a rule written here as well
 * would be a second opinion that drifts. What this component owns is *saying*
 * which field was refused, which is a presentation job, and it says it in
 * words next to the field rather than only by turning a border red: colour on
 * its own is not an error message.
 */

export const DETAIL_FIELDS = ["name", "phone", "email"] as const;

export type DetailField = (typeof DETAIL_FIELDS)[number];

export function isDetailField(field: CheckoutField | null): field is DetailField {
  return field === "name" || field === "phone" || field === "email";
}

function fieldClasses(invalid: boolean) {
  return cn(
    // 16px type, deliberately. iOS Safari zooms the whole page in on any input
    // below it, and the customer then finishes checkout scrolled sideways.
    "mt-2 w-full rounded-md border bg-transparent px-3 py-2.5 text-base leading-normal",
    "text-nybb-bone placeholder:text-nybb-bone/35",
    "transition-[border-color] duration-200 ease-out",
    invalid
      ? "border-nybb-red"
      : "border-nybb-bone/25 hover:border-nybb-bone/45 focus:border-nybb-bone/60",
  );
}

export function CustomerDetails({
  details,
  onChange,
  error,
  disabled,
  paymentDescription,
}: {
  details: CheckoutDetails;
  onChange: (details: CheckoutDetails) => void;
  /** The last refusal, when it was about one of these fields. */
  error: { field: DetailField; message: string } | null;
  disabled: boolean;
  paymentDescription: string;
}) {
  function set<K extends keyof CheckoutDetails>(key: K, value: string) {
    onChange({ ...details, [key]: value });
  }

  function marks(field: DetailField) {
    const invalid = error?.field === field;
    return {
      className: fieldClasses(invalid),
      "aria-invalid": invalid || undefined,
      "aria-describedby": invalid ? `checkout-${field}-error` : undefined,
      disabled,
    };
  }

  function message(field: DetailField) {
    if (error?.field !== field) return null;
    return (
      // Bone letters, red rule. Signage red on charcoal measures 4.3:1, which
      // is under AA for body text, and the red is doing its job as a marker
      // rather than as the message.
      <p
        id={`checkout-${field}-error`}
        role="alert"
        className="border-nybb-red text-nybb-bone mt-2 border-l-2 pl-3 text-sm leading-relaxed"
      >
        {error.message}
      </p>
    );
  }

  return (
    <section aria-labelledby="your-details">
      <h2 id="your-details" className="font-display heading-panel">
        Your details
      </h2>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="checkout-name" className="type-caps text-nybb-bone/55">
            Name
          </label>
          <input
            id="checkout-name"
            name="name"
            type="text"
            autoComplete="name"
            enterKeyHint="next"
            maxLength={120}
            placeholder="The name we call out"
            value={details.name}
            onChange={(event) => set("name", event.target.value)}
            {...marks("name")}
          />
          {message("name")}
        </div>

        <div>
          <label htmlFor="checkout-phone" className="type-caps text-nybb-bone/55">
            Mobile number
          </label>
          <input
            id="checkout-phone"
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            enterKeyHint="next"
            maxLength={40}
            placeholder="0917 000 0000"
            value={details.phone}
            onChange={(event) => set("phone", event.target.value)}
            {...marks("phone")}
          />
          {message("phone")}
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="checkout-email" className="type-caps text-nybb-bone/55">
            Email
            <span className="text-nybb-bone/40 ml-2 tracking-[0.08em] normal-case">
              optional
            </span>
          </label>
          <input
            id="checkout-email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            maxLength={160}
            placeholder="For a copy of the order"
            value={details.email}
            onChange={(event) => set("email", event.target.value)}
            {...marks("email")}
          />
          {message("email")}
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="checkout-notes" className="type-caps text-nybb-bone/55">
            Anything the kitchen should know
            <span className="text-nybb-bone/40 ml-2 tracking-[0.08em] normal-case">
              optional
            </span>
          </label>
          <textarea
            id="checkout-notes"
            name="notes"
            rows={2}
            maxLength={500}
            placeholder="Allergies, a bigger group, where you will be parked"
            value={details.notes}
            onChange={(event) => set("notes", event.target.value)}
            className={fieldClasses(false)}
            disabled={disabled}
          />
        </div>
      </div>

      {/* A database flag selects the one live rail. There is no payment choice
          until more than one approved method is actually offered. */}
      <p className="border-nybb-bone/15 mt-6 border-t pt-4">
        <span className="type-caps text-nybb-bone/55 block">Payment</span>
        <span className="text-nybb-bone/80 mt-1 block text-sm leading-relaxed">
          {paymentDescription}
        </span>
      </p>
    </section>
  );
}
