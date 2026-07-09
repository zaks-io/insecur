import { spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer, type IncomingHttpHeaders, type IncomingMessage } from "node:http";
import { fileURLToPath } from "node:url";
import { mintEphemeralSessionCredential } from "@insecur/auth";
import { testSessionSigningSecret } from "@insecur/auth/testing";
import { userId } from "@insecur/domain";
import app from "../../../../apps/api/src/index.js";
import { createFakeRuntimeBinding } from "../../../../apps/api/test/support/fake-runtime-binding.js";
import {
  TEST_INSTANCE_ID,
  TEST_USER_ID,
  TEST_WORKOS_USER_ID,
} from "../../../tenant-store/test/rls/test-ids.js";
import { RLS_TEST_ROOT_KEY_HEX } from "../../../tenant-store/test/rls/test-root-key.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const cliPath = path.join(repoRoot, "packages/cli/dist/index.js");

const SESSION_SIGNING_SECRET = testSessionSigningSecret();
const RUNTIME_TOKEN_SIGNING_SECRET = "cli-integration-runtime-hop-secret-0000000000000000";

const apiEnv = {
  WORKOS_API_KEY: "sk_test",
  WORKOS_CLIENT_ID: "client_test",
  WORKOS_COOKIE_PASSWORD: "cookie-password-at-least-32-characters",
  SESSION_SIGNING_SECRET,
  INSTANCE_ID: TEST_INSTANCE_ID,
  RUNTIME_TOKEN_SIGNING_SECRET,
  RUNTIME: createFakeRuntimeBinding({
    INSTANCE_ROOT_KEY_V1: {
      get: (): Promise<string> => Promise.resolve(RLS_TEST_ROOT_KEY_HEX),
    },
    RUNTIME_TOKEN_SIGNING_SECRET,
  }),
};

export interface CliProcessResult {
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

export interface CliIntegrationHarness {
  readonly baseUrl: string;
  runCli(
    args: readonly string[],
    options?: { readonly authenticated?: boolean },
  ): Promise<CliProcessResult>;
  close(): Promise<void>;
}

function headersFromIncoming(headers: IncomingHttpHeaders): Headers {
  const webHeaders = new Headers();
  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        webHeaders.append(name, item);
      }
      continue;
    }
    webHeaders.set(name, value);
  }
  return webHeaders;
}

async function readBody(request: IncomingMessage): Promise<Buffer | undefined> {
  if (request.method === "GET" || request.method === "HEAD") {
    return undefined;
  }
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function serveApiRequest(baseUrl: string, incoming: IncomingMessage): Promise<Response> {
  const body = await readBody(incoming);
  const request = new Request(new URL(incoming.url ?? "/", baseUrl), {
    method: incoming.method ?? "GET",
    headers: headersFromIncoming(incoming.headers),
    ...(body === undefined ? {} : { body }),
  });
  return app.fetch(request, apiEnv as never);
}

function writeResponse(response: Response, outgoing: import("node:http").ServerResponse): void {
  outgoing.statusCode = response.status;
  response.headers.forEach((value, key) => {
    outgoing.setHeader(key, value);
  });
  void response.arrayBuffer().then(
    (body) => outgoing.end(Buffer.from(body)),
    (error: unknown) => {
      outgoing.statusCode = 500;
      outgoing.end(error instanceof Error ? error.message : String(error));
    },
  );
}

function listen(server: ReturnType<typeof createServer>): Promise<string> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      const address = server.address();
      if (address === null || typeof address === "string") {
        reject(new Error("API test server did not bind to a TCP port"));
        return;
      }
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

function closeServer(server: ReturnType<typeof createServer>): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error === undefined) {
        resolve();
        return;
      }
      reject(error);
    });
  });
}

async function createIsolatedCliEnv(token: string | undefined): Promise<NodeJS.ProcessEnv> {
  const home = await mkdtemp(path.join(tmpdir(), "insecur-cli-postgres-home-"));
  const env: NodeJS.ProcessEnv = {
    HOME: home,
    INSECUR_CONFIG_HOME: home,
    PATH: process.env.PATH ?? "",
    SHELL: process.env.SHELL ?? "/bin/zsh",
  };
  if (token !== undefined) {
    env.INSECUR_SESSION_TOKEN = token;
  }
  return env;
}

function runProcess(args: readonly string[], env: NodeJS.ProcessEnv): Promise<CliProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: repoRoot,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

export async function createCliIntegrationHarness(): Promise<CliIntegrationHarness> {
  let baseUrl = "";
  const server = createServer((incoming, outgoing) => {
    serveApiRequest(baseUrl, incoming).then(
      (response) => writeResponse(response, outgoing),
      (error: unknown) => {
        outgoing.statusCode = 500;
        outgoing.end(error instanceof Error ? error.message : String(error));
      },
    );
  });
  baseUrl = await listen(server);
  const defaultToken = await mintCliSessionToken("session_cli_postgres_integration");

  return {
    baseUrl,
    async runCli(args, options = {}) {
      const token = options.authenticated === false ? undefined : defaultToken;
      const env = await createIsolatedCliEnv(token);
      const configDir = await mkdtemp(path.join(tmpdir(), "insecur-cli-postgres-project-"));
      return runProcess(
        [cliPath, "--host", baseUrl, "--config-dir", configDir, "--json", ...args],
        env,
      );
    },
    async close() {
      server.closeAllConnections();
      await closeServer(server);
    },
  };
}

async function mintCliSessionToken(sessionId: string): Promise<string> {
  const minted = await mintEphemeralSessionCredential({
    actor: {
      type: "user",
      userId: userId.brand(TEST_USER_ID),
      workosUserId: TEST_WORKOS_USER_ID,
      sessionId,
    },
    signingSecret: SESSION_SIGNING_SECRET,
  });
  return minted.credential;
}
