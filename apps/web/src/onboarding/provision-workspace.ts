import { parseDisplayName } from "@insecur/domain";
import { isWizardMutationGateFailure, openWizardMutationApi } from "./wizard-mutation-gate.js";
import {
  parseProvisionOutcome,
  type ProvisionOutcome,
  type ProvisionSubmission,
} from "./provisioning.js";

/** The one API-hop call the wizard mutation needs; the real client is minted per request. */
export interface ProvisionWorkspaceApi {
  provisionPersonalOrganization(body: Record<string, unknown>): Promise<unknown>;
}

/**
 * The provisioning server-fn's whole decision path, separated from the TanStack/Cloudflare glue
 * so the security gates are pinned by tests: double-submit CSRF first (fail closed, no API hop),
 * then the authenticated scoped-token client, then Display Name validation, then the create-only
 * provisioning call. Server-side only.
 */
export async function provisionWorkspaceForRequest(
  deps: {
    readonly cookieHeader: string | null;
    readonly resolveApi: () => Promise<ProvisionWorkspaceApi | null>;
  },
  data: ProvisionSubmission,
): Promise<ProvisionOutcome> {
  const opened = await openWizardMutationApi(deps, data.csrfToken);
  if (isWizardMutationGateFailure(opened)) {
    return opened;
  }
  const api = opened.api;

  const organizationName = parseDisplayName(data.organizationName);
  if (!organizationName.ok) {
    return { ok: false, code: organizationName.code };
  }
  const projectName = parseDisplayName(data.projectName);
  if (!projectName.ok) {
    return { ok: false, code: projectName.code };
  }

  // Any throw on the hop (binding failure, non-JSON 5xx body) collapses to the metadata-safe
  // code: a raw SyntaxError can carry internal response-body fragments and must never serialize
  // into the server-fn response.
  try {
    const body: unknown = await api.provisionPersonalOrganization({
      organizationDisplayName: organizationName.value,
      projectDisplayName: projectName.value,
      resourceIds: data.resourceIds,
    });
    return parseProvisionOutcome(body);
  } catch {
    return { ok: false, code: "web.unexpected_response" };
  }
}
