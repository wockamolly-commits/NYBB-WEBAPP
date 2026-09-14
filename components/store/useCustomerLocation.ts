"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LatLng } from "@/lib/branches/nearest";

/**
 * Where the customer is, if their browser will say, and only ever in their
 * browser.
 *
 * ASKED ON A TAP, UNLESS THEY HAVE ALREADY SAID YES.
 *
 * A location prompt the moment a page opens is the pattern browsers and
 * Lighthouse both flag, and it is refused more often than one the person asked
 * for, and a refusal is remembered: the page cannot ask again. So the prompt
 * waits for "Find my nearest counter". The exception is somebody who already
 * allowed location for this site on an earlier visit. The Permissions API
 * reports that without prompting, and for them the page locates straight away,
 * which is the automatic suggestion without the unrequested dialog.
 *
 * `checking` is the first render on both server and client, so hydration
 * agrees, and it is replaced within a tick of mounting.
 */
export type CustomerLocation =
  /** Not decided yet. Renders a reserved, empty slot. */
  | { status: "checking" }
  /** No geolocation in this browser. Nothing to offer. */
  | { status: "unsupported" }
  /** Can be asked. Waiting for the customer to press the button. */
  | { status: "idle" }
  | { status: "locating" }
  | { status: "located"; position: LatLng }
  /** Refused, now or on an earlier visit. The page may not ask again. */
  | { status: "denied" }
  /** Allowed, but no fix: timed out, or the device could not work it out. */
  | { status: "failed" };

const POSITION_OPTIONS: PositionOptions = {
  // A counter-sized answer does not need GPS, and asking for it costs a phone
  // several seconds and some battery for precision this page throws away.
  enableHighAccuracy: false,
  timeout: 10_000,
  // Somebody who opens the picker twice in five minutes has not moved far.
  maximumAge: 5 * 60_000,
};

export function useCustomerLocation(): {
  location: CustomerLocation;
  locate: () => void;
} {
  const [location, setLocation] = useState<CustomerLocation>({
    status: "checking",
  });
  const mounted = useRef(true);

  const locate = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLocation({ status: "unsupported" });
      return;
    }
    setLocation({ status: "locating" });
    navigator.geolocation.getCurrentPosition(
      (fix) => {
        if (!mounted.current) return;
        setLocation({
          status: "located",
          position: { lat: fix.coords.latitude, lng: fix.coords.longitude },
        });
      },
      (error) => {
        if (!mounted.current) return;
        setLocation({
          status: error.code === error.PERMISSION_DENIED ? "denied" : "failed",
        });
      },
      POSITION_OPTIONS,
    );
  }, []);

  useEffect(() => {
    mounted.current = true;

    // Resolved asynchronously even when the answer is immediate, so the state
    // change lands after the commit rather than inside the effect body.
    void (async () => {
      if (!navigator.geolocation) {
        if (mounted.current) setLocation({ status: "unsupported" });
        return;
      }

      let permission: PermissionState | null = null;
      try {
        // Older Safari has no Permissions API, or has it without the
        // geolocation name. Either way the answer is "ask on a tap".
        permission = (await navigator.permissions?.query({ name: "geolocation" }))?.state ?? null;
      } catch {
        permission = null;
      }
      if (!mounted.current) return;

      if (permission === "granted") locate();
      else if (permission === "denied") setLocation({ status: "denied" });
      else setLocation({ status: "idle" });
    })();

    return () => {
      mounted.current = false;
    };
  }, [locate]);

  return { location, locate };
}
