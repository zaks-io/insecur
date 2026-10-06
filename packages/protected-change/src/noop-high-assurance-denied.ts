import type { HighAssuranceChallengeError } from "@insecur/high-assurance";

export function noopHighAssuranceDenied(_error: HighAssuranceChallengeError): Promise<void> {
  return Promise.resolve();
}
