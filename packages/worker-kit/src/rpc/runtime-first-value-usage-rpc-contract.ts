import type { OrganizationId } from "@insecur/domain";

import type { PostAuthRpcInputBase } from "./runtime-rpc-shared.js";

/** Metadata-only First Value usage counters for the onboarding handoff indicator. */
export interface FirstValueUsageStatusRpcPayload {
  readonly secretWrites: number;
  readonly grantConsumed: number;
  readonly runCompleted: number;
  /** True once at least one Runtime Injection grant has been consumed for this org. */
  readonly firstInjectionObserved: boolean;
}

export interface QueryFirstValueUsageRpcInput extends PostAuthRpcInputBase {
  readonly organizationId: OrganizationId;
}
