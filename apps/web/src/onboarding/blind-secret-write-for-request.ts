import { parseVariableKey } from "@insecur/domain";
import {
  parseBlindSecretWriteOutcome,
  type BlindSecretWriteOutcome,
  type BlindSecretWriteSubmission,
} from "./blind-secret-write.js";
import { openWizardMutationApi, isWizardMutationGateFailure } from "./wizard-mutation-gate.js";

const DEFAULT_GENERATE_LENGTH_BYTES = 32;

/** The API-hop calls the blind-write server fn needs; the real client is minted per request. */
export interface BlindSecretWriteApi {
  writeSecretByVariableKey(
    organizationId: string,
    projectId: string,
    environmentId: string,
    body: Record<string, unknown>,
  ): Promise<unknown>;
}

/**
 * The blind-write server-fn decision path: CSRF first, then scoped-token client, then variable
 * key validation, then the write-only secrets API. Server-side only.
 */
export async function blindSecretWriteForRequest(
  deps: {
    readonly cookieHeader: string | null;
    readonly resolveApi: () => Promise<BlindSecretWriteApi | null>;
  },
  data: BlindSecretWriteSubmission,
): Promise<BlindSecretWriteOutcome> {
  const opened = await openWizardMutationApi(deps, data.csrfToken);
  if (isWizardMutationGateFailure(opened)) {
    return opened;
  }
  const api = opened.api;

  const variableKey = parseVariableKey(data.variableKey);
  if (!variableKey.ok) {
    return { ok: false, code: variableKey.code };
  }

  const body =
    data.mode === "generate"
      ? {
          variableKey: variableKey.value,
          generate: { mode: "random", lengthBytes: DEFAULT_GENERATE_LENGTH_BYTES },
        }
      : { variableKey: variableKey.value, value: data.value };

  try {
    const response: unknown = await api.writeSecretByVariableKey(
      data.workspace.organizationId,
      data.workspace.projectId,
      data.workspace.environmentId,
      body,
    );
    return parseBlindSecretWriteOutcome(response);
  } catch {
    return { ok: false, code: "web.unexpected_response" };
  }
}
