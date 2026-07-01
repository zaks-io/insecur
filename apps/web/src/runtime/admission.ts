import type { AdmittedUserResolver } from "@insecur/auth";
import type { UserId } from "@insecur/domain";
import type { WebEnv } from "../env.js";
import type { RuntimeAdmissionRpc, RuntimeRpcResult } from "./admission-types.js";

function unwrapRuntimeResult<T>(result: RuntimeRpcResult<T>): T {
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  return result.value;
}

function resolveInstanceId(env: WebEnv): string {
  return env.INSTANCE_ID ?? "inst_LOCAL_DEV";
}

async function resolveAdmissionViaBinding(
  runtime: RuntimeAdmissionRpc,
  input: { instanceId: string; workosUserId: string },
): Promise<UserId | null> {
  const payload = unwrapRuntimeResult(await runtime.resolveAdmission(input));
  return payload.userId;
}

export function createRuntimeAdmittedUserResolver(env: WebEnv): AdmittedUserResolver {
  const instanceId = resolveInstanceId(env);
  return (workosUserId: string) =>
    resolveAdmissionViaBinding(env.RUNTIME, { instanceId, workosUserId });
}
