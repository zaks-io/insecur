import { AUTH_ERROR_CODES } from "@insecur/domain";
import { CliError } from "../output/cli-error.js";
import { LOGIN_REMEDIATION } from "../output/cli-remediation.js";
import { EXIT_AUTH_REQUIRED } from "../output/exit-codes.js";
import { resolveSessionCredential } from "../session/memory-session.js";
import { defaultSessionStore, type SessionStore } from "../session/persisted-session.js";
import { resolveAgentCredentialFromEnv } from "./agent-credential-store.js";

/**
 * Resolves the acting credential for a command targeting `host`:
 * process memory, then INSECUR_SESSION_TOKEN, then a sealed derived-agent file,
 * then the persisted host-matching record.
 */
export async function requireSessionCredential(
  host: string,
  store?: SessionStore,
): Promise<string> {
  const fromMemoryOrEnv = resolveSessionCredential();
  if (fromMemoryOrEnv !== undefined) {
    return fromMemoryOrEnv;
  }
  const fromAgentFile = await resolveAgentCredentialFromEnv(host);
  if (fromAgentFile !== undefined) {
    return fromAgentFile;
  }
  const credential = (await (store ?? defaultSessionStore()).load(host))?.credential;
  if (credential === undefined) {
    throw new CliError(
      {
        code: AUTH_ERROR_CODES.required,
        message: "Authentication is required. Run insecur login first.",
        retryable: false,
      },
      { exitCode: EXIT_AUTH_REQUIRED, remediation: LOGIN_REMEDIATION },
    );
  }
  return credential;
}
