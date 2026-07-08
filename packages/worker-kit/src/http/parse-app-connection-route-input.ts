import { appConnectionId, type AppConnectionId } from "@insecur/domain";

import { parseValue } from "./parse-route-input-shared.js";

const parseAppConnectionResourceId = (raw: string) => appConnectionId.parse(raw);

export function parseAppConnectionIdParam(raw: string): AppConnectionId {
  return parseValue(raw, parseAppConnectionResourceId, "Invalid app connection id.");
}
