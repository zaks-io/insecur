import { ABUSE_ERROR_CODES } from "@insecur/domain";
import type { PublicEdgeAbuseTarget } from "./public-edge-abuse-target.js";

export class AbuseLimitError extends Error {
  readonly code = ABUSE_ERROR_CODES.rateLimited;
  readonly retryable = true;

  constructor(readonly target: PublicEdgeAbuseTarget) {
    super("rate limit exceeded");
    this.name = "AbuseLimitError";
  }
}
