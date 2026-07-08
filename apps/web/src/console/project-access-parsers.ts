import { parseSuccessEnvelopeList } from "./envelope.js";
import { parseInjectionGrant } from "./project-access-grant-parsers.js";
import { parseMachineIdentity } from "./project-access-machine-identity-parsers.js";
import type { ConsoleInjectionGrant, ConsoleMachineIdentity } from "./project-access-types.js";

export function parseProjectMachineIdentitiesBody(
  body: unknown,
): readonly ConsoleMachineIdentity[] | null {
  return parseSuccessEnvelopeList(body, "machineIdentities", parseMachineIdentity);
}

export function parseProjectInjectionGrantsBody(
  body: unknown,
): readonly ConsoleInjectionGrant[] | null {
  return parseSuccessEnvelopeList(body, "grants", parseInjectionGrant);
}
