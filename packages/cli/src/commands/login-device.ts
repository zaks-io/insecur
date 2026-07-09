import type { ApiClient } from "../api/types.js";
import { hostname } from "node:os";
import type {
  CliDeviceAuthorizationData,
  CliDeviceTokenPollResult,
  CliSessionExchangeData,
} from "../api/auth-api-types.js";
import type { ErrorEnvelope, SuccessEnvelope } from "@insecur/domain";
import type { GlobalCliFlags } from "../cli-options.js";
import { CliError } from "../output/cli-error.js";
import { EXIT_AUTH_REQUIRED } from "../output/exit-codes.js";

const DEFAULT_POLL_INTERVAL_SECONDS = 5;
const SLOW_DOWN_BACKOFF_SECONDS = 5;

export interface DeviceLoginOptions {
  readonly agentSession: boolean;
  /** Injectable for tests so the polling loop does not sleep in real time. */
  readonly sleep?: (ms: number) => Promise<void>;
  /** Injectable clock for expiry so tests stay deterministic. */
  readonly now?: () => number;
  /** Injectable host label for requester context and deterministic tests. */
  readonly requesterHost?: string;
}

export interface DeviceLoginInput {
  readonly flags: GlobalCliFlags;
  readonly api: ApiClient;
  readonly host: string;
  readonly options: DeviceLoginOptions;
}

export type DeviceLoginResult =
  | { ok: true; credential: string; envelope: SuccessEnvelope<CliSessionExchangeData> }
  | { ok: false; envelope: ErrorEnvelope; httpStatus: number };

const CONSENT_PHISHING_WARNING = [
  "Security check: only continue if you started this login yourself, on this machine.",
  "insecur will never send you a link that already contains the code. If someone asked you to",
  "enter this code, or sent you a pre-filled approval link, stop and do not approve it.",
].join("\n");

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function renderDevicePrompt(flags: GlobalCliFlags, start: CliDeviceAuthorizationData): void {
  if (flags.quiet) {
    // Even in quiet mode the consent-phishing warning is shown, not suppressed (ADR-0010).
    process.stderr.write(`${CONSENT_PHISHING_WARNING}\n`);
    process.stderr.write(
      `Enter code ${start.userCode} at ${start.verificationUri} to complete insecur login.\n`,
    );
    return;
  }
  process.stderr.write("To finish signing in on another device:\n");
  process.stderr.write(`  1. Open ${start.verificationUri}\n`);
  process.stderr.write(`  2. Enter the code: ${start.userCode}\n`);
  if (start.verificationUriComplete !== undefined) {
    process.stderr.write(
      `  (or open ${start.verificationUriComplete} and confirm the code matches ${start.userCode})\n`,
    );
  }
  process.stderr.write(`\n${CONSENT_PHISHING_WARNING}\n\n`);
  process.stderr.write("Waiting for approval...\n");
}

function deviceExpiryError(host: string): CliError {
  return new CliError(
    {
      code: "auth.device_authorization_expired",
      message: `The device code expired before approval. Re-run insecur login --device against ${host}.`,
      retryable: false,
    },
    EXIT_AUTH_REQUIRED,
  );
}

/** A single poll result, plus the interval adjustment the slow_down backoff requires. */
type PollOutcome =
  | { readonly kind: "settled"; readonly result: DeviceLoginResult }
  | { readonly kind: "pending"; readonly intervalDeltaSeconds: number };

function evaluatePoll(poll: CliDeviceTokenPollResult): PollOutcome {
  if (!poll.ok) {
    return { kind: "settled", result: poll };
  }
  if (poll.status === "authenticated") {
    return {
      kind: "settled",
      result: { ok: true, credential: poll.credential, envelope: poll.envelope },
    };
  }
  return {
    kind: "pending",
    intervalDeltaSeconds: poll.status === "slow_down" ? SLOW_DOWN_BACKOFF_SECONDS : 0,
  };
}

async function pollUntilTerminal(
  input: DeviceLoginInput,
  start: CliDeviceAuthorizationData,
): Promise<DeviceLoginResult> {
  const sleep = input.options.sleep ?? defaultSleep;
  const now = input.options.now ?? Date.now;
  const deadline = now() + start.expiresInSeconds * 1000;
  let intervalSeconds =
    start.intervalSeconds > 0 ? start.intervalSeconds : DEFAULT_POLL_INTERVAL_SECONDS;

  for (;;) {
    if (now() >= deadline) {
      throw deviceExpiryError(input.host);
    }
    await sleep(intervalSeconds * 1000);
    const outcome = evaluatePoll(
      await input.api.pollCliDeviceToken({
        host: input.host,
        deviceCode: start.deviceCode,
        agentSession: input.options.agentSession,
      }),
    );
    if (outcome.kind === "settled") {
      return outcome.result;
    }
    intervalSeconds += outcome.intervalDeltaSeconds;
  }
}

export async function runDeviceLogin(input: DeviceLoginInput): Promise<DeviceLoginResult> {
  const requesterHost = (input.options.requesterHost ?? hostname()).trim().slice(0, 128);
  const started = await input.api.startCliDeviceAuthorization({
    host: input.host,
    agentSession: input.options.agentSession,
    requesterHost,
  });
  if (!started.ok) {
    return started;
  }
  const start = started.envelope.data;
  renderDevicePrompt(input.flags, start);
  return pollUntilTerminal(input, start);
}
