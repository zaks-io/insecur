import { errorEnvelope, requestId, VALIDATION_ERROR_CODES } from "@insecur/domain";
import { bodyLimit } from "hono/body-limit";

export const API_REQUEST_BODY_LIMIT_BYTES = 128 * 1024;

export const apiRequestBodyLimitMiddleware = bodyLimit({
  maxSize: API_REQUEST_BODY_LIMIT_BYTES,
  onError: (context) =>
    context.json(
      errorEnvelope(
        {
          code: VALIDATION_ERROR_CODES.requestBodyTooLarge,
          message: "Request body exceeds the API size limit.",
          retryable: false,
        },
        { meta: { requestId: requestId.generate() } },
      ),
      413,
    ),
});
