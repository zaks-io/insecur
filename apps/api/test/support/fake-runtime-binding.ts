import { RuntimeService } from "@insecur/runtime/service";
import type { RuntimeRpc } from "@insecur/worker-kit";

/**
 * Compose the API against the real `RuntimeService` in-process (ADR-0065 fast layer). This stands in
 * for the private Service Binding: the API calls `env.RUNTIME.<method>` and the call lands in the
 * actual Runtime implementation against the same Postgres and crypto - no mock of the keyring path,
 * and (after ADR-0077 Option B) no mock of admission/onboarding/operations either. The cloud smoke
 * layer drives the real binding over HTTP separately.
 */
export interface FakeRuntimeEnv {
  readonly INSTANCE_ROOT_KEY_V1: { get: () => Promise<string> };
  readonly RUNTIME_TOKEN_SIGNING_SECRET: string;
}

export function createFakeRuntimeBinding(runtimeEnv: FakeRuntimeEnv): RuntimeRpc {
  const ctx = { waitUntil: () => undefined, passThroughOnException: () => undefined };
  const service = new RuntimeService(ctx as never, runtimeEnv as never);
  return {
    consumeGrant: (input) => service.consumeGrant(input),
    writeSecret: (input) => service.writeSecret(input),
    resolveAdmission: (input) => service.resolveAdmission(input),
    recordAdmissionDenied: (input) => service.recordAdmissionDenied(input),
    recordAbuseDenied: (input) => service.recordAbuseDenied(input),
    getBootstrapStatus: (input) => service.getBootstrapStatus(input),
    provisionGuidedOrganization: (input) => service.provisionGuidedOrganization(input),
    createOperatorOrganization: (input) => service.createOperatorOrganization(input),
    createInvitation: (input) => service.createInvitation(input),
    acceptInvitation: (input) => service.acceptInvitation(input),
    getOperation: (input) => service.getOperation(input),
    cancelOperation: (input) => service.cancelOperation(input),
    issueInjectionGrant: (input) => service.issueInjectionGrant(input),
    completeBootstrapOperatorClaim: (input) => service.completeBootstrapOperatorClaim(input),
  };
}
