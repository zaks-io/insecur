import { AUTH_ERROR_CODES } from "@insecur/domain";
import { CliError } from "../output/cli-error.js";
import { EXIT_AUTH_REQUIRED } from "../output/exit-codes.js";

/** Default loopback callback wait before failing closed with auth.required. */
export const DEFAULT_LOGIN_CALLBACK_TIMEOUT_SECONDS = 300;

function loginCallbackTimeoutMessage(timeoutSeconds: number, authorizationUrl: string): string {
  return `Timed out waiting for WorkOS login callback after ${String(timeoutSeconds)} seconds. Complete login at ${authorizationUrl}, then run insecur login again.`;
}

export async function waitForLoginCallbackWithTimeout(
  waitForCode: Promise<string>,
  timeoutSeconds: number,
  authorizationUrl: string,
): Promise<string> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      waitForCode,
      new Promise<string>((_resolve, reject) => {
        timeoutHandle = setTimeout(() => {
          void waitForCode.catch(() => {
            // Late loopback callbacks after timeout must not surface as unhandled rejections.
          });
          reject(
            new CliError(
              {
                code: AUTH_ERROR_CODES.required,
                message: loginCallbackTimeoutMessage(timeoutSeconds, authorizationUrl),
                retryable: true,
              },
              EXIT_AUTH_REQUIRED,
            ),
          );
        }, timeoutSeconds * 1000);
      }),
    ]);
  } finally {
    if (timeoutHandle !== undefined) {
      clearTimeout(timeoutHandle);
    }
  }
}
