import * as Sentry from "@sentry/nextjs";

/**
 * Reports an error caught by one of the error.tsx screens.
 *
 * A server failure reaches the browser carrying a `digest` and a generic
 * message, and onRequestError in instrumentation.ts has already sent the real
 * error from the server. Reporting it again here would file every server error
 * twice, the second copy with no stack worth reading. So only errors without a
 * digest, the ones thrown in the browser itself, are sent from here.
 */
export function reportBoundaryError(error: Error & { digest?: string }): void {
  if (error.digest) return;
  Sentry.captureException(error);
}
