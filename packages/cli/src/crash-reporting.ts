import process from "node:process";
import { DEFAULT_SENTRY_TRACES_SAMPLE_RATE } from "@insecur/observability";
import { resolveCliCommandFamily } from "./crash-command-family.js";
import { loadUserConfig } from "./config/user-config.js";
import { cliVersion } from "./version.js";

const DEFAULT_INSECUR_CLI_SENTRY_DSN =
  "https://5fec3d59dc9549daf4e20be46b93c729@o4509987229859840.ingest.us.sentry.io/4511677913366528";
const CRASH_REPORTS_ENV = "INSECUR_CRASH_REPORTS";
const CLI_SENTRY_DSN_ENV = "INSECUR_CLI_SENTRY_DSN";
const CLI_SENTRY_ENVIRONMENT_ENV = "INSECUR_CLI_SENTRY_ENVIRONMENT";

type CrashSource = "unexpected" | "uncaughtException";

export interface CliCrashReporter {
  readonly enabled: boolean;
  readonly captureException: (
    error: unknown,
    options: { readonly source: CrashSource },
  ) => Promise<void>;
  readonly flush: (timeoutMs: number) => Promise<void>;
  readonly traceHeaders: () => Record<string, string>;
  readonly withCommandTrace: <TResult>(argv: readonly string[], callback: () => TResult) => TResult;
}

interface SentryRuntime {
  readonly init: (options: Record<string, unknown>) => unknown;
  readonly captureException: (error: Error, context?: Record<string, unknown>) => unknown;
  readonly flush: (timeoutMs: number) => Promise<unknown>;
  readonly getTraceData?: () => {
    readonly "sentry-trace"?: string;
    readonly baggage?: string;
  };
  readonly startSpan?: <TResult>(
    context: { readonly name: string; readonly op: string },
    callback: () => TResult,
  ) => TResult;
  readonly onUncaughtExceptionIntegration?: (options: {
    readonly exitEvenIfOtherHandlersAreRegistered: true;
  }) => unknown;
  readonly onUnhandledRejectionIntegration?: (options: { readonly mode: "strict" }) => unknown;
}

interface CrashReporterOptions {
  readonly argv: readonly string[];
  readonly env?: NodeJS.ProcessEnv;
  readonly sentryRuntime?: SentryRuntime;
  readonly userPreference?: "on" | "off";
  readonly version?: string;
}

interface CrashReporterSettings {
  readonly argv: readonly string[];
  readonly dsn: string;
  readonly env: NodeJS.ProcessEnv;
  readonly version: string;
}

export const NOOP_CRASH_REPORTER: CliCrashReporter = {
  enabled: false,
  captureException: () => Promise.resolve(),
  flush: () => Promise.resolve(),
  traceHeaders: () => ({}),
  withCommandTrace: (_argv, callback) => callback(),
};

export async function createCliCrashReporter(
  options: CrashReporterOptions,
): Promise<CliCrashReporter> {
  const settings = await resolveCrashReporterSettings(options);
  if (settings === null) {
    return NOOP_CRASH_REPORTER;
  }

  try {
    const runtime = options.sentryRuntime ?? (await importSentryRuntime());
    runtime.init(sentryOptions(settings, runtime));
    return activeCrashReporter(runtime);
  } catch {
    return NOOP_CRASH_REPORTER;
  }
}

async function resolveCrashReporterSettings(
  options: CrashReporterOptions,
): Promise<CrashReporterSettings | null> {
  const env = options.env ?? process.env;
  const version = options.version ?? cliVersion();
  const userPreference = options.userPreference ?? (await loadCrashReportsPreference());
  if (hasNoCrashReportsFlag(options.argv)) {
    return null;
  }
  if (!shouldEnableCrashReports({ env, userPreference, version })) {
    return null;
  }
  return {
    argv: options.argv,
    dsn: optional(env[CLI_SENTRY_DSN_ENV]) ?? DEFAULT_INSECUR_CLI_SENTRY_DSN,
    env,
    version,
  };
}

function sentryOptions(
  settings: CrashReporterSettings,
  runtime: SentryRuntime,
): Record<string, unknown> {
  // Prelaunch telemetry posture: default integrations and full-fidelity events so we can see
  // what the SDK actually captures. Re-tightening before go-live is tracked in Linear.
  return {
    dsn: settings.dsn,
    enabled: true,
    environment: optional(settings.env[CLI_SENTRY_ENVIRONMENT_ENV]) ?? "production",
    initialScope: { tags: sentryTags(settings.argv) },
    integrations: crashHandlingIntegrations(runtime),
    release: `insecur-cli@${settings.version}`,
    sendDefaultPii: true,
    tracesSampleRate: DEFAULT_SENTRY_TRACES_SAMPLE_RATE,
  };
}

