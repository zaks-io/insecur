import { HighAssuranceHandoffError } from "@insecur/high-assurance";

export async function onAppConnectionChangeGateFailure(
  error: unknown,
  recordDenied: () => Promise<void>,
): Promise<never> {
  if (!(error instanceof HighAssuranceHandoffError)) {
    await recordDenied();
  }
  throw error;
}
