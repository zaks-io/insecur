import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { CLI_ERROR_CODES } from "@insecur/domain";
import { DEFAULT_SENTRY_TRACES_SAMPLE_RATE } from "@insecur/observability";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveCliCommandFamily } from "../src/crash-command-family.js";
import { createCliCrashReporter, NOOP_CRASH_REPORTER } from "../src/crash-reporting.js";
import { prepareCliCrashEvent, type SentryEventLike } from "../src/crash-reporting-event.js";
import { runCli } from "../src/program.js";
import { EXIT_UNEXPECTED } from "../src/output/exit-codes.js";
import { USER_CONFIG_FILE } from "../src/config/paths.js";
import { createIsolatedHome } from "./helpers/isolated-home.js";

const SENTINEL = "sentinel-plaintext-must-not-leave-cli";

function captureOutput(): {
  readonly stdout: { value: string };
  readonly stderr: { value: string };
} {
  const stdout = { value: "" };
  const stderr = { value: "" };
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    stdout.value += String(chunk);
    return true;
  });
  vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
    stderr.value += String(chunk);
    return true;
  });
  return { stdout, stderr };
}

describe("CLI crash reporting", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("redacts event payloads before sending them to Sentry", () => {
    const event: SentryEventLike = {
      message: SENTINEL,
      exception: {
        values: [
          {
            type: "Error",
            value: SENTINEL,
            stacktrace: {
              frames: [
                {
                  abs_path: `/Users/example/project/${SENTINEL}.ts`,
                  context_line: SENTINEL,
                  filename:
                    "/Users/example/project/packages/cli/src/output/unexpected-cli-error.ts",
                  module: SENTINEL,
                  post_context: [SENTINEL],
                  pre_context: [SENTINEL],
                  vars: { raw: SENTINEL },
                },
              ],
            },
          },
        ],
      },
      request: { headers: { authorization: SENTINEL } },
      breadcrumbs: [{ message: SENTINEL }],
      contexts: { runtime: { raw: SENTINEL } },
      extra: { raw: SENTINEL },
      fingerprint: [SENTINEL],
      logentry: { message: SENTINEL },
      modules: { [SENTINEL]: SENTINEL },
      server_name: SENTINEL,
      tags: {
        command_family: "secrets.set",
        service: "insecur-cli",
        variableKey: SENTINEL,
      },
      threads: { values: [{ name: SENTINEL }] },
      user: { id: SENTINEL },
    };

    const sanitized = prepareCliCrashEvent(event);

    expect(JSON.stringify(sanitized)).not.toContain(SENTINEL);
    expect(sanitized).toMatchObject({
      message: "[redacted by insecur]",
      exception: {
        values: [
          {
            type: "Error",
            value: "[redacted by insecur]",
            stacktrace: {
              frames: [{ filename: "packages/cli/src/output/unexpected-cli-error.ts" }],
            },
          },
        ],
      },
      breadcrumbs: [],
      extra: {},
      tags: {
        command_family: "secrets.set",
        service: "insecur-cli",
      },
    });
    expect(sanitized.exception?.values?.[0]?.stacktrace?.frames?.[0]?.module).toBeUndefined();
    expect(sanitized.request).toBeUndefined();
    expect(sanitized.user).toBeUndefined();
  });

  it("resolves command family without keeping raw argv values", () => {
    expect(
      resolveCliCommandFamily([
        "node",
        "insecur",
        "--host",
        `https://${SENTINEL}.test`,
        "secrets",
        "set",
        "--variable-key",
        SENTINEL,
      ]),
    ).toBe("secrets.set");
    expect(resolveCliCommandFamily(["node", "insecur", "run", "--", "printenv"])).toBe("run");
  });

  it("initializes default-on crash reporting for release builds", async () => {
    const init = vi.fn();
    const captureException = vi.fn();
    const flush = vi.fn().mockResolvedValue(true);
    const getTraceData = vi.fn(() => ({
      "sentry-trace": "trace-id-span-id-1",
      baggage: "sentry-release=insecur-cli",
    }));
    const startSpan = vi.fn((_context: unknown, callback: () => unknown) => callback());
    const onUncaughtExceptionIntegration = vi.fn(() => ({ name: "OnUncaughtException" }));
    const onUnhandledRejectionIntegration = vi.fn(() => ({ name: "OnUnhandledRejection" }));

    const reporter = await createCliCrashReporter({
      argv: ["node", "insecur", "secrets", "set"],
      env: {},
      sentryRuntime: {
        init,
        captureException,
        flush,
        getTraceData,
        onUncaughtExceptionIntegration,
        onUnhandledRejectionIntegration,
        startSpan,
      },
      userPreference: undefined,
      version: "0.1.0",
    });

    expect(reporter.enabled).toBe(true);
    expect(init).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultIntegrations: false,
        enabled: true,
        sendDefaultPii: false,
        tracesSampleRate: DEFAULT_SENTRY_TRACES_SAMPLE_RATE,
      }),
    );
    expect(onUncaughtExceptionIntegration).toHaveBeenCalledWith({
      exitEvenIfOtherHandlersAreRegistered: true,
    });
    expect(onUnhandledRejectionIntegration).toHaveBeenCalledWith({ mode: "strict" });
    expect(reporter.traceHeaders()).toEqual({
      "sentry-trace": "trace-id-span-id-1",
      baggage: "sentry-release=insecur-cli",
    });
    const traced = reporter.withCommandTrace(["node", "insecur", "secrets", "set"], () => 42);
    expect(traced).toBe(42);
    expect(startSpan).toHaveBeenCalledWith(
      { name: "insecur secrets.set", op: "cli.command" },
      expect.any(Function),
    );
  });

  it("honors env and per-command opt-outs", async () => {
    const init = vi.fn();
    const runtime = {
      init,
      captureException: vi.fn(),
      flush: vi.fn().mockResolvedValue(true),
    };

    await expect(
      createCliCrashReporter({
        argv: ["node", "insecur", "whoami"],
        env: { INSECUR_CRASH_REPORTS: "off" },
        sentryRuntime: runtime,
        version: "0.1.0",
      }),
    ).resolves.toMatchObject({ enabled: false });
    await expect(
      createCliCrashReporter({
        argv: ["node", "insecur", "whoami", "--no-crash-reports"],
        env: {},
        sentryRuntime: runtime,
        version: "0.1.0",
      }),
    ).resolves.toMatchObject({ enabled: false });
    expect(init).not.toHaveBeenCalled();
  });

  it("does not let reporter initialization prevent a CLI command from running", async () => {
    const reporter = await createCliCrashReporter({
      argv: ["node", "insecur", "whoami"],
      env: {},
      sentryRuntime: {
        init: () => {
          throw new Error("invalid Sentry configuration");
        },
        captureException: vi.fn(),
        flush: vi.fn().mockResolvedValue(true),
      },
      version: "0.1.0",
    });

    expect(reporter).toBe(NOOP_CRASH_REPORTER);
  });

  it("captures only unexpected runCli failures and keeps terminal output sanitized", async () => {
    const isolatedHome = await createIsolatedHome("insecur-crash-reporting-home-");
    const configDir = path.join(isolatedHome.homeDir, ".insecur");
    await mkdir(configDir, { recursive: true });
    await writeFile(path.join(configDir, USER_CONFIG_FILE), "{", "utf8");
    const output = captureOutput();
    const captureException = vi.fn().mockResolvedValue(undefined);
    const flush = vi.fn().mockResolvedValue(undefined);

    try {
      const exitCode = await runCli(["node", "insecur", "config", "show", "--json"], {
        crashReporter: {
          enabled: true,
          captureException,
          flush,
          traceHeaders: () => ({}),
          withCommandTrace: (_argv, callback) => callback(),
        },
      });

      expect(exitCode).toBe(EXIT_UNEXPECTED);
      const parsed = JSON.parse(output.stderr.value) as {
        ok: boolean;
        error: { code: string; message: string };
      };
      expect(parsed).toMatchObject({
        ok: false,
        error: {
          code: CLI_ERROR_CODES.unexpectedError,
          message: "Unexpected CLI failure (SyntaxError)",
        },
      });
      expect(captureException).toHaveBeenCalledWith(expect.any(SyntaxError), {
        source: "unexpected",
      });
      expect(flush).toHaveBeenCalledWith(2_000);
      expect(output.stderr.value).not.toContain("Unexpected end of JSON input");
    } finally {
      isolatedHome.restore();
    }
  });
});
