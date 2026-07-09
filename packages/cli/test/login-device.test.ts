import { successEnvelope, errorEnvelope } from "@insecur/domain";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ApiClient } from "../src/api/types.js";
import type { CliDeviceTokenPollResult } from "../src/api/auth-api-types.js";
import { runDeviceLogin } from "../src/commands/login-device.js";
import type { GlobalCliFlags } from "../src/cli-options.js";
import { CliError } from "../src/output/cli-error.js";
import { EXIT_AUTH_REQUIRED } from "../src/output/exit-codes.js";

const flags: GlobalCliFlags = {
  host: "https://insecur.test",
  orgId: undefined,
  projectId: undefined,
  envId: undefined,
  profile: undefined,
  profileId: undefined,
  configDir: undefined,
  json: false,
  quiet: false,
  verbose: false,
};

const noopSleep = (): Promise<void> => Promise.resolve();

interface DeviceApiOptions {
  readonly polls: readonly CliDeviceTokenPollResult[];
  readonly startFails?: boolean;
  readonly verificationUriComplete?: string;
}

function createDeviceApi(options: DeviceApiOptions): {
  api: ApiClient;
  pollCalls: { deviceCode: string; agentSession: boolean }[];
  startCalls: { host: string; agentSession: boolean; requesterHost: string }[];
} {
  const pollCalls: { deviceCode: string; agentSession: boolean }[] = [];
  const startCalls: { host: string; agentSession: boolean; requesterHost: string }[] = [];
  let pollIndex = 0;
  const api = {
    startCliDeviceAuthorization: async (input: {
      host: string;
      agentSession: boolean;
      requesterHost: string;
    }) => {
      startCalls.push(input);
      if (options.startFails === true) {
        return {
          ok: false as const,
          envelope: errorEnvelope({
            code: "auth.config_invalid",
            message: "Device authorization unavailable.",
            retryable: false,
          }),
          httpStatus: 503,
        };
      }
      return {
        ok: true as const,
        envelope: successEnvelope({
          deviceCode: "device_code_abc",
          userCode: "WDJB-MJHT",
          verificationUri: "https://workos.test/device",
          ...(options.verificationUriComplete === undefined
            ? {}
            : { verificationUriComplete: options.verificationUriComplete }),
          expiresInSeconds: 300,
          intervalSeconds: 5,
        }),
      };
    },
    pollCliDeviceToken: async (input: { deviceCode: string; agentSession: boolean }) => {
      pollCalls.push({ deviceCode: input.deviceCode, agentSession: input.agentSession });
      const next = options.polls[pollIndex] ?? options.polls[options.polls.length - 1];
      pollIndex += 1;
      return next as CliDeviceTokenPollResult;
    },
  } as unknown as ApiClient;
  return { api, pollCalls, startCalls };
}

const authenticatedPoll: CliDeviceTokenPollResult = {
  ok: true,
  status: "authenticated",
  credential: "credential_device_secret",
  envelope: successEnvelope({
    sessionId: "sess_device",
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  }),
};

