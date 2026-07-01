import { requestId, type RequestId } from "@insecur/domain";
import { knownErrorCodeFromUnknown } from "@insecur/worker-kit";

export function logUnhandledApiError(error: unknown): RequestId {
  const reqId = requestId.generate();
  console.error({
    event: "api.unhandled_error",
    code: knownErrorCodeFromUnknown(error),
    name: error instanceof Error ? error.name : "UnknownError",
    requestId: reqId,
  });
  return reqId;
}
