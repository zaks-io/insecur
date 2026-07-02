import type { OpaqueResourceId } from "@insecur/domain";
import { CLI_ERROR_CODES } from "@insecur/domain";
import { asEchoId } from "../output/target-echo.js";
import { CliError } from "../output/cli-error.js";
import type { ResolvedDisplayName, ScopedListEntry } from "./types.js";
import type { ResolveDisplayNameInput } from "./types.js";

function selectorNotFoundMessage(resourceType: string, id: string, idFlagLabel: string): string {
  return `${resourceType} not found in scope: ${id} (${idFlagLabel})`;
}

function buildEchoFromEntry<TId extends OpaqueResourceId>(
  resourceType: string,
  parent: ResolveDisplayNameInput<TId>["parent"] | undefined,
  match: ScopedListEntry<TId>,
): ResolvedDisplayName<TId> {
  return {
    id: match.id,
    displayName: match.displayName,
    echo: {
      type: resourceType,
      id: asEchoId(match.id),
      displayName: match.displayName,
      ...(parent === undefined ? {} : { parent }),
    },
  };
}

export function resolveOpaqueIdInScopedList<TId extends OpaqueResourceId>(input: {
  readonly id: TId;
  readonly resourceType: string;
  readonly idFlagLabel: string;
  readonly entries: readonly ScopedListEntry<TId>[];
  readonly parent?: ResolveDisplayNameInput<TId>["parent"];
}): ResolvedDisplayName<TId> {
  const match = input.entries.find((entry) => entry.id === input.id);
  if (match === undefined) {
    throw new CliError({
      code: CLI_ERROR_CODES.scopedSelectorNotFound,
      message: selectorNotFoundMessage(input.resourceType, input.id, input.idFlagLabel),
      retryable: false,
    });
  }
  return buildEchoFromEntry(input.resourceType, input.parent, match);
}
