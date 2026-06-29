import { requestId, successEnvelope, type RequestId } from "@insecur/domain";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { domainErrorEnvelope } from "./domain-error-response.js";

export function createRequestId(): RequestId {
  return requestId.generate();
}

export async function handleRoute<TData>(
  context: Context,
  handler: (requestId: RequestId) => Promise<TData>,
): Promise<Response> {
  const reqId = createRequestId();
  try {
    const data = await handler(reqId);
    return context.json(successEnvelope(data, { requestId: reqId }));
  } catch (error) {
    // TEMP DIAG (preview): log the real error class + message API-side (NEVER secret material) so the
    // wire-redacted "Request failed." can be traced. Remove before merge.
    console.error(
      `ROUTE_ERR req=${reqId} name=${error instanceof Error ? error.name : typeof error} msg=${error instanceof Error ? error.message : String(error)}`,
    );
    const { status, body } = domainErrorEnvelope(error, reqId);
    return context.json(body, status as ContentfulStatusCode);
  }
}

export async function handleDeliveryRoute(
  context: Context,
  handler: (requestId: RequestId) => Promise<Response>,
): Promise<Response> {
  const reqId = createRequestId();
  try {
    return await handler(reqId);
  } catch (error) {
    const { status, body } = domainErrorEnvelope(error, reqId);
    return context.json(body, status as ContentfulStatusCode);
  }
}
