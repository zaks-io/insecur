import type { UserId } from "@insecur/domain";
import { resolveAdmittedUserId } from "@insecur/tenant-store";
import type { ResolveAdmissionRpcInput } from "@insecur/worker-kit";

export async function resolveAdmissionOperation(
  input: ResolveAdmissionRpcInput,
): Promise<{ userId: UserId | null }> {
  const admittedUserId = await resolveAdmittedUserId(input.instanceId, input.workosUserId);
  return { userId: admittedUserId };
}
