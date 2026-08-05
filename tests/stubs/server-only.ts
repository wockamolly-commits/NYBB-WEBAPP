// The real "server-only" package throws when imported outside Next's bundler.
// vitest runs plain Node, so vitest.config.ts aliases it to this no-op.
export {};
