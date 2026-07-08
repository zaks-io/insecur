import { SENSITIVE_METADATA_ORG_SCOPE_PROJECT_SENTINEL } from "@insecur/crypto";
import type { ProjectId } from "@insecur/domain";

/** Org-scoped App Connections store sensitive metadata under the org-scope project sentinel. */
export function orgScopedConnectionProjectId(): ProjectId {
  return SENSITIVE_METADATA_ORG_SCOPE_PROJECT_SENTINEL as ProjectId;
}
