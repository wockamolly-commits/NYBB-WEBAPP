import type { Metadata, Viewport } from "next";
import { Anton, Inter, JetBrains_Mono } from "next/font/google";
import { siteUrl } from "@/lib/site-url";
import "./globals.css";

const anton = Anton({
  variable: "--font-anton",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: {
    default: "New York Buffalo Brad's Hot Wings",
    template: "%s · NY Buffalo Brad's",
  },
  description:
    "Order your wings ahead and skip the queue. Pick a time, pay how you like, collect at the counter.",
  openGraph: {
    title: "New York Buffalo Brad's Hot Wings",
    description:
      "Order your wings ahead and skip the queue. Cebu City.",
    type: "website",
    locale: "en_PH",
  },
  // A referrer policy of "no-referrer" makes POSTs send `Origin: null`, which
  // breaks every Server Action with a 403. Keep this at same-origin.
  referrer: "same-origin",
  appleWebApp: {
    capable: true,
    title: "NYBB Order",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#0b0b0c",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // The font variables belong on <html>, not on <body>. globals.css applies
    // font-sans to the html element itself, and a custom property defined on
    // body is not in scope for its own parent: --font-inter resolved to nothing
    // there and every paragraph on the site silently fell back to a serif.
    <html
      lang="en-PH"
      className={`${anton.variable} ${inter.variable} ${jetbrainsMono.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
