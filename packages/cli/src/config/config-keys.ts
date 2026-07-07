import { VALIDATION_ERROR_CODES } from "@insecur/domain";
import { isForbiddenConfigKey } from "./forbidden-config-keys.js";
import { CliError } from "../output/cli-error.js";

const DEFAULT_ENV_ID_KEY = "default-env-id";
const BRANCH_ENV_PREFIX = "branch-env.";

export type WritableProjectConfigKey =
  { readonly kind: "default-env-id" } | { readonly kind: "branch-env"; readonly branch: string };

export function parseWritableProjectConfigKey(rawKey: string): WritableProjectConfigKey {
  if (isForbiddenConfigKey(rawKey)) {
    throw new CliError({
      code: VALIDATION_ERROR_CODES.invalidCommandInput,
      message: `Config key is forbidden: ${rawKey}`,
      retryable: false,
    });
  }
  if (rawKey === DEFAULT_ENV_ID_KEY) {
    return { kind: "default-env-id" };
  }
  if (rawKey.startsWith(BRANCH_ENV_PREFIX)) {
    const branch = rawKey.slice(BRANCH_ENV_PREFIX.length);
    if (branch === "") {
      throw new CliError({
        code: VALIDATION_ERROR_CODES.invalidCommandInput,
        message: "Config key branch-env.<branch> requires a non-empty branch name.",
        retryable: false,
      });
    }
    if (isForbiddenConfigKey(branch)) {
      throw new CliError({
        code: VALIDATION_ERROR_CODES.invalidCommandInput,
        message: `Config key is forbidden: ${rawKey}`,
        retryable: false,
      });
    }
    return { kind: "branch-env", branch };
  }
  throw new CliError({
    code: VALIDATION_ERROR_CODES.invalidCommandInput,
    message: `Unsupported config key: ${rawKey}. Supported keys: ${DEFAULT_ENV_ID_KEY}, ${BRANCH_ENV_PREFIX}<branch>.`,
    retryable: false,
  });
}
