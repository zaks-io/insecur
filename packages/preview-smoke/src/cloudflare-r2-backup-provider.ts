import type { R2BackupSweepProvider } from "./r2-backup-sweep";

/**
 * Real Cloudflare boundary for the R2 backup no-plaintext sweep (INS-562). Object reads go
 * through the account-scoped R2 object endpoint (the same seam `wrangler r2 object get` uses)
 * and the deployed trigger is verified through the Worker cron schedules endpoint. Responses are never
 * echoed into errors or logs: object bytes stay in memory and provider failures surface as
 * status codes only, so credentials, signed URLs, and backup bytes cannot leak into output.
 */

const CLOUDFLARE_API_BASE = "https://api.cloudflare.com/client/v4";
const CLOUDFLARE_API_TIMEOUT_MS = 30_000;

export interface CloudflareR2BackupProviderInput {
  accountId: string;
  apiToken: string;
  bucketName: string;
  fetchFn?: typeof fetch;
  /** Deployed Runtime Worker script that owns the backup export cron. */
  scriptName: string;
}

interface CloudflareSchedulesResult {
  result?: { schedules?: { cron?: unknown }[] };
  success?: boolean;
}

type CloudflareFetch = (method: string, apiPath: string, body?: string) => Promise<Response>;

function createCloudflareFetch(input: CloudflareR2BackupProviderInput): CloudflareFetch {
  const fetchFn = input.fetchFn ?? fetch;
  return async (method, apiPath, body) =>
    fetchFn(`${CLOUDFLARE_API_BASE}${apiPath}`, {
      method,
      signal: AbortSignal.timeout(CLOUDFLARE_API_TIMEOUT_MS),
      headers: {
        Authorization: `Bearer ${input.apiToken}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body }),
    });
}

function parseScheduleCrons(payload: CloudflareSchedulesResult): string[] {
  if (payload.success === false || !Array.isArray(payload.result?.schedules)) {
    throw new Error("Cloudflare Worker schedules read returned an unexpected payload shape");
  }
  return payload.result.schedules.map((schedule) => {
    if (typeof schedule.cron !== "string" || schedule.cron === "") {
      throw new Error("Cloudflare Worker schedules read returned a schedule without a cron");
    }
    return schedule.cron;
  });
}

export function createCloudflareR2BackupSweepProvider(
  input: CloudflareR2BackupProviderInput,
): R2BackupSweepProvider {
  const cloudflareFetch = createCloudflareFetch(input);
  const schedulesPath = `/accounts/${input.accountId}/workers/scripts/${input.scriptName}/schedules`;

  return {
    async getObject(key: string): Promise<Uint8Array | null> {
      const objectPath = key.split("/").map(encodeURIComponent).join("/");
      const response = await cloudflareFetch(
        "GET",
        `/accounts/${input.accountId}/r2/buckets/${input.bucketName}/objects/${objectPath}`,
      );
      if (response.status === 404) {
        return null;
      }
      assertProviderStatus(response, `R2 object read (${key})`);
      return new Uint8Array(await response.arrayBuffer());
    },

    async requestExport(key, request): Promise<void> {
      const objectPath = key.split("/").map(encodeURIComponent).join("/");
      const response = await cloudflareFetch(
        "PUT",
        `/accounts/${input.accountId}/r2/buckets/${input.bucketName}/objects/${objectPath}`,
        JSON.stringify(request),
      );
      assertProviderStatus(response, "R2 backup proof request");
    },

    async readSchedules(): Promise<string[]> {
      const response = await cloudflareFetch("GET", schedulesPath);
      assertProviderStatus(response, "Worker schedules read");
      return parseScheduleCrons((await response.json()) as CloudflareSchedulesResult);
    },
  };
}

function assertProviderStatus(response: Response, label: string): void {
  if (!response.ok) {
    // Status only, never the response body: provider errors can embed request context.
    throw new Error(`Cloudflare ${label} failed with HTTP ${String(response.status)}`);
  }
}
