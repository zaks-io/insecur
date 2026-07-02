import type { OpaqueResourceId } from "@insecur/domain";
import { CLI_ERROR_CODES } from "@insecur/domain";
import { CliError } from "../output/cli-error.js";

export interface DestructiveTargetInput {
  readonly id?: OpaqueResourceId | string;
  readonly name?: string;
  readonly interactive: boolean;
  readonly machineIdentity?: boolean;
  readonly idFlagLabel: string;
  readonly nameFlagLabel: string;
}

function hasSuppliedOpaqueId(id: OpaqueResourceId | string | undefined): boolean {
  if (id === undefined) {
    return false;
  }
  return id.trim() !== "";
}

export function requireOpaqueIdForDestructive(input: DestructiveTargetInput): void {
  if (hasSuppliedOpaqueId(input.id)) {
    return;
  }
  if (input.name === undefined) {
    return;
  }
  if (input.interactive && input.machineIdentity !== true) {
    return;
  }
  throw new CliError({
    code: CLI_ERROR_CODES.destructiveIdRequired,
    message: `Destructive action requires an opaque ID via ${input.idFlagLabel}; ${input.nameFlagLabel} is not accepted for non-interactive callers.`,
    retryable: false,
  });
}
