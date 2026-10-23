import type { Breadcrumb, ErrorEvent } from "@sentry/nextjs";

/**
 * Settings shared by the three places Sentry starts: the browser
 * (instrumentation-client.ts), the Node server and the edge runtime
 * (sentry.server.config.ts, sentry.edge.config.ts).
 *
 * Flag gated like every other integration here: no DSN, no Sentry. A laptop
 * with no NEXT_PUBLIC_SENTRY_DSN in .env.local reports nothing, which is also
 * what keeps a developer's half finished page out of the owner's inbox.
 *
 * Errors only. No tracing, no session replay: replay records the screen,
 * which on checkout means a customer's name, phone and address, and the free
 * plan's quota is better spent on the errors themselves.
 */
export function sentryOptions() {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim() || undefined;

  return {
    dsn,
    enabled: Boolean(dsn),
    // "production" or "preview" on Vercel, so a broken preview build can be
    // told apart from the live site. NEXT_PUBLIC_ because the browser needs it
    // too, and Vercel exposes it under that name to the build.
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV || "development",
    // Never attach IP addresses, cookies or request bodies. The scrubber below
    // is the second line; this is the first.
    sendDefaultPii: false,
    tracesSampleRate: 0,
    beforeSend: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
  };
}

// A Philippine mobile in any of the four ways checkout accepts it, and an
// email address. Either can turn up inside an exception message, for example a
// Postgres constraint error that quotes the row it rejected.
const PHONE_PATTERN = /(?:\+?63|0)[\s-]?9\d{2}[\s-]?\d{3}[\s-]?\d{4}/g;
const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

export function redactText(text: string): string {
  return text.replace(EMAIL_PATTERN, "[email]").replace(PHONE_PATTERN, "[phone]");
}

/**
 * A URL with its query string removed and an order code masked.
 *
 * Query strings carry PostgREST filters (`?phone=eq.+639...`) and search terms.
 * /order/<code> is the customer's own receipt page and the code is what opens
 * it, so it is treated like a password and never leaves the site.
 */
export function redactUrl(url: string): string {
  const withoutQuery = url.split(/[?#]/)[0];
  return withoutQuery.replace(/\/order\/[^/]+/, "/order/[code]");
}

export function scrubEvent(event: ErrorEvent): ErrorEvent {
  if (event.request) {
    const { url, method } = event.request;
    event.request = {
      url: url ? redactUrl(url) : undefined,
      method,
    };
  }

  delete event.user;

  if (event.message) event.message = redactText(event.message);

  for (const exception of event.exception?.values ?? []) {
    if (exception.value) exception.value = redactText(exception.value);
  }

  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs
      .map((crumb) => scrubBreadcrumb(crumb))
      .filter((crumb): crumb is Breadcrumb => crumb !== null);
  }

  return event;
}

/**
 * Console breadcrumbs are dropped whole: the codebase logs Supabase errors
 * verbatim, and those can quote a row. Navigation and request breadcrumbs stay,
 * with their URLs cut down, because "which page, which request" is most of
 * what makes an error report readable.
 */
export function scrubBreadcrumb(crumb: Breadcrumb): Breadcrumb | null {
  if (crumb.category === "console") return null;

  if (crumb.message) crumb.message = redactText(crumb.message);

  if (crumb.data) {
    const data = { ...crumb.data };
    for (const key of ["url", "from", "to"]) {
      if (typeof data[key] === "string") data[key] = redactUrl(data[key]);
    }
    crumb.data = data;
  }

  return crumb;
}
