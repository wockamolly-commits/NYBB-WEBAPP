import type { ContentReadError } from "@/lib/content/admin";

export function manilaDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  });
}

export function readErrorMessage(error: ContentReadError): string {
  if (error === "missing") {
    return "Website content is not set up on this database yet. Migration 0108 needs to be applied first.";
  }
  if (error === "forbidden") return "You do not have access to edit the website's content.";
  return "This could not be loaded just now. Reload to try again.";
}
