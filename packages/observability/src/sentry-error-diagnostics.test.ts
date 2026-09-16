import { describe, expect, it } from "vitest";
import { prepareSentryErrorDiagnostics } from "./sentry-error-diagnostics.js";

describe("prepareSentryErrorDiagnostics", () => {
  it.each(["", ":", "://"])(
    "preserves long non-URL diagnostics ending in %s without repeated scheme scans",
    (suffix) => {
      const message = "a".repeat(100_000) + suffix;
      expect(prepareSentryErrorDiagnostics({ message }).message).toBe(message);
    },
  );

  it("keeps distinct error messages and complete stack frames", () => {
    const leaseError = prepareSentryErrorDiagnostics({
      message: "Claim lease expired",
      level: "error",
      exception: {
        values: [
          {
            type: "LeaseExpiredError",
            value: "Claim lease expired",
            mechanism: { type: "generic", handled: false },
            stacktrace: {
              frames: [
                { filename: "lease.ts", function: "claimLease", lineno: 41, colno: 9 },
                { filename: "worker.ts", function: "runBackup", lineno: 88, colno: 3 },
              ],
            },
          },
        ],
      },
    });
    const rateLimitError = prepareSentryErrorDiagnostics({
      message: "R2 upload failed with HTTP 429",
      exception: { values: [{ type: "R2Error", value: "R2 upload failed with HTTP 429" }] },
    });

    expect(leaseError.message).toBe("Claim lease expired");
    expect(rateLimitError.message).toBe("R2 upload failed with HTTP 429");
    expect(leaseError.exception?.values).toHaveLength(1);
    expect(leaseError.exception?.values[0]?.stacktrace?.frames).toHaveLength(2);
    expect(leaseError.exception?.values[0]).toMatchObject({
      type: "LeaseExpiredError",
      value: "Claim lease expired",
      mechanism: { type: "generic", handled: false },
    });
  });

  it("keeps stack and debug image fields needed for source maps", () => {
    const result = prepareSentryErrorDiagnostics({
      exception: {
        values: [
          {
            stacktrace: {
              frames: [
                {
                  filename: "worker.js",
                  abs_path: "https://cdn.example.test/assets/worker.js",
                  function: "handleRequest",
                  module: "worker",
                  lineno: 12,
                  colno: 34,
                  in_app: true,
                  debug_id: "67df1c1d-72a1-4a3f-a47b-717f9a3e87a9",
                },
              ],
            },
          },
        ],
      },
      debug_meta: {
        images: [
          {
            type: "sourcemap",
            code_file: "https://cdn.example.test/assets/worker.js",
            debug_id: "67df1c1d-72a1-4a3f-a47b-717f9a3e87a9",
          },
        ],
      },
    });

    expect(result.exception?.values[0]?.stacktrace?.frames[0]).toEqual({
      filename: "worker.js",
      abs_path: "https://cdn.example.test/assets/worker.js",
      function: "handleRequest",
      module: "worker",
      lineno: 12,
      colno: 34,
      in_app: true,
      debug_id: "67df1c1d-72a1-4a3f-a47b-717f9a3e87a9",
    });
    expect(result.debug_meta?.images).toEqual([
      {
        type: "sourcemap",
        code_file: "https://cdn.example.test/assets/worker.js",
        debug_id: "67df1c1d-72a1-4a3f-a47b-717f9a3e87a9",
      },
    ]);
  });

  it("scrubs PII and credentials without retaining arbitrary event data", () => {
    const input = {
      message:
        "alice@example.com from 203.0.113.42 and 2001:db8::1 at /Users/alice/app " +
        "opened https://alice:secret@example.test/path?token=abc#private " +
        'with password=hunter2, "token": "ey.long.secret", Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig, ' +
        'and payload={"password":"hunter2","access_token":"access-secret","refresh_token":"refresh-secret"}',
      exception: {
        values: [
          {
            type: "AuthError",
            value: "Token expired",
            mechanism: { type: "generic", handled: true, data: { password: "hunter2" } },
            stacktrace: {
              frames: [
                {
                  filename: "/home/bob/project/auth.ts",
                  function: "authenticate",
                  vars: { password: "hunter2" },
                  context_line: "authenticate(password)",
                },
              ],
            },
          },
        ],
      },
      request: { data: "private request" },
      user: { email: "alice@example.com" },
      extra: { password: "hunter2" },
    };
    const before = structuredClone(input);

    const result = prepareSentryErrorDiagnostics(input);
    const serialized = JSON.stringify(result);

    expect(result.exception?.values[0]?.value).toBe("Token expired");
    expect(result.message).toContain(
      "https://[redacted]@example.test/path?token=%5Bredacted%5D#private",
    );
    expect(result.message).toContain("/Users/[redacted-user]/app");
    expect(result.message).toContain("password=[redacted]");
    expect(result.message).toContain('"access_token":"[redacted]"');
    expect(result.message).toContain('"refresh_token":"[redacted]"');
    expect(result.message).toContain("Bearer [redacted]");
    expect(serialized).not.toMatch(/alice@example\.com|203\.0\.113\.42|2001:db8::1|hunter2/u);
    expect(result).not.toHaveProperty("request");
    expect(result).not.toHaveProperty("user");
    expect(result).not.toHaveProperty("extra");
    expect(result.exception?.values[0]?.mechanism).not.toHaveProperty("data");
    expect(result.exception?.values[0]?.stacktrace?.frames[0]).not.toHaveProperty("vars");
    expect(result.exception?.values[0]?.stacktrace?.frames[0]).not.toHaveProperty("context_line");
    expect(input).toEqual(before);
  });

  it("does not mistake ordinary colon-delimited error text for IPv6", () => {
    expect(prepareSentryErrorDiagnostics({ message: "Error::failure, token expired" })).toEqual({
      message: "Error::failure, token expired",
    });
  });

  it("scrubs quoted credential values containing escaped quotes", () => {
    const message = JSON.stringify({ password: 'one"two', access_token: "one'two" });

    expect(prepareSentryErrorDiagnostics({ message })).toEqual({
      message: '{"password":"[redacted]","access_token":"[redacted]"}',
    });
  });

  it("scrubs Basic auth and plain token assignments", () => {
    const message = "token: abc123 Authorization: Basic dXNlcjpwYXNz token expired";

    expect(prepareSentryErrorDiagnostics({ message })).toEqual({
      message: "token: [redacted] Authorization: [redacted] token expired",
    });
  });

  it("redacts sensitive URL parameters while retaining benign query and fragment data", () => {
    const message =
      "https://example.test/callback?retry=2&access_token=secret&error=alice%40example.com" +
      "#state=ready&token=fragment-secret";

    expect(prepareSentryErrorDiagnostics({ message })).toEqual({
      message:
        "https://example.test/callback?retry=2&access_token=%5Bredacted%5D&error=%5Bredacted-email%5D" +
        "#state=ready&token=%5Bredacted%5D",
    });
    expect(
      prepareSentryErrorDiagnostics({ message: "https://example.test/task?retry=2#section" }),
    ).toEqual({ message: "https://example.test/task?retry=2#section" });
    expect(
      prepareSentryErrorDiagnostics({
        message: "https://example.test/task?token=secret&retry=2",
      }),
    ).toEqual({
      message: "https://example.test/task?token=%5Bredacted%5D&retry=2",
    });
  });

  it("scrubs personal information in URL query and fragment names", () => {
    const message = "https://example.test/task?alice%40example.com=1&retry=2#203.0.113.42=ready";
    expect(prepareSentryErrorDiagnostics({ message })).toEqual({
      message: "https://example.test/task?%5Bredacted-email%5D=1&retry=2#%5Bredacted-ip%5D=ready",
    });
  });

  it("retains stack identifiers that resemble IPv6 and bare unspecified addresses", () => {
    const result = prepareSentryErrorDiagnostics({
      message: "listener bound to :: then failed at 2001:db8::1",
      exception: {
        values: [
          {
            stacktrace: { frames: [{ function: "a::b", module: "dead::beef" }] },
          },
        ],
      },
    });

    expect(result.message).toBe("listener bound to :: then failed at [redacted-ip]");
    expect(result.exception?.values[0]?.stacktrace?.frames[0]).toMatchObject({
      function: "a::b",
      module: "dead::beef",
    });
  });
});
