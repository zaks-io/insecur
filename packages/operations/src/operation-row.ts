import { operationId, type OrganizationId } from "@insecur/domain";
import { isOperationState } from "./operation-states.js";
import type { OperationPollResult, OperationProgress } from "./operation-types.js";
import { validateOperationProgress } from "./validate-operation-metadata.js";

export interface OperationRow {
  id: string;
  org_id: string;
  state: string;
  intent_code: string;
  idempotency_key: string | null;
  progress: unknown;
  created_at: Date;
  updated_at: Date;
}

function parseProgress(value: unknown): OperationProgress {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const progress = value as OperationProgress;
  validateOperationProgress(progress);
  return progress;
}

export function toOperationPollResult(row: OperationRow): OperationPollResult {
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
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}
