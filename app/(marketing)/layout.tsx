import { StorefrontChrome } from "@/components/site/StorefrontChrome";
import { getTheme } from "@/lib/themes/read";

/**
 * The public storefront, in the live seasonal theme. Everything it renders is
 * in components/site/StorefrontChrome.tsx; see the note there.
 */
export default async function StorefrontLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const theme = await getTheme();
  return <StorefrontChrome theme={theme}>{children}</StorefrontChrome>;
}
