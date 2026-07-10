import type { NextAction } from "@insecur/domain";

export function describeCreationNext(commandPath: readonly string[]): readonly NextAction[] {
  return [
    {
      id: "describe-create",
      kind: "execute",
      actor: "agent",
      argv: ["insecur", "describe", ...commandPath, "--json"],
    },
  ];
}
