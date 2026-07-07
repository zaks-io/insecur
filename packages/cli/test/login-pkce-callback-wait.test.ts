import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { waitForLoginCallbackWithTimeout } from "../src/commands/login-pkce-callback-wait.js";
import { CliError } from "../src/output/cli-error.js";
import { EXIT_AUTH_REQUIRED } from "../src/output/exit-codes.js";

describe("waitForLoginCallbackWithTimeout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("absorbs late waitForCode rejections after the timeout wins", async () => {
    let rejectWait!: (error: unknown) => void;
    const waitForCode = new Promise<string>((_resolve, reject) => {
      rejectWait = reject;
    });
    const unhandledRejections: unknown[] = [];
    const onUnhandledRejection = (reason: unknown): void => {
      unhandledRejections.push(reason);
    };
    process.on("unhandledRejection", onUnhandledRejection);

    try {
      const waitPromise = waitForLoginCallbackWithTimeout(
        waitForCode,
        1,
        "https://insecur.test/v1/auth/cli/authorize",
      );
      const timeoutExpectation = expect(waitPromise).rejects.toMatchObject({
        code: "auth.required",
        exitCode: EXIT_AUTH_REQUIRED,
      } satisfies Partial<CliError>);

      await vi.advanceTimersByTimeAsync(1000);
      await timeoutExpectation;

      rejectWait(
        new CliError({ code: "auth.invalid", message: "late callback", retryable: false }),
      );
      await vi.advanceTimersByTimeAsync(0);

      expect(unhandledRejections).toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandledRejection);
    }
  });
});
