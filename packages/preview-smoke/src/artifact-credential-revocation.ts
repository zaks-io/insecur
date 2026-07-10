import { Buffer } from "node:buffer";

import { authHeaders } from "./auth";

/** End every minted smoke session before any failure artifact can be uploaded. */
export async function revokeSmokeCredentials(
  apiBaseUrl: string,
  credentials: readonly string[],
): Promise<void> {
  for (const credential of new Set(credentials)) {
    // An expired bearer cannot be replayed, so there is nothing left to revoke. The API reports
    // revoked: false for expired credentials, which must not fail an otherwise-clean run.
    if (credentialExpired(credential)) {
      continue;
    }

    let response: Response;
    try {
      response = await fetch(new URL("/v1/session/revoke", apiBaseUrl), {
        body: "{}",
        headers: { ...authHeaders(credential), "Content-Type": "application/json" },
        method: "POST",
      });
    } catch {
      throw new Error("Preview smoke credential revocation request failed");
    }

    if (!response.ok || !(await responseRevoked(response))) {
      if (credentialExpired(credential)) {
        continue;
      }
      throw new Error("Preview smoke credential revocation was not confirmed");
    }
  }
}

async function responseRevoked(response: Response): Promise<boolean> {
  try {
    const body = (await response.json()) as unknown;
    return (
      typeof body === "object" &&
      body !== null &&
      (body as { ok?: unknown }).ok === true &&
      typeof (body as { data?: unknown }).data === "object" &&
      (body as { data?: { revoked?: unknown } }).data?.revoked === true
    );
  } catch {
    return false;
  }
}

function credentialExpired(credential: string): boolean {
  const payload = credential.split(".")[1];
  if (payload === undefined) {
    return false;
  }
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      exp?: unknown;
    };
    return typeof claims.exp === "number" && claims.exp <= Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}
