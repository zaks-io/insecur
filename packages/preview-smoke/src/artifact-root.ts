import { fileURLToPath } from "node:url";

/**
 * Single source of truth for where preview smoke artifacts land. The Playwright config writes
 * here, CI uploads this exact tree, and the credential sweep must scan this exact tree — a
 * divergent copy of this path would let unswept artifacts upload.
 */
export const PREVIEW_SMOKE_ARTIFACT_ROOT = fileURLToPath(
  new URL("../../../preview-smoke-artifacts", import.meta.url),
);
