"use client";

import { LogOut } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";

/**
 * Signing out, with one question in the way.
 *
 * WHY A DESTRUCTIVE-FEELING CONFIRM ON A MERELY-ANNOYING ACTION.
 * ================================================================
 * Getting back in is not a password: it is a six-digit code emailed to the
 * person whose account the counter tablet is signed into. On a shift that
 * means finding them, finding their phone, and reading a code across a room
 * while orders queue. The tap that starts all of that used to be a 44px icon
 * in the top-right corner of a tablet held in two hands, with nothing between
 * it and the door.
 *
 * So the icon now asks. The confirm closes on Escape and on a click elsewhere,
 * which are the two things a person does when they did not mean to open it.
 */
export function WorkspaceSignOut({ withLabel = false }: { withLabel?: boolean } = {}) {
  const [confirming, setConfirming] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!confirming) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setConfirming(false);
        trigger.current?.focus();
      }
    }
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (panel.current?.contains(target) || trigger.current?.contains(target)) return;
      setConfirming(false);
    }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [confirming]);

  return (
    <div className="relative shrink-0">
      {/*
        An unlabelled icon is legible as chrome in the corner of a header. On a
        page of its own it is a floating glyph, so the same control says what it
        is when it is placed in the content.
      */}
      <Button
        ref={trigger}
        type="button"
        tone="dark"
        variant={withLabel ? "secondary" : "ghost"}
        size={withLabel ? "default" : "icon"}
        className={withLabel ? undefined : "size-11"}
        aria-label={withLabel ? undefined : "Sign out of staff workspace"}
        aria-expanded={confirming}
        onClick={() => setConfirming((open) => !open)}
      >
        <LogOut aria-hidden className="size-4" />
        {withLabel ? "Sign out" : null}
      </Button>

      {confirming ? (
        <div
          ref={panel}
          role="dialog"
          aria-label="Confirm sign out"
          className="border-nybb-bone/40 bg-nybb-charcoal absolute top-full right-0 z-50 mt-2 w-72 rounded-md border p-4 shadow-lg"
        >
          <p className="text-sm leading-relaxed">
            Sign out of the Workspace? Getting back in needs a code emailed to this account.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <form action="/auth/signout?scope=staff" method="post">
              <Button type="submit" tone="dark" variant="danger">
                <LogOut aria-hidden className="size-4" />
                Sign out
              </Button>
            </form>
            <Button
              type="button"
              tone="dark"
              variant="ghost"
              autoFocus
              onClick={() => {
                setConfirming(false);
                trigger.current?.focus();
              }}
            >
              Stay signed in
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
