import type { ActorRef } from "@insecur/access";
import { INJECTION_ERROR_CODES } from "@insecur/domain";
import { TenantRuntimeInjectionPolicyStore, withTenantScope } from "@insecur/tenant-store";

import { InjectionGrantError } from "./injection-grant-error.js";
import type { InjectionGrantIssueSelector } from "./injection-grant-selectors.js";
import type { GrantCoordinate } from "./resolve-injection-grant-bindings.js";

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
      const activeVersion = await new TenantRuntimeInjectionPolicyStore(db).getActiveVersion(
        coordinate.organizationId,
        runtimePolicyKeyId,
      );
      if (activeVersion === null) {
        throw new InjectionGrantError(
          INJECTION_ERROR_CODES.grantDenied,
          "runtime policy key has no active version",
        );
      }

      const selectorAllowed =
        selector.kind === "variable_key"
          ? activeVersion.variableKeys.includes(selector.variableKey)
          : activeVersion.secretIds.includes(selector.secretId);
      if (!selectorAllowed) {
        throw new InjectionGrantError(
          INJECTION_ERROR_CODES.grantDenied,
          "runtime policy key does not allow the requested injection selector",
        );
      }
    },
  );
}
