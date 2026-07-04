import type { CloudflareConnectionBoundary } from "./cloudflare-scoped-token-metadata.js";
import {
  verifyCloudflareAccountBoundary,
  verifyCloudflareTokenActive,
  verifyCloudflareWorkerScriptBoundary,
} from "./cloudflare-scoped-token-api.js";

export interface CloudflareScopedTokenVerifyInput extends CloudflareConnectionBoundary {
  readonly token: string;
}

export interface CloudflareScopedTokenVerifyResult {
  readonly tokenStatus: "active" | "invalid";
  readonly providerAccountId: string;
  readonly workerScriptReachable: boolean;
  readonly hasBoundaryWarning: boolean;
}

export interface CloudflareScopedTokenPort {
  verifyScopedToken(
    input: CloudflareScopedTokenVerifyInput,
  ): Promise<CloudflareScopedTokenVerifyResult>;
}

type FetchFn = typeof fetch;

export function createCloudflareScopedTokenPort(
  fetchFn: FetchFn = fetch,
): CloudflareScopedTokenPort {
  return {
    async verifyScopedToken(
      input: CloudflareScopedTokenVerifyInput,
    ): Promise<CloudflareScopedTokenVerifyResult> {
      const tokenStatus = await verifyCloudflareTokenActive(fetchFn, input.token);
      const providerAccountId = await verifyCloudflareAccountBoundary(
        fetchFn,
        input.token,
        input.allowedAccountId,
      );
      const workerScriptReachable = await verifyCloudflareWorkerScriptBoundary(
        fetchFn,
        input.token,
        input.allowedAccountId,
        input.allowedWorkerScript,
      );

      return {
        tokenStatus,
        providerAccountId,
        workerScriptReachable,
        hasBoundaryWarning: false,
      };
    },
  };
}
