import { getPageContent } from "@/lib/content/read";
import { HomeView } from "./HomeView";

/**
 * The landing page. Its words are edited from /workspace/content; the page
 * itself, and the long account of why it is built the way it is, are in
 * HomeView.tsx.
 */
export default async function Home() {
  return <HomeView content={await getPageContent("home")} />;
}
