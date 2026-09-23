import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { LoginForm } from "./LoginForm";
import { getCurrentCustomer } from "@/lib/auth/session";
import {
  requestedStaffNextPath,
  safeCustomerNextPath,
} from "@/lib/auth/redirect";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to keep your pickup orders and details together.",
  robots: { index: false, follow: false },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : null;
  if (await getCurrentCustomer()) {
    const workspaceNext = requestedStaffNextPath(next);
    if (workspaceNext) {
      redirect(`/auth/workspace?next=${encodeURIComponent(workspaceNext)}`);
    }
    redirect(safeCustomerNextPath(next));
  }

  return (
    /* The same dark band material the landing page's heat scale and
       counters sit on. See .band-ink in globals.css: Char, the printed
       tooth in the bare margins, and the grain that dithers it. The
       hatching's mask is written in the container's own units, so the
       `max-w-6xl` column below is the protected zone here exactly as it
       is there, and nothing at full weight can reach the form.

       The dot screen comes with it, in the flat tint shape rather than
       the ring shape. No `band-lit`: a warm field is spill light, The
       Lit Thing Lights Its Ground Rule anchors one on whatever in the
       band is burning, and nothing on this page is. See
       .band-screen-signin in globals.css for why the screen can travel
       here without it. */
    <section className="band-ink text-nybb-bone">
      <div aria-hidden="true" className="band-screen band-screen-signin" />

      <div className="relative z-10 mx-auto grid min-h-[calc(100svh-75px)] max-w-6xl items-center gap-10 px-4 py-12 sm:min-h-[calc(100svh-91px)] sm:px-6 lg:grid-cols-[1fr_28rem] lg:py-20">
        <div className="max-w-2xl">
          <h1 className="font-display heading-page text-balance">Your order stays with you</h1>
          <p className="text-nybb-bone/65 mt-5 max-w-xl text-base leading-relaxed sm:text-lg">
            Sign in once to keep pickup details ready, carry your cart between devices, and open
            every order from one place.
          </p>
        </div>

        <div className="border-nybb-bone/20 bg-nybb-graphite rounded-md border p-5 sm:p-7">
          <h2 className="font-display heading-minor">Sign in by email</h2>
          <p className="text-nybb-bone/60 mt-3 text-sm leading-relaxed">
            We will send a six-digit code. New email addresses create an account automatically.
          </p>
          <Suspense fallback={null}>
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </section>
  );
}
