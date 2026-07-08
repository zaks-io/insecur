import { computeSecretWriteDescriptiveVerdicts } from "@insecur/secret-store-contracts";
import type { SecretWriteDescriptiveVerdicts } from "@insecur/secret-store-contracts";

export function testDescriptiveVerdicts(
  value = "test-secret",
  generationHint?: string | null,
): SecretWriteDescriptiveVerdicts {
  return computeSecretWriteDescriptiveVerdicts({
    valueUtf8: new TextEncoder().encode(value),
    generationHint,
  });
}
