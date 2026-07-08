import type { SecretSyncId } from "@insecur/domain";
import { withTenantScope, type SecretSyncRow } from "@insecur/tenant-store";

import { assertSecretSyncBindings } from "./assert-secret-sync-bindings.js";
import { loadExecutableSecretSyncContext } from "./load-executable-secret-sync-context.js";

export interface AssertSecretSyncExecutableInput {
  readonly organizationId: SecretSyncRow["organizationId"];
  readonly secretSyncId: SecretSyncId;
}

export async function assertSecretSyncExecutable(
  input: AssertSecretSyncExecutableInput,
): Promise<SecretSyncRow> {
  const loaded = await withTenantScope(
    { kind: "organization", organizationId: input.organizationId },
    async ({ db }) => {
      const context = await loadExecutableSecretSyncContext({
        db,
        organizationId: input.organizationId,
        secretSyncId: input.secretSyncId,
      });

      await assertSecretSyncBindings({
        organizationId: context.sync.organizationId,
        projectId: context.sync.projectId,
        environmentId: context.sync.environmentId,
        secretIds: context.bindings.map((binding) => binding.secretId),
      });

      return context.sync;
    },
  );

  return loaded;
}
