import type { ActorRef } from "@insecur/access";
import type { RuntimePolicyId } from "@insecur/domain";
import { INJECTION_ERROR_CODES } from "@insecur/domain";
import {
  TenantRuntimeInjectionPolicyStore,
  withTenantScope,
  type RuntimeInjectionPolicyVersionRow,
} from "@insecur/tenant-store";

import { InjectionGrantError } from "./injection-grant-error.js";
import type { InjectionGrantIssueSelector } from "./injection-grant-selectors.js";
import type { GrantCoordinate } from "./resolve-injection-grant-bindings.js";

function grantDenied(message: string): InjectionGrantError {
  return new InjectionGrantError(INJECTION_ERROR_CODES.grantDenied, message);
}

async function loadBoundRuntimePolicyVersion(
  store: TenantRuntimeInjectionPolicyStore,
  coordinate: GrantCoordinate,
  runtimePolicyKeyId: RuntimePolicyId,
): Promise<RuntimeInjectionPolicyVersionRow> {
  const policy = await store.getPolicyById(coordinate.organizationId, runtimePolicyKeyId);
  if (policy === null) {
    throw grantDenied("runtime policy key not found");
  }
  if (
    policy.projectId !== coordinate.projectId ||
    policy.environmentId !== coordinate.environmentId
  ) {
    throw grantDenied(
      "runtime policy key does not belong to the requested project and environment",
    );
  }
  if (policy.activeVersionId === null) {
    throw grantDenied("runtime policy key has no active version");
  }

  const activeVersion = await store.getVersionById(
    coordinate.organizationId,
    runtimePolicyKeyId,
    policy.activeVersionId,
  );
  if (activeVersion === null) {
    throw grantDenied("runtime policy key has no active version");
  }
  return activeVersion;
}

function assertSelectorAllowedByPolicyVersion(
  activeVersion: RuntimeInjectionPolicyVersionRow,
  selector: InjectionGrantIssueSelector,
): void {
  const selectorAllowed =
    selector.kind === "variable_key"
      ? activeVersion.variableKeys.includes(selector.variableKey)
      : activeVersion.secretIds.includes(selector.secretId);
  if (!selectorAllowed) {
    throw grantDenied("runtime policy key does not allow the requested injection selector");
  }
}

/** Denies deploy-key grants that target secrets outside the bound runtime policy key. */
export async function assertRuntimePolicyKeyAllowsGrantSelector(
  actor: ActorRef,
  coordinate: GrantCoordinate,
  selector: InjectionGrantIssueSelector,
): Promise<void> {
  if (actor.type !== "machine") {
    return;
  }

  const runtimePolicyKeyId = actor.tokenScope.runtimePolicyKeyId;
  if (runtimePolicyKeyId === undefined) {
    return;
  }

  await withTenantScope(
    { kind: "organization", organizationId: coordinate.organizationId },
    async ({ db }) => {
      const activeVersion = await loadBoundRuntimePolicyVersion(
        new TenantRuntimeInjectionPolicyStore(db),
        coordinate,
        runtimePolicyKeyId,
      );
      assertSelectorAllowedByPolicyVersion(activeVersion, selector);
    },
  );
}
