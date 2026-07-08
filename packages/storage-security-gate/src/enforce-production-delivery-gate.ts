import {
  requiresProductionStorageSecurityGate,
  type StorageGateDeliveryPath,
} from "./delivery-paths.js";
import { StorageGateDeliveryError } from "./storage-gate-delivery-error.js";
import type { StorageSecurityGateVerdict } from "./types.js";

export interface AssertProductionDeliveryGatePassedInput {
  readonly path: StorageGateDeliveryPath;
  readonly evaluateGate: () => Promise<StorageSecurityGateVerdict>;
}

/**
 * Evaluates the Storage Security Gate for production delivery paths and throws before
 * decrypt, provider credential use, provider write, or production Runtime Injection.
 * First Value local Runtime Injection skips the full production gate.
 */
export async function assertProductionDeliveryGatePassed(
  input: AssertProductionDeliveryGatePassedInput,
): Promise<StorageSecurityGateVerdict | undefined> {
  if (!requiresProductionStorageSecurityGate(input.path)) {
    return undefined;
  }

  const verdict = await input.evaluateGate();
  if (verdict.delivery_blocking) {
    throw new StorageGateDeliveryError({ verdict, path: input.path });
  }
  return verdict;
}

export interface RunWithProductionDeliveryGateInput<T> {
  readonly path: StorageGateDeliveryPath;
  readonly evaluateGate: () => Promise<StorageSecurityGateVerdict>;
  readonly delivery: (gateVerdict: StorageSecurityGateVerdict | undefined) => Promise<T>;
}

/** Shared fail-closed wrapper for production delivery callers. */
export async function runWithProductionDeliveryGate<T>(
  input: RunWithProductionDeliveryGateInput<T>,
): Promise<T> {
  const gateVerdict = await assertProductionDeliveryGatePassed({
    path: input.path,
    evaluateGate: input.evaluateGate,
  });
  return input.delivery(gateVerdict);
}
