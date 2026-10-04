import { afterEach, beforeEach, vi } from "vitest";

// Auth tests exercise hosted behavior by default; local development tests opt in explicitly.
beforeEach(() => vi.stubEnv("DEV", false));
afterEach(() => vi.unstubAllEnvs());
