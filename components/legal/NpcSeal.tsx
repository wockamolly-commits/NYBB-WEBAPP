import Image from "next/image";
import { isSealCurrent, npcSeal } from "@/lib/legal/details";
import seal from "./npc-dpo-dps-seal.jpg";

/**
 * The National Privacy Commission's "DPO/DPS Registered" seal.
 *
 * To swap in a renewed seal, see `npcSeal` in lib/legal/details.ts: replace
 * the image file beside this component and update the date there. Past that
 * date the seal is not rendered at all.
 *
 * The seal carries its own QR code, which the NPC uses to verify it, so it is
 * shown at a size a phone camera can still read from the screen.
 */
export function NpcSeal() {
  if (!isSealCurrent(npcSeal.validThrough, new Date())) return null;

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
