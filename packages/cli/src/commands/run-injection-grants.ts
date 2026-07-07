import type { RuntimePolicyId, VariableKey } from "@insecur/domain";
import type {
  ApiClient,
  InjectionGrantDeliveryAllData,
  InjectionGrantDeliveryData,
  IssueInjectionGrantData,
} from "../api/types.js";
import { CliError } from "../output/cli-error.js";
import type { ResolvedSecretWriteScope } from "./secrets-set-scope.js";

export async function issueAndConsumeVariableKeyGrant(input: {
  readonly api: ApiClient;
  readonly credential: string;
  readonly host: string;
  readonly runScope: ResolvedSecretWriteScope;
  readonly variableKey: VariableKey;
}): Promise<{ issueData: IssueInjectionGrantData; delivery: InjectionGrantDeliveryData }> {
  const issueResult = await input.api.issueInjectionGrant({
    host: input.host,
    bearerCredential: input.credential,
    organizationId: input.runScope.orgId,
    projectId: input.runScope.projectId,
    environmentId: input.runScope.envId,
    variableKey: input.variableKey,
  });
  if (!issueResult.ok) {
    throw new CliError(issueResult.envelope.error);
  }

  const consumeResult = await input.api.consumeInjectionGrant({
    host: input.host,
    bearerCredential: input.credential,
    organizationId: input.runScope.orgId,
    grantId: issueResult.envelope.data.grantId,
    variableKey: input.variableKey,
  });
  if (!consumeResult.ok) {
    throw new CliError(consumeResult.envelope.error);
  }

  return {
    issueData: issueResult.envelope.data,
    delivery: consumeResult.envelope.delivery,
  };
}

export async function issueAndConsumePolicyGrant(input: {
  readonly api: ApiClient;
  readonly credential: string;
  readonly host: string;
  readonly runScope: ResolvedSecretWriteScope;
  readonly policyId: RuntimePolicyId;
}): Promise<{ issueData: IssueInjectionGrantData; delivery: InjectionGrantDeliveryAllData }> {
  const issueResult = await input.api.issueInjectionGrant({
    host: input.host,
    bearerCredential: input.credential,
    organizationId: input.runScope.orgId,
    projectId: input.runScope.projectId,
    environmentId: input.runScope.envId,
    policyId: input.policyId,
  });
  if (!issueResult.ok) {
    throw new CliError(issueResult.envelope.error);
  }

  const consumeResult = await input.api.consumeInjectionGrantAll({
    host: input.host,
    bearerCredential: input.credential,
    organizationId: input.runScope.orgId,
    grantId: issueResult.envelope.data.grantId,
  });
  if (!consumeResult.ok) {
    throw new CliError(consumeResult.envelope.error);
  }

  return {
    issueData: issueResult.envelope.data,
    delivery: consumeResult.envelope.delivery,
  };
}
