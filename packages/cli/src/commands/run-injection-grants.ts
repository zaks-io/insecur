import type {
  InjectionGrantId,
  MetadataEnvelopeMeta,
  RequestId,
  RuntimePolicyId,
  VariableKey,
} from "@insecur/domain";
import type { ErrorEnvelope } from "@insecur/domain";
import type {
  ApiClient,
  InjectionGrantDeliveryAllData,
  InjectionGrantDeliveryData,
  IssueInjectionGrantData,
} from "../api/types.js";
import { cliErrorFromEnvelope } from "../output/cli-error.js";
import type { ResolvedSecretWriteScope } from "./secrets-set-scope.js";

type ApiCallResult<TEnvelope> =
  { ok: false; envelope: ErrorEnvelope; httpStatus?: number } | { ok: true; envelope: TEnvelope };

type IssueInjectionGrantResult = Awaited<ReturnType<ApiClient["issueInjectionGrant"]>>;

function throwIfApiFailure<TEnvelope>(
  result: ApiCallResult<TEnvelope>,
): asserts result is { ok: true; envelope: TEnvelope } {
  if (!result.ok) {
    throw cliErrorFromEnvelope(result.envelope);
  }
}

async function issueAndConsumeGrant<TDelivery>(input: {
  readonly api: ApiClient;
  readonly credential: string;
  readonly host: string;
  readonly runScope: ResolvedSecretWriteScope;
  readonly grantTarget:
    { readonly variableKey: VariableKey } | { readonly policyId: RuntimePolicyId };
  readonly consume: (
    grantId: InjectionGrantId,
  ) => Promise<ApiCallResult<{ delivery: TDelivery; meta?: MetadataEnvelopeMeta }>>;
}): Promise<{
  issueData: IssueInjectionGrantData;
  delivery: TDelivery;
  requestId: RequestId | undefined;
}> {
  const issueResult: IssueInjectionGrantResult = await input.api.issueInjectionGrant({
    host: input.host,
    bearerCredential: input.credential,
    organizationId: input.runScope.orgId,
    projectId: input.runScope.projectId,
    environmentId: input.runScope.envId,
    ...input.grantTarget,
  });
  throwIfApiFailure(issueResult);

  const consumeResult = await input.consume(issueResult.envelope.data.grantId);
  throwIfApiFailure(consumeResult);

  return {
    issueData: issueResult.envelope.data,
    delivery: consumeResult.envelope.delivery,
    requestId: consumeResult.envelope.meta?.requestId ?? issueResult.envelope.meta?.requestId,
  };
}

export async function issueAndConsumeVariableKeyGrant(input: {
  readonly api: ApiClient;
  readonly credential: string;
  readonly host: string;
  readonly runScope: ResolvedSecretWriteScope;
  readonly variableKey: VariableKey;
}): Promise<{
  issueData: IssueInjectionGrantData;
  delivery: InjectionGrantDeliveryData;
  requestId: RequestId | undefined;
}> {
  return issueAndConsumeGrant<InjectionGrantDeliveryData>({
    api: input.api,
    credential: input.credential,
    host: input.host,
    runScope: input.runScope,
    grantTarget: { variableKey: input.variableKey },
    consume: (grantId) =>
      input.api.consumeInjectionGrant({
        host: input.host,
        bearerCredential: input.credential,
        organizationId: input.runScope.orgId,
        grantId,
        variableKey: input.variableKey,
      }) as Promise<
        ApiCallResult<{ delivery: InjectionGrantDeliveryData; meta?: MetadataEnvelopeMeta }>
      >,
  });
}

export async function issueAndConsumePolicyGrant(input: {
  readonly api: ApiClient;
  readonly credential: string;
  readonly host: string;
  readonly runScope: ResolvedSecretWriteScope;
  readonly policyId: RuntimePolicyId;
}): Promise<{
  issueData: IssueInjectionGrantData;
  delivery: InjectionGrantDeliveryAllData;
  requestId: RequestId | undefined;
}> {
  return issueAndConsumeGrant<InjectionGrantDeliveryAllData>({
    api: input.api,
    credential: input.credential,
    host: input.host,
    runScope: input.runScope,
    grantTarget: { policyId: input.policyId },
    consume: (grantId) =>
      input.api.consumeInjectionGrantAll({
        host: input.host,
        bearerCredential: input.credential,
        organizationId: input.runScope.orgId,
        grantId,
      }) as Promise<
        ApiCallResult<{ delivery: InjectionGrantDeliveryAllData; meta?: MetadataEnvelopeMeta }>
      >,
  });
}
