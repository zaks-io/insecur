import { createHash, randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { spawn } from "node:child_process";
import { bytesToBase64Url } from "@insecur/domain";
import type { ApiClient } from "../api/types.js";
import type { GlobalCliFlags } from "../cli-options.js";
import { CliError } from "../output/cli-error.js";
import { EXIT_AUTH_REQUIRED, EXIT_VALIDATION } from "../output/exit-codes.js";

export interface BrowserPkceLoginOptions {
  readonly openBrowser: boolean;
  readonly callbackPort?: number;
}

export interface BrowserPkceLoginInput {
  readonly flags: GlobalCliFlags;
  readonly api: ApiClient;
  readonly host: string;
  readonly options: BrowserPkceLoginOptions;
}

export type BrowserPkceLoginResult = Awaited<ReturnType<ApiClient["exchangeCliPkceSession"]>>;

interface CallbackServer {
  readonly redirectUri: string;
  readonly waitForCode: Promise<string>;
  close(): Promise<void>;
}

interface PkcePair {
  readonly verifier: string;
  readonly challenge: string;
}

function createPkcePair(): PkcePair {
  const verifier = randomBytes(32).toString("base64url");
  const digest = createHash("sha256").update(verifier).digest();
  return { verifier, challenge: bytesToBase64Url(digest) };
}

function createState(): string {
  return randomBytes(32).toString("base64url");
}

function browserOpenCommand(url: string): readonly [string, readonly string[]] {
  if (process.platform === "darwin") {
    return ["open", [url]];
  }
  if (process.platform === "win32") {
    return ["cmd", ["/c", "start", "", url]];
  }
  return ["xdg-open", [url]];
}

function tryOpenBrowser(url: string): boolean {
  const [command, args] = browserOpenCommand(url);
  try {
    const child = spawn(command, args, {
      detached: true,
      stdio: "ignore",
    });
    child.once("error", (error) => {
      void error;
    });
    child.unref();
    return child.pid !== undefined;
  } catch {
    return false;
  }
}

function writeCallbackResponse(response: ServerResponse, status: number, message: string): void {
  response.writeHead(status, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(message);
}

function closeServer(server: ReturnType<typeof createServer>): Promise<void> {
  return new Promise((closeResolve, closeReject) => {
    server.close((error) => {
      if (error) {
        closeReject(error);
        return;
      }
      closeResolve();
    });
  });
}

function codeFromCallbackRequest(request: IncomingMessage, expectedState: string): string {
  const host = request.headers.host ?? "127.0.0.1";
  const url = new URL(request.url ?? "/", `http://${host}`);
  if (url.pathname !== "/callback") {
    throw new CliError(
      {
        code: "validation.invalid_command_input",
        message: "Unexpected CLI callback path.",
        retryable: false,
      },
      EXIT_VALIDATION,
    );
  }
  const error = url.searchParams.get("error");
  if (error !== null) {
    throw new CliError(
      {
        code: "auth.required",
        message: "WorkOS login did not complete.",
        retryable: false,
      },
      EXIT_AUTH_REQUIRED,
    );
  }
  if (url.searchParams.get("state") !== expectedState) {
    throw new CliError(
      {
        code: "auth.invalid",
        message: "WorkOS login state did not match.",
        retryable: false,
      },
      EXIT_AUTH_REQUIRED,
    );
  }
  const code = url.searchParams.get("code");
  if (code === null || code === "") {
    throw new CliError(
      {
        code: "auth.required",
        message: "WorkOS login did not return an authorization code.",
        retryable: false,
      },
      EXIT_AUTH_REQUIRED,
    );
  }
  return code;
}

function createCallbackServer(
  expectedState: string,
  callbackPort: number,
): Promise<CallbackServer> {
  let settled = false;
  let resolveCode!: (code: string) => void;
  let rejectCode!: (error: unknown) => void;
  const waitForCode = new Promise<string>((resolve, reject) => {
    resolveCode = resolve;
    rejectCode = reject;
  });
  const server = createServer((request, response) => {
    if (settled) {
      writeCallbackResponse(response, 409, "Login already completed.");
      return;
    }
    try {
      const code = codeFromCallbackRequest(request, expectedState);
      settled = true;
      writeCallbackResponse(response, 200, "insecur login complete. You can close this window.");
      resolveCode(code);
    } catch (error) {
      settled = true;
      writeCallbackResponse(response, 400, "insecur login failed. Return to the terminal.");
      rejectCode(error);
    }
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(callbackPort, "127.0.0.1", () => {
      server.off("error", reject);
      const address = server.address();
      if (address === null || typeof address === "string") {
        reject(new Error("Failed to bind CLI callback server."));
        return;
      }
      resolve({
        redirectUri: `http://127.0.0.1:${String(address.port)}/callback`,
        waitForCode,
        close: () => closeServer(server),
      });
    });
  });
}

export async function runBrowserPkceLogin(
  input: BrowserPkceLoginInput,
): Promise<BrowserPkceLoginResult> {
  const state = createState();
  const pkce = createPkcePair();
  const callback = await createCallbackServer(state, input.options.callbackPort ?? 0);
  try {
    const authorizationUrl = input.api.createCliAuthorizationUrl({
      redirectUri: callback.redirectUri,
      state,
      codeChallenge: pkce.challenge,
      codeChallengeMethod: "S256",
    });
    const opened = input.options.openBrowser && tryOpenBrowser(authorizationUrl);
    if (!opened || !input.flags.quiet) {
      process.stderr.write(`Open this URL to complete WorkOS login:\n${authorizationUrl}\n`);
    }
    const code = await callback.waitForCode;
    return await input.api.exchangeCliPkceSession({
      host: input.host,
      code,
      codeVerifier: pkce.verifier,
    });
  } finally {
    await callback.close();
  }
}
