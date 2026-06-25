import type { AdmittedUserResolver } from "@insecur/auth";
import { resolveAdmittedUserId } from "@insecur/tenant-store";
import type { AuthWorkerEnv } from "./auth-worker-env.js";

export function resolveInstanceId(env: AuthWorkerEnv): string {
  return env.INSTANCE_ID ?? "inst_LOCAL_DEV";
}

export function createStoreAdmittedUserResolver(instanceId: string): AdmittedUserResolver {
  return (workosUserId: string) => resolveAdmittedUserId(instanceId, workosUserId);
}

export function createAdmittedUserResolver(env: AuthWorkerEnv): AdmittedUserResolver {
  return createStoreAdmittedUserResolver(resolveInstanceId(env));
}
