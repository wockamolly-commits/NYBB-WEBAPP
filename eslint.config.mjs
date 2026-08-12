import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override the default ignores of eslint-config-next.
  globalIgnores([
    // Defaults of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated reports and agent tooling are not application source.
    ".claude/**",
    ".vercel/**",
    "coverage/**",
    "test-results/**",
    "playwright-report/**",
    "blob-report/**",
    // The Expo app's build output and dependencies.
    "apps/*/dist/**",
    "apps/*/node_modules/**",
    "apps/*/.expo/**",
  ]),
  {
    // The native app is linted by this config on purpose: the React and hooks
    // rules are worth having in both places, and a second lint setup is a
    // second thing to keep in step. Only the rules that assume a DOM are turned
    // off, because React Native has no `alt` attribute and its accessibility
    // surface is `accessibilityLabel`, which the screens do use.
    files: ["apps/**/*.{ts,tsx}"],
    rules: {
      "jsx-a11y/alt-text": "off",
      "@next/next/no-img-element": "off",
    },
  },
]);

export default eslintConfig;
