import { useCallback, useEffect, useRef, useState } from "react";
import { refreshSession, requestSignInCode, verifySignInCode } from "../api/client";
import type { MobileError, MobileSession } from "../api/contract";
import {
  clearSession,
  loadSession,
  saveSession,
  sessionNeedsRefresh,
} from "./store";

/**
 * Who is signed in, and the one way to get a usable access token.
 *
 * WHY NOTHING OUTSIDE THIS HOOK READS `session.accessToken`.
 * ================================================================
 * Because a token read straight off state is a token that may already have
 * expired, and the request carrying it fails at the server with a 401 that looks
 * to the customer like being signed out. `accessToken()` is async for that
 * reason: it is the only accessor, and it refreshes first when the stored token
 * is inside its expiry margin. Reaching past it to the state field is how an app
 * gets an intermittent, unreproducible sign-out bug.
 *
 * WHY ONE REFRESH AT A TIME.
 * ================================================================
 * Supabase rotates the refresh token on every use, so two concurrent refreshes
 * race: the second presents a token the first has already spent and is refused,
 * and the app signs a customer out in the middle of paying. The in-flight
 * promise is shared, so a screen loading an order while another refreshes makes
 * one network call and both get the same answer.
 */

export type SignInStep = "email" | "code";

export type CustomerSessionState = {
  /** Null while the stored session is still being read on launch. */
  session: MobileSession | null;
  restoring: boolean;
  signInStep: SignInStep;
  signInEmail: string;
  signInCode: string;
  signInBusy: boolean;
  signInError: MobileError | null;
  signInNotice: string | null;
  resendAvailableAt: number | null;
};

export function useCustomerSession() {
  const [session, setSession] = useState<MobileSession | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [signInStep, setSignInStep] = useState<SignInStep>("email");
  const [signInEmail, setSignInEmail] = useState("");
  const [signInCode, setSignInCode] = useState("");
  const [signInBusy, setSignInBusy] = useState(false);
  const [signInError, setSignInError] = useState<MobileError | null>(null);
  const [signInNotice, setSignInNotice] = useState<string | null>(null);
  const [resendAvailableAt, setResendAvailableAt] = useState<number | null>(null);

  // The live session, readable from a callback that was created before the last
  // render. State alone would hand `accessToken()` a stale closure.
  const sessionRef = useRef<MobileSession | null>(null);
  const refreshInFlight = useRef<Promise<MobileSession | null> | null>(null);

  const store = useCallback((next: MobileSession | null) => {
    sessionRef.current = next;
    setSession(next);
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const stored = await loadSession();
      if (cancelled) return;
      if (stored) store(stored);
      setRestoring(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [store]);

  /** Signs out locally. See the note in `signOut` about what this does not do. */
  const forget = useCallback(async () => {
    store(null);
    refreshInFlight.current = null;
    await clearSession();
  }, [store]);

  const runRefresh = useCallback(
    async (current: MobileSession): Promise<MobileSession | null> => {
      const result = await refreshSession(current.refreshToken);

      if (result.ok) {
        store(result.data);
        await saveSession(result.data);
        return result.data;
      }

      // `unauthorized` is the refresh token being finished, which is the only
      // case that should sign somebody out. An outage or a dead connection says
      // nothing about the credential, so the session stays and the caller
      // proceeds as a guest for this one request rather than losing its account.
      if (result.error.code === "unauthorized") {
        await forget();
        return null;
      }

      return null;
    },
    [forget, store],
  );

  /**
   * A usable access token, or null when there is no signed-in customer.
   *
   * Null is not an error. Most customers most of the time are guests, and every
   * read this app performs works for one.
   */
  const accessToken = useCallback(async (): Promise<string | null> => {
    const current = sessionRef.current;
    if (!current) return null;
    if (!sessionNeedsRefresh(current)) return current.accessToken;

    if (!refreshInFlight.current) {
      refreshInFlight.current = runRefresh(current).finally(() => {
        refreshInFlight.current = null;
      });
    }

    const refreshed = await refreshInFlight.current;
    return refreshed?.accessToken ?? null;
  }, [runRefresh]);

  const openSignIn = useCallback(() => {
    setSignInStep("email");
    setSignInCode("");
    setSignInError(null);
    setSignInNotice(null);
    setResendAvailableAt(null);
  }, []);

  const requestCode = useCallback(async () => {
    setSignInBusy(true);
    setSignInError(null);

    const result = await requestSignInCode(signInEmail.trim());
    setSignInBusy(false);

    if (!result.ok) {
      setSignInError(result.error);
      return;
    }

    setSignInNotice(
      signInStep === "code"
        ? "A fresh code is on its way."
        : "Check your email for the six-digit code.",
    );
    setSignInStep("code");
    setSignInCode("");
    setResendAvailableAt(result.data.resendAvailableAt);
  }, [signInEmail, signInStep]);

  const verifyCode = useCallback(async () => {
    setSignInBusy(true);
    setSignInError(null);
    setSignInNotice(null);

    const result = await verifySignInCode(signInEmail.trim(), signInCode);
    setSignInBusy(false);

    if (!result.ok) {
      setSignInError(result.error);
      return false;
    }

    store(result.data);
    await saveSession(result.data);
    setSignInCode("");
    setResendAvailableAt(null);
    return true;
  }, [signInCode, signInEmail, store]);

  const useAnotherAddress = useCallback(() => {
    setSignInStep("email");
    setSignInCode("");
    setSignInError(null);
    setSignInNotice(null);
    setResendAvailableAt(null);
  }, []);

  /**
   * Signs out on this device.
   *
   * WHAT THIS DOES NOT DO, STATED PLAINLY.
   * ================================================================
   * It does not revoke the refresh token at Supabase. The token is deleted from
   * this device's keychain, so it is gone from the only place it was stored, but
   * a copy captured beforehand would keep working until it expires or is
   * rotated. Closing that needs a server-side revoke endpoint, which is a
   * separate slice; it is written down here rather than left for somebody to
   * assume either way.
   */
  const signOut = useCallback(async () => {
    await forget();
    setSignInStep("email");
    setSignInCode("");
    setSignInError(null);
    setSignInNotice(null);
    setResendAvailableAt(null);
  }, [forget]);

  return {
    session,
    restoring,
    accessToken,
    signInStep,
    signInEmail,
    signInCode,
    signInBusy,
    signInError,
    signInNotice,
    resendAvailableAt,
    setSignInEmail,
    setSignInCode,
    openSignIn,
    requestCode,
    verifyCode,
    useAnotherAddress,
    signOut,
  };
}
