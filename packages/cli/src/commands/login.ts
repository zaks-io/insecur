import { successEnvelope, type ResolvedTargetEcho } from "@insecur/domain";
import type { ApiClient } from "../api/types.js";
import type { GlobalCliFlags } from "../cli-options.js";
import type { ResolvedCliContext } from "../config/load-cli-context.js";
import { cliErrorFromEnvelope } from "../output/cli-error.js";
import { renderSuccess } from "../output/render.js";
import { asEchoId, buildEnvelopeMeta } from "../output/target-echo.js";
import { setMemorySession } from "../session/memory-session.js";
import { defaultSessionStore, type SessionStore } from "../session/persisted-session.js";
import { runDeviceLogin, type DeviceLoginOptions } from "./login-device.js";
import { runBrowserPkceLogin } from "./login-pkce.js";
import { runManagedLoginShell } from "./login-shell.js";

export interface LoginCommandOptions {
  readonly shell: boolean;
  readonly openBrowser: boolean;
  readonly persist: boolean;
  /** Device-authorization flow for headless/remote shells (ADR-0010). Defaults to loopback PKCE. */
  readonly device?: boolean;
  /** `--agent-session` mints the resulting session agent-marked (only with --device). */
  readonly agentSession?: boolean;
  readonly callbackPort?: number;
  readonly callbackTimeoutSeconds?: number;
  readonly sessionStore?: SessionStore;
  /** Test-only overrides for the device polling loop. */
  readonly deviceLoginOverrides?: Pick<DeviceLoginOptions, "sleep" | "now">;
}

async function exchangeLoginSession(
  flags: GlobalCliFlags,
  api: ApiClient,
  host: string,
  commandOptions: LoginCommandOptions,
) {
  if (commandOptions.device === true) {
    return runDeviceLogin({
      flags,
      api,
      host,
      options: {
        agentSession: commandOptions.agentSession === true,
        ...(commandOptions.deviceLoginOverrides ?? {}),
      },
    });
  }
  return runBrowserPkceLogin({
    flags,
    api,
    host,
    options: {
      openBrowser: commandOptions.openBrowser,
      ...(commandOptions.callbackPort === undefined
        ? {}
        : { callbackPort: commandOptions.callbackPort }),
      ...(commandOptions.callbackTimeoutSeconds === undefined
        ? {}
        : { callbackTimeoutSeconds: commandOptions.callbackTimeoutSeconds }),
    },
  });
}

interface MemoryLoginResult {
  readonly flags: GlobalCliFlags;
  readonly host: string;
  readonly credential: string;
  readonly sessionId: string;
  readonly expiresAt: string;
  readonly requestId: Parameters<typeof buildEnvelopeMeta>[0]["requestId"];
}

async function persistLoginSession(result: MemoryLoginResult, store: SessionStore): Promise<void> {
  await store.save({
    credential: result.credential,
    sessionId: result.sessionId,
    expiresAt: result.expiresAt,
    host: result.host,
  });
  const notice = store.notice();
  if (notice !== null && !result.flags.quiet) {
    process.stderr.write(`${notice.summary}\n`);
  }
}

function renderLoginSuccess(result: MemoryLoginResult, persisted: boolean): void {
  const resolvedTargets: ResolvedTargetEcho[] = [
    { type: "session", id: asEchoId(result.sessionId) },
  ];
  renderSuccess(
    successEnvelope(
      { sessionId: result.sessionId, expiresAt: result.expiresAt, host: result.host, persisted },
      buildEnvelopeMeta({ requestId: result.requestId, resolvedTargets }),
    ),
    result.flags,
    () =>
      `Logged in (session ${result.sessionId}, expires ${result.expiresAt}${
        persisted ? "" : ", memory-only"
      }).`,
  );
}

export async function runLoginCommand(
  flags: GlobalCliFlags,
  api: ApiClient,
  context: ResolvedCliContext,
  commandOptions: LoginCommandOptions,
): Promise<number> {
  const { host } = context.scope;
  const exchanged = await exchangeLoginSession(flags, api, host, commandOptions);
  if (!exchanged.ok) {
    throw cliErrorFromEnvelope(exchanged.envelope);
  }
  const { sessionId, expiresAt } = exchanged.envelope.data;
  if (commandOptions.shell) {
    return runManagedLoginShell({
      flags,
      credential: exchanged.credential,
      host,
      sessionId,
      expiresAt,
    });
  }
  const result: MemoryLoginResult = {
    flags,
    host,
    credential: exchanged.credential,
    sessionId,
    expiresAt,
    requestId: exchanged.envelope.meta?.requestId,
  };
  setMemorySession({ credential: result.credential, sessionId, expiresAt });
  if (commandOptions.persist) {
    await persistLoginSession(result, commandOptions.sessionStore ?? defaultSessionStore());
  }
  renderLoginSuccess(result, commandOptions.persist);
  return 0;
}
