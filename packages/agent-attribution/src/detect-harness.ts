import { isStableDottedCode } from "@insecur/domain";
import { KNOWN_HARNESS_MARKERS } from "./harness-markers.js";

export type HarnessEnv = Readonly<Record<string, string | undefined>>;

/**
 * Detects a known agent harness from environment markers. Returns the stable harness code when a
 * registered marker is present; otherwise undefined.
 */
export function detectHarnessFromEnv(env: HarnessEnv): string | undefined {
  for (const [envVar, marker] of Object.entries(KNOWN_HARNESS_MARKERS)) {
    const value = env[envVar];
    if (value === undefined || value.trim() === "") {
      continue;
    }
    if (marker.envValue === "*" || value === marker.envValue) {
      if (isStableDottedCode(marker.harnessCode)) {
        return marker.harnessCode;
      }
    }
  }
  return undefined;
}
