import type { EnvironmentId, ProjectId, SecretId, VariableKey } from "@insecur/domain";
import {
  encodeRequestValueUtf8,
  parseJsonBody,
  parseOptionalSecretId,
  parseVariableKeyField,
  readOptionalBoolean,
  readOptionalString,
  readRequiredString,
  readSecretValueField,
} from "@insecur/worker-kit";

export interface ParsedSecretWriteBody {
  variableKey: VariableKey;
  valueUtf8: Uint8Array;
  localValueFile?: string;
  allowEmpty?: boolean;
  secretId?: SecretId;
}

export async function parseSecretWriteBody(request: {
  json: () => Promise<unknown>;
}): Promise<ParsedSecretWriteBody> {
  const body = parseJsonBody(await request.json());
  const parsed: ParsedSecretWriteBody = {
    variableKey: parseVariableKeyField(readRequiredString(body, "variableKey")),
    valueUtf8: encodeRequestValueUtf8(readSecretValueField(body)),
  };
  const allowEmpty = readOptionalBoolean(body, "allowEmpty");
  const secretId = parseOptionalSecretId(readOptionalString(body, "secretId"));
  const localValueFile = readOptionalString(body, "localValueFile");
  if (allowEmpty !== undefined) {
    parsed.allowEmpty = allowEmpty;
  }
  if (secretId !== undefined) {
    parsed.secretId = secretId;
  }
  if (localValueFile !== undefined) {
    parsed.localValueFile = localValueFile;
  }
  return parsed;
}

export interface SecretWritePathParams {
  projectId: ProjectId;
  environmentId: EnvironmentId;
}
