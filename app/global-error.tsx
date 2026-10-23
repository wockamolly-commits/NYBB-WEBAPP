"use client";

import "./globals.css";

/**
 * The last resort, for a failure in app/layout.tsx itself.
 *
 * Every other error is caught lower down, by app/(marketing)/error.tsx or the
 * workspace's own, where the header and nav survive. This one replaces the
 * root layout, so it brings its own <html> and <body> and assumes nothing the
 * layout would have provided: no fonts, no header, no data. Plain links rather
 * than the site's components, because whatever broke the layout may be what
 * those components depend on.
 */
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <html lang="en-PH">
      <body className="flex min-h-dvh items-center justify-center px-4">
        <title>Something went wrong · NY Buffalo Brad&apos;s</title>
        <main role="alert" className="max-w-md py-16 text-center">
          <h1 className="text-3xl font-bold">This page did not load</h1>
          <p className="mt-4 leading-relaxed opacity-80">
            Something went wrong on our side. Try again in a moment.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <button
              type="button"
              onClick={() => unstable_retry()}
              className="rounded-full border px-5 py-2 font-medium"
            >
              Try again
            </button>
            {/* A full page load on purpose: the client router is part of what failed. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/menu" className="rounded-full border px-5 py-2 font-medium">
              See the menu
            </a>
          </div>
          {error.digest ? (
            <p className="mt-8 font-mono text-xs opacity-70">Reference {error.digest}</p>
          ) : null}
        </main>
      </body>
    </html>
  );
}
