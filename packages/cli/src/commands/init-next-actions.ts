import type { NextAction } from "@insecur/domain";

export const INIT_NEXT_ACTIONS: readonly NextAction[] = [
  {
    id: "create-proof-secret",
    actor: "agent",
    kind: "execute",
    argv: [
      "insecur",
      "secrets",
      "set",
      "INSECUR_PROOF_SECRET",
      "--generate",
      "random",
      "--length",
      "32",
      "--json",
    ],
  },
  {
    id: "run-proof",
    actor: "agent",
    kind: "execute",
    argv: [
      "insecur",
      "run",
      "--variable-key",
      "INSECUR_PROOF_SECRET",
      "--",
      "node",
      "-e",
      "process.exit(process.env.INSECUR_PROOF_SECRET ? 0 : 1)",
    ],
  },
];
