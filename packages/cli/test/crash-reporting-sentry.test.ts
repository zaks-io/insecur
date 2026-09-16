import * as Sentry from "@sentry/node";
import { afterEach, describe, expect, it } from "vitest";
import { createCliCrashReporter } from "../src/crash-reporting.js";

const UNSAFE_SENTINEL = "raw-event-baggage-must-be-dropped";

describe("CLI crash reporting through the Sentry SDK", () => {
  afterEach(async () => {
    await Sentry.close(100);
  });

  it("serializes scrubbed original diagnostics without request, user, tag, or local baggage", async () => {
    const envelopes: string[] = [];
    const reporter = await createCliCrashReporter({
      argv: ["node", "insecur", "config", "show"],
      env: { INSECUR_CLI_SENTRY_DSN: "https://public@example.invalid/1" },
      sentryRuntime: {
        init(options) {
          Sentry.init({
            ...options,
            transport: (transportOptions) =>
              Sentry.createTransport(transportOptions, async (request) => {
                envelopes.push(
                  typeof request.body === "string"
                    ? request.body
                    : new TextDecoder().decode(request.body),
                );
                return { statusCode: 200 };
              }),
          });
        },
        captureException(error, context) {
          Sentry.withScope((scope) => {
            scope.addEventProcessor(addPrivateEventData);
            Sentry.captureException(error, context);
          });
        },
        flush: Sentry.flush,
      },
      version: "0.2.0",
    });
    const error = new SyntaxError("Config parse failed for alice@example.com");
    error.stack =
      "SyntaxError: Config parse failed for alice@example.com\n" +
      "    at parseConfig (/app/dist/config.js:42:7)";

    await reporter.captureException(error, { source: "unexpected" });
    await reporter.flush(2_000);

    const event = capturedEvent(envelopes);
    expect(event.exception).toMatchObject({
      values: [
        {
          type: "SyntaxError",
          value: "Config parse failed for [redacted-email]",
          stacktrace: {
            frames: [
              {
                filename: "/app/dist/config.js",
                function: "parseConfig",
                lineno: 42,
                colno: 7,
              },
            ],
          },
        },
      ],
    });
    expect(event.tags).toMatchObject({
      command_family: "config.show",
      crash_source: "unexpected",
      service: "insecur-cli",
    });
    expect(event).not.toHaveProperty("request");
    expect(event).not.toHaveProperty("user");
    expect(JSON.stringify(event)).not.toContain(UNSAFE_SENTINEL);
    expect(JSON.stringify(event)).not.toContain("vars");
  });
});

function capturedEvent(envelopes: readonly string[]): Record<string, unknown> {
  for (const line of envelopes.flatMap((envelope) => envelope.split("\n"))) {
    const value = parseEnvelopeLine(line);
    if (value?.exception !== undefined) return value;
  }
  throw new Error("Sentry transport did not receive an error event");
}

function parseEnvelopeLine(line: string): Record<string, unknown> | undefined {
  try {
    return JSON.parse(line) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function addPrivateEventData(event: Sentry.Event): Sentry.Event {
  return {
    ...event,
    request: { data: UNSAFE_SENTINEL, url: `https://${UNSAFE_SENTINEL}.invalid` },
    user: { email: `${UNSAFE_SENTINEL}@example.com` },
    tags: { ...event.tags, unsafe: UNSAFE_SENTINEL },
    exception: {
      values: event.exception?.values?.map((value) => ({
        ...value,
        stacktrace: {
          frames: value.stacktrace?.frames?.map((frame) => ({
            ...frame,
            vars: { unsafe: UNSAFE_SENTINEL },
          })),
        },
      })),
    },
  };
}
