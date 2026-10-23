// Sentry for the Node.js server: Server Components, Server Actions, route
// handlers. Loaded from register() in instrumentation.ts.
import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "@/lib/monitoring/sentry-options";

Sentry.init(sentryOptions());
