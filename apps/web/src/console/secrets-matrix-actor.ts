import type { ConsoleSecretMatrixLastSetActor } from "./secrets-matrix.js";

/** Metadata-only actor label for matrix last-set cells (docs/web-console-ux.md §Actor Rendering). */
export function formatSecretMatrixLastSetActorLabel(
  actor: ConsoleSecretMatrixLastSetActor,
): string {
  if (actor.actorType === "user") {
    return actor.userId ?? "user";
  }
  if (actor.actorType === "machine") {
    return actor.machineIdentityId ?? "machine";
  }
  return "ci_exchange";
}
