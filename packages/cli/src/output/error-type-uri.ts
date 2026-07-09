import type { KnownErrorCode } from "@insecur/domain";

const ERROR_TYPE_BASE = "https://insecur.dev/errors/";

/**
 * Stable RFC 9457 `type` URI for an error code. The code's dotted namespace maps
 * to a slug (`cli.validation_error` → `cli-validation-error`) so an agent gets a
 * durable dispatch key that never drifts with message wording or i18n.
 */
export function errorTypeUri(code: KnownErrorCode): string {
  const slug = code.replace(/[._]/g, "-");
  return `${ERROR_TYPE_BASE}${slug}`;
}
