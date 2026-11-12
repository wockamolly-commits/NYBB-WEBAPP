import Image from "next/image";
import seal from "./npc-dpo-dps-seal.png";

/**
 * The National Privacy Commission's "DPO/DPS Registered" seal, with its
 * background removed so it sits on the page ground.
 *
 * To swap in a renewed seal, see `npcSeal` in lib/legal/details.ts: replace
 * the image file beside this component and update the date there.
 *
 * Always rendered. It used to disappear the day after `npcSeal.validThrough`,
 * and the owner chose on 2026-11-12 to show it regardless, while the printed
 * validity (28 October 2026) had already passed. `isSealCurrent` is kept for
 * reinstating that check.
 *
 * The seal carries its own QR code, which the NPC uses to verify it, so it is
 * shown at a size a phone camera can still read from the screen.
 */
export function NpcSeal() {
  return (
    <figure className="mt-6 w-40 sm:w-48">
      <Image
        src={seal}
        alt="National Privacy Commission seal: DPO/DPS Registered. Data Protection Officer and Data Processing System registered."
        sizes="(min-width: 640px) 192px, 160px"
        className="h-auto w-full"
      />
    </figure>
  );
}