describe("runDeviceLogin", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("prints the user code, verification URL, and consent-phishing warning", async () => {
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const { api } = createDeviceApi({ polls: [authenticatedPoll] });

    await runDeviceLogin({
      flags,
      api,
      host: "https://insecur.test",
      options: { agentSession: false, sleep: noopSleep },
    });

    const output = stderr.mock.calls.map((call) => String(call[0])).join("");
    expect(output).toContain("WDJB-MJHT");
    expect(output).toContain("https://workos.test/device");
    // Consent-phishing warning must be present, not optional (ADR-0010).
    expect(output.toLowerCase()).toContain("only continue if you started this login yourself");
    expect(output.toLowerCase()).toContain("do not approve");
  });

  it("shows the consent-phishing warning even in quiet mode", async () => {
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const { api } = createDeviceApi({ polls: [authenticatedPoll] });

    await runDeviceLogin({
      flags: { ...flags, quiet: true },
      api,
      host: "https://insecur.test",
      options: { agentSession: false, sleep: noopSleep },
    });

    const output = stderr.mock.calls.map((call) => String(call[0])).join("");
    expect(output.toLowerCase()).toContain("only continue if you started this login yourself");
  });

  it("polls through pending states and returns the credential on approval", async () => {
    const { api, pollCalls } = createDeviceApi({
      polls: [
        { ok: true, status: "authorization_pending" },
        { ok: true, status: "slow_down" },
        authenticatedPoll,
      ],
    });

    const result = await runDeviceLogin({
      flags,
      api,
      host: "https://insecur.test",
      options: { agentSession: false, sleep: noopSleep },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.credential).toBe("credential_device_secret");
      expect(result.envelope.data.sessionId).toBe("sess_device");
    }
    expect(pollCalls).toHaveLength(3);
    expect(pollCalls.every((call) => call.agentSession === false)).toBe(true);
  });

  it("binds agent intent at authorization start and forwards it to token polling", async () => {
    const { api, pollCalls, startCalls } = createDeviceApi({ polls: [authenticatedPoll] });

    await runDeviceLogin({
      flags,
      api,
      host: "https://insecur.test",
      options: { agentSession: true, requesterHost: "remote-agent-host", sleep: noopSleep },
    });

    expect(startCalls).toEqual([
      { agentSession: true, requesterHost: "remote-agent-host", host: "https://insecur.test" },
    ]);
    expect(pollCalls[0]?.agentSession).toBe(true);
  });

  it("never writes the credential to stdout, stderr, or logs on the success path", async () => {
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const { api } = createDeviceApi({ polls: [authenticatedPoll] });

    const result = await runDeviceLogin({
      flags,
      api,
      host: "https://insecur.test",
      options: { agentSession: false, sleep: noopSleep },
    });

    const written =
      stderr.mock.calls.map((call) => String(call[0])).join("") +
      stdout.mock.calls.map((call) => String(call[0])).join("");
    expect(written).not.toContain("credential_device_secret");
    // The credential lives only in the returned result for in-memory session establishment.
    expect(result.ok && result.credential).toBe("credential_device_secret");
    // JSON serialization of the returned envelope must not carry the credential.
    if (result.ok) {
      expect(JSON.stringify(result.envelope)).not.toContain("credential_device_secret");
    }
  });

  it("throws auth.device_authorization_expired (exit 3) when the deadline passes before approval", async () => {
    let currentTime = 1_000;
    const { api } = createDeviceApi({
      polls: [{ ok: true, status: "authorization_pending" }],
    });

    await expect(
      runDeviceLogin({
        flags,
        api,
        host: "https://insecur.test",
        options: {
          agentSession: false,
          sleep: noopSleep,
          now: () => {
            currentTime += 400_000;
            return currentTime;
          },
        },
      }),
    ).rejects.toMatchObject({
      code: "auth.device_authorization_expired",
      exitCode: EXIT_AUTH_REQUIRED,
    } satisfies Partial<CliError>);
  });

  it("returns the terminal error envelope on access denial without leaking a credential", async () => {
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const { api } = createDeviceApi({
      polls: [
        {
          ok: false,
          httpStatus: 403,
          envelope: errorEnvelope({
            code: "auth.device_authorization_denied",
            message: "The device-authorization request was denied.",
            retryable: false,
          }),
        },
      ],
    });

    const result = await runDeviceLogin({
      flags,
      api,
      host: "https://insecur.test",
      options: { agentSession: false, sleep: noopSleep },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.envelope.error.code).toBe("auth.device_authorization_denied");
    }
    const output = stderr.mock.calls.map((call) => String(call[0])).join("");
    expect(output).not.toContain("credential");
  });

  it("returns the start failure envelope when device authorization cannot begin", async () => {
    const { api } = createDeviceApi({ startFails: true, polls: [] });
    const result = await runDeviceLogin({
      flags,
      api,
      host: "https://insecur.test",
      options: { agentSession: false, sleep: noopSleep },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.envelope.error.code).toBe("auth.config_invalid");
    }
  });
});
