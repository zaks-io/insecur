import type { ConsolePrincipalChainActor } from "./actor-chain-label.js";

export interface ConsoleGitHubActionsOidcMethod {
  readonly authMethodId: string;
  readonly environmentId: string | null;
  readonly githubRepository: string;
  readonly githubEnvironment: string | null;
  readonly status: "active" | "disabled";
  readonly createdAt: string;
}

export interface ConsoleEnvironmentDeployKeyMethod {
  readonly authMethodId: string;
  readonly environmentId: string;
  readonly status: "active" | "disabled";
  readonly nonExpiring: boolean;
  readonly expiresAt: string | null;
  readonly rotationIntervalSeconds: number | null;
  readonly rotationReminderIntervalSeconds: number | null;
  readonly createdAt: string;
}

export interface ConsoleMachineIdentity {
  readonly machineIdentityId: string;
  readonly displayName: string;
  readonly status: "active" | "disabled";
  readonly createdAt: string;
  readonly githubActionsOidcMethods: readonly ConsoleGitHubActionsOidcMethod[];
  readonly environmentDeployKeyMethods: readonly ConsoleEnvironmentDeployKeyMethod[];
}

export type ConsoleInjectionGrantStatus = "active" | "consumed" | "expired" | "revoked";

export interface ConsoleInjectionGrant {
  readonly grantId: string;
  readonly environmentId: string;
  readonly variableKeys: readonly string[];
  readonly status: ConsoleInjectionGrantStatus;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly consumedAt?: string;
  readonly revokedAt?: string;
  readonly revokedReason?: "tenant_suspension" | "compromise_version_invalidation";
  readonly issuedByActor?: ConsolePrincipalChainActor;
  readonly consumedByActor?: ConsolePrincipalChainActor;
}
