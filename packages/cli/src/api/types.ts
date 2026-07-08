import type { AuthApiClient } from "./auth-api-types.js";
import type { AuditApiClient } from "./audit-api-types.js";
import type { LogoutApiClient } from "./logout-api-types.js";
import type { NavigationApiClient } from "./navigation-api-types.js";
import type { OnboardingApiClient } from "./onboarding-api-types.js";
import type { OperationsApiClient } from "./operations-api-types.js";
import type { RunPoliciesApiClient } from "./run-policies-api-types.js";
import type { RuntimeInjectionApiClient } from "./runtime-injection-api-types.js";
import type { SecretsApiClient } from "./secrets-api-types.js";
import type { WhoamiApiClient } from "./whoami-api-types.js";
import type { AgentSessionApiClient } from "./agent-session-api-types.js";

export type { GuidedOrganizationProvisionData } from "./onboarding-api-types.js";
export type {
  ListEnvironmentSecretsData,
  ListSecretVersionsData,
  SecretWriteByVariableKeyData,
} from "./secrets-api-types.js";
export type {
  ExportTenantAuditData,
  ListAuditEventsData,
  ListAuditEventsFiltersInput,
} from "./audit-api-types.js";
export type { OperationPollData } from "./operations-api-types.js";
export type {
  InjectionGrantDeliveryAllData,
  InjectionGrantDeliveryData,
  IssueInjectionGrantData,
} from "./runtime-injection-api-types.js";

export interface ApiClient
  extends
    AuthApiClient,
    OnboardingApiClient,
    NavigationApiClient,
    SecretsApiClient,
    RuntimeInjectionApiClient,
    OperationsApiClient,
    RunPoliciesApiClient,
    AuditApiClient,
    WhoamiApiClient,
    AgentSessionApiClient,
    LogoutApiClient {}
