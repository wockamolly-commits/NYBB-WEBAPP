import type { Metadata } from "next";
import { getPageContent } from "@/lib/content/read";
import { AboutView } from "./AboutView";

export const metadata: Metadata = {
  title: "About",
  description:
    "New York Buffalo Brad's Hot Wings: ten flavours, five levels of heat, and counters across Cebu.",
};

/** The words are edited from /workspace/content; see AboutView for the page. */
export default async function AboutPage() {
  return <AboutView content={await getPageContent("about")} />;
}
