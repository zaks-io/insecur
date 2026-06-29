import { getBootstrapStatus, type BootstrapStatus } from "@insecur/instance-bootstrap";
import type { GetBootstrapStatusRpcInput } from "@insecur/worker-kit";

export async function getBootstrapStatusOperation(
  input: GetBootstrapStatusRpcInput,
): Promise<BootstrapStatus> {
  return getBootstrapStatus(input.instanceId);
}
