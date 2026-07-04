import { APP_CONNECTION_ERROR_CODES } from "@insecur/domain";

import { AppConnectionError } from "./app-connection-error.js";

interface CloudflareApiResponse<T> {
  readonly success: boolean;
  readonly result?: T;
}

type FetchFn = typeof fetch;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" ? value : null;
}

async function parseJsonResponse(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function cloudflareGet(
  fetchFn: FetchFn,
  token: string,
  url: string,
): Promise<CloudflareApiResponse<Record<string, unknown>>> {
  const response = await fetchFn(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  const body = (await parseJsonResponse(response)) as CloudflareApiResponse<
    Record<string, unknown>
  > | null;

  if (!response.ok || body?.success !== true || !isRecord(body.result)) {
    throw new AppConnectionError(
      APP_CONNECTION_ERROR_CODES.validationFailed,
      "cloudflare api request failed",
    );
  }

  return { success: true, result: body.result };
}

export async function verifyCloudflareTokenActive(
  fetchFn: FetchFn,
  token: string,
): Promise<"active"> {
  const verifyBody = await cloudflareGet(
    fetchFn,
    token,
    "https://api.cloudflare.com/client/v4/user/tokens/verify",
  );
  if (verifyBody.result?.status !== "active") {
    throw new AppConnectionError(
      APP_CONNECTION_ERROR_CODES.validationFailed,
      "cloudflare token is not active",
    );
  }
  return "active";
}

export async function verifyCloudflareAccountBoundary(
  fetchFn: FetchFn,
  token: string,
  allowedAccountId: string,
): Promise<string> {
  const accountBody = await cloudflareGet(
    fetchFn,
    token,
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(allowedAccountId)}`,
  ).catch(() => {
    throw new AppConnectionError(
      APP_CONNECTION_ERROR_CODES.boundaryMismatch,
      "cloudflare account is not reachable with the provided token",
    );
  });

  const providerAccountId = readString(accountBody.result ?? {}, "id");
  if (providerAccountId === null || providerAccountId !== allowedAccountId) {
    throw new AppConnectionError(
      APP_CONNECTION_ERROR_CODES.boundaryMismatch,
      "cloudflare account linkage mismatch",
    );
  }
  return providerAccountId;
}

export async function verifyCloudflareWorkerScriptBoundary(
  fetchFn: FetchFn,
  token: string,
  allowedAccountId: string,
  allowedWorkerScript: string,
): Promise<boolean> {
  const scriptBody = await cloudflareGet(
    fetchFn,
    token,
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(allowedAccountId)}/workers/scripts/${encodeURIComponent(allowedWorkerScript)}`,
  ).catch(() => {
    throw new AppConnectionError(
      APP_CONNECTION_ERROR_CODES.boundaryMismatch,
      "cloudflare worker script is not reachable with the provided token",
    );
  });

  const workerScriptReachable = readString(scriptBody.result ?? {}, "id") === allowedWorkerScript;
  if (!workerScriptReachable) {
    throw new AppConnectionError(
      APP_CONNECTION_ERROR_CODES.boundaryMismatch,
      "cloudflare worker script is not reachable with the provided token",
    );
  }
  return true;
}
