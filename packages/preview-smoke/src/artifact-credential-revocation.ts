import { authHeaders } from "./auth";

/** End every minted smoke session before any failure artifact can be uploaded. */
export async function revokeSmokeCredentials(
  apiBaseUrl: string,
  credentials: readonly string[],
): Promise<void> {
  for (const credential of new Set(credentials)) {
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
