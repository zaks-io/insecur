import { defineConfig } from "vitest/config";

// Standalone vitest config so unit tests do not load the Cloudflare/TanStack Vite plugins from
// vite.config.ts. No unit tests exist yet for the Public Site scaffold; this keeps `pnpm test`
// green and ready for the first component test.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
    passWithNoTests: true,
  },
});
