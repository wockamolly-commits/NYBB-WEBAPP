"use client";

import { LoaderCircle, Send } from "lucide-react";
import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import {
  HONEYPOT_FIELD,
  type FranchiseInquiryState,
} from "@/lib/franchise/inquiry";
import { submitFranchiseInquiry } from "./actions";

const INITIAL: FranchiseInquiryState = { status: "idle" };

const fieldClass =
  "border-nybb-bone/40 text-nybb-bone caret-nybb-orange mt-2 w-full rounded-md border bg-transparent px-4 py-3 text-base outline-none transition-colors focus:border-nybb-bone";

export function InquiryForm() {
  const [state, formAction, pending] = useActionState(submitFranchiseInquiry, INITIAL);

  if (state.status === "sent") {
    return (
      <div
        role="status"
        className="border-nybb-bone/20 bg-nybb-bone/7 rounded-md border p-6"
      >
        <p className="font-display heading-minor">Thank you, we have it.</p>
        <p className="text-nybb-bone/65 mt-3 text-sm leading-relaxed">
          Someone from Five Brad Dragons Food Franchise Corporation will be in touch. If you
          would rather speak to a person now, call (032) 520-4930 or email{" "}
          <span className="text-nybb-bone">franchise@5bdf.ph</span>.
        </p>
      </div>
    );
  }

  const values = state.status === "error" ? (state.values ?? {}) : {};

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {/*
        The honeypot. Hidden from sight, from screen readers, and from tab
        order, so nobody using the page can fill it by accident. Not
        `type="hidden"`, because a bot skips those and fills visible-in-the-DOM
        text inputs.
      */}
      <div aria-hidden="true" className="hidden">
        <label htmlFor="company-website">Company website</label>
        <input
          id="company-website"
          name={HONEYPOT_FIELD}
          type="text"
          tabIndex={-1}
          autoComplete="off"
        />
      </div>

      <div>
        <label htmlFor="inquiry-name" className="type-caps text-nybb-bone/60">
          Your name
        </label>
        <input
          id="inquiry-name"
          name="name"
          type="text"
          required
          maxLength={120}
          autoComplete="name"
          defaultValue={values.name}
          className={fieldClass}
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="inquiry-email" className="type-caps text-nybb-bone/60">
            Email
          </label>
          <input
            id="inquiry-email"
            name="email"
            type="email"
            required
            maxLength={254}
            autoComplete="email"
            defaultValue={values.email}
            className={fieldClass}
          />
        </div>

        <div>
          <label htmlFor="inquiry-phone" className="type-caps text-nybb-bone/60">
            Phone
          </label>
          <input
            id="inquiry-phone"
            name="phone"
            type="tel"
            required
            maxLength={40}
            autoComplete="tel"
            defaultValue={values.phone}
            className={fieldClass}
          />
        </div>
      </div>

      <div>
        <label htmlFor="inquiry-city" className="type-caps text-nybb-bone/60">
          Where are you looking to open?
          <span className="text-nybb-bone/40"> (optional)</span>
        </label>
        <input
          id="inquiry-city"
          name="city"
          type="text"
          maxLength={160}
          defaultValue={values.city}
          placeholder="A city, a mall, or still deciding"
          className={fieldClass}
        />
      </div>

      <div>
        <label htmlFor="inquiry-message" className="type-caps text-nybb-bone/60">
          Anything you want us to know?
          <span className="text-nybb-bone/40"> (optional)</span>
        </label>
        <textarea
          id="inquiry-message"
          name="message"
          rows={5}
          maxLength={4000}
          defaultValue={values.message}
          className={`${fieldClass} resize-y`}
        />
      </div>

      {state.status === "error" ? (
        <p
          role="alert"
          className="border-nybb-red-deep bg-nybb-red-deep/15 rounded-md border px-3 py-2 text-sm"
        >
          {state.message}
        </p>
      ) : null}

      <Button type="submit" disabled={pending} className="w-full sm:w-auto">
        {pending ? (
          <>
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            Sending
          </>
        ) : (
          <>
            <Send className="size-4" aria-hidden="true" />
            Send inquiry
          </>
        )}
      </Button>

      <p className="text-nybb-bone/50 text-xs leading-relaxed">
        We use these details to answer your inquiry. We do not sell them, and we do not add you
        to a mailing list.
      </p>
    </form>
  );
}
