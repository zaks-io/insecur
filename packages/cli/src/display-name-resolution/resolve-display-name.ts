import type { OpaqueResourceId } from "@insecur/domain";
import { CLI_ERROR_CODES } from "@insecur/domain";
import { asEchoId } from "../output/target-echo.js";
import { CliError } from "../output/cli-error.js";
import type { ResolveDisplayNameInput, ResolvedDisplayName, ScopedListEntry } from "./types.js";

function exactMatches<TId extends OpaqueResourceId>(
  displayName: string,
  entries: readonly ScopedListEntry<TId>[],
): readonly ScopedListEntry<TId>[] {
  return entries.filter((entry) => entry.displayName === displayName);
}

function notFoundMessage(resourceType: string, displayName: string, flagLabel: string): string {
  return `${resourceType} display name not found: ${displayName} (${flagLabel})`;
}

function ambiguousMessage(
  resourceType: string,
  displayName: string,
  flagLabel: string,
  matches: readonly ScopedListEntry[],
): string {
  const candidates = matches.map((entry) => `${entry.id} (${entry.displayName})`).join(", ");
  return `Ambiguous ${resourceType} display name ${displayName} (${flagLabel}): ${candidates}`;
}

function buildEcho<TId extends OpaqueResourceId>(
  input: ResolveDisplayNameInput<TId>,
  match: ScopedListEntry<TId>,
): ResolvedDisplayName<TId> {
  const echo = {
    type: input.resourceType,
    id: asEchoId(match.id),
    displayName: match.displayName,
    ...(input.parent === undefined ? {} : { parent: input.parent }),
  };
  return { id: match.id, displayName: match.displayName, echo };
}

export function resolveDisplayName<TId extends OpaqueResourceId>(
  input: ResolveDisplayNameInput<TId>,
): ResolvedDisplayName<TId> | undefined {
  const matches = exactMatches(String(input.displayName), input.entries);
  if (matches.length === 0) {
    return undefined;
  }
  if (matches.length > 1) {
    throw new CliError({
      code: CLI_ERROR_CODES.displayNameAmbiguous,
      message: ambiguousMessage(
        input.resourceType,
        String(input.displayName),
        input.flagLabel,
        matches,
      ),
      retryable: false,
    });
  }
  const match = matches[0];
  if (match === undefined) {
    return undefined;
  }
  return buildEcho(input, match);
}

export function resolveDisplayNameOrThrow<TId extends OpaqueResourceId>(
  input: ResolveDisplayNameInput<TId>,
): ResolvedDisplayName<TId> {
  const resolved = resolveDisplayName(input);
  if (resolved !== undefined) {
    return resolved;
  }
  throw new CliError({
    code: CLI_ERROR_CODES.displayNameNotFound,
    message: notFoundMessage(input.resourceType, String(input.displayName), input.flagLabel),
    retryable: false,
  });
}
