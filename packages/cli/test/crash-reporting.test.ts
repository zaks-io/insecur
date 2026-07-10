import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { CLI_ERROR_CODES } from "@insecur/domain";
import { DEFAULT_SENTRY_TRACES_SAMPLE_RATE } from "@insecur/observability";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveCliCommandFamily } from "../src/crash-command-family.js";
import { createCliCrashReporter, NOOP_CRASH_REPORTER } from "../src/crash-reporting.js";
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

    const reporter = await createCliCrashReporter({
      argv: ["node", "insecur", "secrets", "set"],
      env: { INSECUR_CLI_SENTRY_ENVIRONMENT: "preview" },
      sentryRuntime: {
        init,
        captureException,
        flush,
        getTraceData,
        startSpan,
      },
      userPreference: undefined,
      version: "0.1.0",
    });

    expect(reporter.enabled).toBe(true);
    expect(init).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: true,
        defaultIntegrations: false,
        integrations: [],
        maxBreadcrumbs: 0,
        sendDefaultPii: false,
        tracesSampleRate: DEFAULT_SENTRY_TRACES_SAMPLE_RATE,
      }),
    );
    expect(init).toHaveBeenCalledWith(
      expect.not.objectContaining({ dataCollection: expect.anything() }),
    );
    const initOptions = init.mock.calls[0]?.[0] as {
      beforeSend: (event: Record<string, unknown>) => Record<string, unknown>;
    };
    const sanitizedEvent = initOptions.beforeSend({
      event_id: "event-id",
      request: { url: SENTINEL, data: SENTINEL },
      breadcrumbs: [{ message: SENTINEL }],
      contexts: { runtime: { value: SENTINEL } },
      extra: { value: SENTINEL },
      tags: { command_family: "secrets.set", unsafe: SENTINEL },
      exception: {
        values: [{ type: SENTINEL, value: SENTINEL, stacktrace: { frames: [{ vars: SENTINEL }] } }],
      },
    });
    expect(JSON.stringify(sanitizedEvent)).not.toContain(SENTINEL);
    expect(sanitizedEvent).toMatchObject({
      event_id: "event-id",
      tags: { command_family: "secrets.set" },
      exception: { values: [{ type: "Error", value: "Unexpected CLI failure" }] },
    });
    const productionInit = vi.fn();
    await createCliCrashReporter({
      argv: ["node", "insecur", "secrets", "set"],
      env: {},
      sentryRuntime: { init: productionInit, captureException, flush },
      userPreference: undefined,
      version: "0.1.0",
    });
    expect(productionInit).toHaveBeenCalledWith(
      expect.objectContaining({ environment: "production" }),
    );
    expect(productionInit).toHaveBeenCalledWith(
      expect.not.objectContaining({ dataCollection: expect.anything() }),
    );
    await reporter.captureException(new Error(SENTINEL), { source: "unexpected" });
    const captured = captureException.mock.calls.at(-1)?.[0] as Error;
    expect(captured.name).toBe("Error");
    expect(captured.message).toBe("Unexpected CLI failure");
    expect(captured.message).not.toContain(SENTINEL);
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
          message: "Unexpected CLI failure (Error)",
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
