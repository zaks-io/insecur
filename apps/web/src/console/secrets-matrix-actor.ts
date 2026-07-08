import type { ConsoleSecretMatrixLastSetActor } from "./secrets-matrix.js";
import { formatPrincipalChainActorLabel } from "./actor-chain-label.js";

/** Metadata-only actor label for matrix last-set cells (docs/web-console-ux.md §Actor Rendering). */
export function formatSecretMatrixLastSetActorLabel(
  actor: ConsoleSecretMatrixLastSetActor,
): string {
  return formatPrincipalChainActorLabel(actor);
}
