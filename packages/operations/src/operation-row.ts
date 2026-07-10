import { operationId, type OrganizationId } from "@insecur/domain";
import { isOperationState } from "./operation-states.js";
import type { OperationPollResult, OperationProgress } from "./operation-types.js";
import { toIsoTimestamp } from "@insecur/tenant-store";
import { validateOperationProgress } from "./validate-operation-metadata.js";

export interface OperationRow {
  id: string;
  org_id: string;
  state: string;
  intent_code: string;
  idempotency_key: string | null;
  progress: unknown;
  execution_deadline: Date | string | null;
  revision: number | string;
  created_at: Date | string;
  updated_at: Date | string;
}

/**
 * Store-internal read shape: poll result plus the optimistic-concurrency revision that every
 * read-merge-write UPDATE must compare-and-set on. Not part of the public package surface.
 */
export type OperationRecord = OperationPollResult & { readonly revision: number };

function parseProgress(value: unknown): OperationProgress {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const progress = value as OperationProgress;
  validateOperationProgress(progress);
  return progress;
}

function parseRevision(value: number | string): number {
  const revision = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(revision) || revision < 1) {
    throw new Error(`invalid operation revision in database: ${String(value)}`);
  }
  return revision;
}

export function toOperationRecord(row: OperationRow): OperationRecord {
  const state = row.state;
  if (!isOperationState(state)) {
    throw new Error(`unknown operation state in database: ${state}`);
  }

  return {
    operationId: operationId.brand(row.id),
    organizationId: row.org_id as OrganizationId,
    state,
    intentCode: row.intent_code,
    progress: parseProgress(row.progress),
    ...(row.execution_deadline === null
      ? {}
      : { executionDeadline: toIsoTimestamp(row.execution_deadline) }),
    revision: parseRevision(row.revision),
    createdAt: toIsoTimestamp(row.created_at),
    updatedAt: toIsoTimestamp(row.updated_at),
  };
}

/**
 * Public read boundary: strips the store-internal revision so it never reaches
 * poll results, RPC payloads, or route responses.
 */
export function toOperationPollResult(record: OperationRecord): OperationPollResult {
  const { revision, ...operation } = record;
  void revision;
  return operation;
}
