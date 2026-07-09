import type { exchangeCliDeviceSession } from "@insecur/auth";
import type { RequestId } from "@insecur/domain";
import { resolveInstanceId, unwrapRuntimeResult } from "@insecur/worker-kit";
import type { Context } from "hono";
import type { ApiEnv } from "../../env.js";

type AuthRouteContext = Context<{ Bindings: ApiEnv }>;
type DeviceExchangeResult = Awaited<ReturnType<typeof exchangeCliDeviceSession>>;
type DeviceExchangeFailure = Extract<DeviceExchangeResult, { ok: false }>;
type DeviceExchangeSuccess = Extract<DeviceExchangeResult, { ok: true; status: "authenticated" }>;

export type ParsedDeviceTokenBody =
  | { readonly ok: true; readonly deviceCode: string; readonly agentSession: boolean }
  | { readonly ok: false; readonly message: string };

export function parseDeviceTokenBody(body: unknown): ParsedDeviceTokenBody {
  if (body === null || typeof body !== "object") {
    return { ok: false, message: "Expected JSON device token exchange body." };
  }
  const record = body as Record<string, unknown>;
  const deviceCode = typeof record.deviceCode === "string" ? record.deviceCode : "";
  if (deviceCode.trim() === "") {
    return { ok: false, message: "Missing device code." };
  }
  return { ok: true, deviceCode, agentSession: record.agentSession === true };
}

export function parseDeviceAuthorizationIntent(body: unknown): {
  readonly agentSession: boolean;
  readonly requesterHost?: string;
} {
  if (body === null || typeof body !== "object") {
    return { agentSession: false };
  }
  const record = body as Record<string, unknown>;
  const requesterHost =
    typeof record.requesterHost === "string" ? record.requesterHost.trim() : undefined;
  return {
    agentSession: record.agentSession === true,
    ...(requesterHost === undefined || requesterHost === "" || requesterHost.length > 128
      ? {}
      : { requesterHost }),
  };
}

export async function recordDeviceTokenDeniedAudit(
  context: AuthRouteContext,
  exchanged: DeviceExchangeFailure,
  reqId: RequestId,
): Promise<void> {
  unwrapRuntimeResult(
    await context.env.RUNTIME.recordDeviceAuthorizationAudit({
      instanceId: resolveInstanceId(context.env),
      requestId: reqId,
      outcome: "denied",
      reasonCode: exchanged.failure.code,
      agentSession: exchanged.auditContext?.agentSession ?? false,
      ...(exchanged.auditContext?.requesterHost === undefined
        ? {}
        : { requesterHost: exchanged.auditContext.requesterHost }),
      ...(exchanged.auditContext?.requesterIp === undefined
        ? {}
        : { requesterIp: exchanged.auditContext.requesterIp }),
    }),
  );
}

export async function recordDeviceTokenApprovedAudit(
  context: AuthRouteContext,
  exchanged: DeviceExchangeSuccess,
  reqId: RequestId,
): Promise<void> {
  unwrapRuntimeResult(
    await context.env.RUNTIME.recordDeviceAuthorizationAudit({
      instanceId: resolveInstanceId(context.env),
      requestId: reqId,
      outcome: "approved",
      actorUserId: exchanged.actorUserId,
      agentSession: exchanged.auditContext.agentSession,
      ...(exchanged.auditContext.requesterHost === undefined
        ? {}
        : { requesterHost: exchanged.auditContext.requesterHost }),
      ...(exchanged.auditContext.requesterIp === undefined
        ? {}
        : { requesterIp: exchanged.auditContext.requesterIp }),
    }),
  );
}
