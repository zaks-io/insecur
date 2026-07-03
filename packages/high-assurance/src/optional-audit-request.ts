import type { RequestId } from "@insecur/domain";

export function optionalAuditRequest(
  request: { requestId: RequestId } | undefined,
): { request: { requestId: RequestId } } | Record<string, never> {
  return request !== undefined ? { request } : {};
}
