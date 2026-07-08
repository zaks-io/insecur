import type { AuditEventInput } from "@insecur/audit";
import {
  TenantEnvironmentLifecycleStore,
  TenantHierarchyDisplayNameStore,
  withTenantScope,
} from "@insecur/tenant-store";

/** Resolve human-readable scope labels for notification envelopes; falls back to opaque IDs. */
export async function resolveEnvelopeDisplayNames(
  event: AuditEventInput,
): Promise<Record<string, string>> {
  return withTenantScope(
    { kind: "organization", organizationId: event.organizationId },
    async ({ db }) => {
      const hierarchyStore = new TenantHierarchyDisplayNameStore(db);
      const environmentStore = new TenantEnvironmentLifecycleStore(db);
      const displayNames: Record<string, string> = {};

      const organizationDisplayName = await hierarchyStore.getOrganizationDisplayName(
        event.organizationId,
      );
      displayNames.organization = organizationDisplayName ?? event.organizationId;

      if (event.projectId !== undefined) {
        const projectDisplayName = await hierarchyStore.getProjectDisplayName(
          event.organizationId,
          event.projectId,
        );
        displayNames.project = projectDisplayName ?? event.projectId;
      }

      if (event.environmentId !== undefined) {
        const environment = await environmentStore.getById(
          event.organizationId,
          event.environmentId,
        );
        displayNames.environment = environment?.displayName ?? event.environmentId;
      }

      return displayNames;
    },
  );
}
