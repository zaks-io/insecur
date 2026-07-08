import { HighAssuranceHandoffError } from "@insecur/high-assurance";

export async function onPolicyMutationGateFailure(
  error: unknown,
  recordDenied: () => Promise<void>,
): Promise<never> {
  if (!(error instanceof HighAssuranceHandoffError)) {
    await recordDenied();
  }
  throw error;
}
