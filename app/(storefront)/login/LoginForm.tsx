"use client";

import { KeyRound, LoaderCircle, Mail, RefreshCw } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import type { LoginState, VerifyOtpState } from "@/lib/auth/types";
import { requestOtp, verifyOtp } from "./actions";

const INITIAL_LOGIN: LoginState = { status: "idle" };
const INITIAL_VERIFY: VerifyOtpState = { status: "idle" };

function remainingLabel(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

export function LoginForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "";
  const [login, loginAction, loginPending] = useActionState(requestOtp, INITIAL_LOGIN);
  const [verify, verifyAction, verifyPending] = useActionState(verifyOtp, INITIAL_VERIFY);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const expiresIn = Math.max(0, Math.ceil(((login.expiresAt ?? now) - now) / 1000));
  const resendIn = Math.max(
    0,
    Math.ceil(((login.resendAvailableAt ?? now) - now) / 1000),
  );

  if (login.status === "sent" && login.email) {
    return (
      <div className="mt-8 space-y-6">
        <div className="border-nybb-bone/20 bg-nybb-bone/7 rounded-md border p-4">
          <p className="font-display text-xl">Check your email</p>
          <p className="text-nybb-bone/65 mt-2 text-sm leading-relaxed">
            We sent a six-digit code to <span className="text-nybb-bone">{login.email}</span>.
            Use the latest code if more than one arrives.
          </p>
        </div>

        <form action={verifyAction} className="space-y-4">
          <input type="hidden" name="email" value={login.email} />
          <input type="hidden" name="next" value={next} />
          <div>
            <label htmlFor="otp-code" className="type-caps text-nybb-bone/60">
              Sign-in code
            </label>
            <input
              id="otp-code"
              name="token"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              minLength={6}
              maxLength={6}
              required
              autoFocus
              aria-describedby="otp-expiry"
              className="border-nybb-bone/40 text-nybb-bone caret-nybb-orange mt-2 h-16 w-full rounded-md border bg-transparent px-4 text-center font-mono text-3xl tracking-[0.35em] outline-none transition-colors focus:border-nybb-bone"
            />
            <p id="otp-expiry" className="text-nybb-bone/50 mt-2 font-mono text-xs">
              {expiresIn > 0 ? `Expires in ${remainingLabel(expiresIn)}` : "This code has expired"}
            </p>
          </div>

          {verify.status === "error" ? (
            <p role="alert" className="border-nybb-red-deep bg-nybb-red-deep/15 rounded-md border px-3 py-2 text-sm">
              {verify.message}
            </p>
          ) : null}
          {login.message ? (
            <p role="status" className="text-nybb-bone/70 text-sm">{login.message}</p>
          ) : null}

          <Button
            type="submit"
            tone="dark"
            block
            size="lg"
            disabled={verifyPending || expiresIn === 0}
            aria-busy={verifyPending || undefined}
          >
            {verifyPending ? (
              <LoaderCircle aria-hidden className="size-4 animate-spin motion-reduce:animate-none" />
            ) : (
              <KeyRound aria-hidden className="size-4" />
            )}
            {verifyPending ? "Checking code" : "Sign in"}
          </Button>
        </form>

        <div className="grid gap-2 sm:grid-cols-2">
          <form action={loginAction}>
            <input type="hidden" name="email" value={login.email} />
            <input type="hidden" name="next" value={next} />
            <Button
              type="submit"
              tone="dark"
              variant="secondary"
              block
              disabled={loginPending || resendIn > 0}
              aria-busy={loginPending || undefined}
            >
              {loginPending ? (
                <LoaderCircle aria-hidden className="size-4 animate-spin motion-reduce:animate-none" />
              ) : (
                <RefreshCw aria-hidden className="size-4" />
              )}
              {loginPending
                ? "Sending code"
                : resendIn > 0
                  ? `Resend in ${resendIn}s`
                  : "Resend code"}
            </Button>
          </form>
          <Button
            tone="dark"
            variant="ghost"
            block
            onClick={() => window.location.reload()}
          >
            Use another email
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form action={loginAction} className="mt-8 space-y-5">
      <input type="hidden" name="next" value={next} />
      <div>
        <label htmlFor="login-email" className="type-caps text-nybb-bone/60">
          Email address
        </label>
        <span className="relative mt-2 block">
          <Mail
            aria-hidden
            className="text-nybb-orange pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2"
          />
          <input
            id="login-email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            defaultValue={login.email}
            placeholder="you@email.com"
            className="border-nybb-bone/40 text-nybb-bone placeholder:text-nybb-bone/50 caret-nybb-orange h-12 w-full rounded-md border bg-transparent pr-4 pl-12 text-base outline-none transition-colors focus:border-nybb-bone"
          />
        </span>
      </div>

      {login.status === "error" ? (
        <p role="alert" className="border-nybb-red-deep bg-nybb-red-deep/15 rounded-md border px-3 py-2 text-sm">
          {login.message}
        </p>
      ) : null}

      <Button
        type="submit"
        tone="dark"
        block
        size="lg"
        disabled={loginPending}
        aria-busy={loginPending || undefined}
      >
        {loginPending ? (
          <LoaderCircle aria-hidden className="size-4 animate-spin motion-reduce:animate-none" />
        ) : (
          <KeyRound aria-hidden className="size-4" />
        )}
        {loginPending ? "Sending code" : "Email me a sign-in code"}
      </Button>
      <p className="text-nybb-bone/55 text-center text-xs leading-relaxed">
        No password. The code expires after ten minutes.
      </p>
    </form>
  );
}