function crashHandlingIntegrations(runtime: SentryRuntime): unknown[] {
  const integrations: unknown[] = [];
  if (runtime.onUncaughtExceptionIntegration) {
    integrations.push(
      runtime.onUncaughtExceptionIntegration({ exitEvenIfOtherHandlersAreRegistered: true }),
    );
  }
  if (runtime.onUnhandledRejectionIntegration) {
    integrations.push(runtime.onUnhandledRejectionIntegration({ mode: "strict" }));
  }
  return integrations;
}

function sentryTags(argv: readonly string[]): Record<string, string> {
  return {
    command_family: resolveCliCommandFamily(argv),
    node_major: readNodeMajor(process.version),
    platform: process.platform,
    service: "insecur-cli",
  };
}

function activeCrashReporter(runtime: SentryRuntime): CliCrashReporter {
  return {
    enabled: true,
    captureException(error, captureOptions) {
      try {
        runtime.captureException(toErrorForCapture(error), {
          tags: { crash_source: captureOptions.source },
        });
      } catch {
        // Crash reporting must not change CLI behavior.
      }
      return Promise.resolve();
    },
    async flush(timeoutMs) {
      try {
        await runtime.flush(timeoutMs);
      } catch {
        // Crash reporting must not change CLI behavior.
      }
    },
    traceHeaders() {
      return sentryTraceHeaders(runtime);
    },
    withCommandTrace(argv, callback) {
      const startSpan = runtime.startSpan;
      if (startSpan === undefined) {
        return callback();
      }
      return startSpan(
        { name: `insecur ${resolveCliCommandFamily(argv)}`, op: "cli.command" },
        callback,
      );
    },
  };
}

function sentryTraceHeaders(runtime: SentryRuntime): Record<string, string> {
  const traceData = runtime.getTraceData?.();
  const sentryTrace = traceData?.["sentry-trace"];
  const baggage = traceData?.baggage;
  return {
    ...(sentryTrace ? { "sentry-trace": sentryTrace } : {}),
    ...(baggage ? { baggage } : {}),
  };
}

async function loadCrashReportsPreference(): Promise<"on" | "off" | undefined> {
  try {
    return (await loadUserConfig()).crashReports;
  } catch {
    return undefined;
  }
}

function shouldEnableCrashReports(input: {
  readonly env: NodeJS.ProcessEnv;
  readonly userPreference: "on" | "off" | undefined;
  readonly version: string;
}): boolean {
  const envPreference = parseCrashReportsEnv(input.env[CRASH_REPORTS_ENV]);
  if (envPreference !== undefined) {
    return envPreference === "on";
  }
  if (input.userPreference === "off") {
    return false;
  }
  return !isUnreleasedTestRun(input.env, input.version);
}

function isUnreleasedTestRun(env: NodeJS.ProcessEnv, version: string): boolean {
  const hasExplicitDsn = optional(env[CLI_SENTRY_DSN_ENV]) !== undefined;
  return !hasExplicitDsn && (version === "0.0.0" || env.VITEST === "true");
}

function parseCrashReportsEnv(value: string | undefined): "on" | "off" | undefined {
  const normalized = optional(value)?.toLowerCase();
  if (normalized === undefined) {
    return undefined;
  }
  if (["0", "false", "no", "off", "disabled"].includes(normalized)) {
    return "off";
  }
  if (["1", "true", "yes", "on", "enabled"].includes(normalized)) {
    return "on";
  }
  return undefined;
}

async function importSentryRuntime(): Promise<SentryRuntime> {
  const runtime = await import("@sentry/node");
  return runtime;
}

function toErrorForCapture(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }
  const captured = new Error("NonErrorThrown");
  captured.name = "NonErrorThrown";
  return captured;
}

function optional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed === "" ? undefined : trimmed;
}

function readNodeMajor(version: string): string {
  const match = /^v?(\d+)/u.exec(version);
  return match?.[1] ?? "unknown";
}

function hasNoCrashReportsFlag(argv: readonly string[]): boolean {
  return argv.slice(2).some((arg) => arg === "--no-crash-reports");
}
