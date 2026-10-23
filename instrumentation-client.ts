// Sentry in the browser. Runs before the page becomes interactive, so an error
// thrown while a customer's phone renders the menu or checkout is reported
// even if no error boundary catches it.
//
// Reports go to /monitoring on this site (tunnelRoute in next.config.ts), not
// straight to sentry.io, so the Content Security Policy's connect-src can stay
// 'self' and ad blockers that drop sentry.io requests do not drop these.
import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "@/lib/monitoring/sentry-options";

Sentry.init(sentryOptions());
