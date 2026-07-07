import {
  environmentId,
  organizationId,
  parseVariableKey,
  projectId,
  type KnownErrorCode,
  type SecretId,
  type SecretVersionId,
  type VariableKey,
} from "@insecur/domain";

import type { ProvisionedWorkspace } from "./provisioning.js";
import { parseCataloguedApiFailure } from "./wizard-mutation-gate.js";

/** Metadata-only blind secret write receipt (ADR-0052). No Sensitive Values. */
export interface BlindSecretWriteReceipt {
  readonly secretId: SecretId;
  readonly secretVersionId: SecretVersionId;
  readonly variableKey: VariableKey;
  readonly createdSecretShape: boolean;
  readonly auditEventId?: string;
}

/** Wizard-local failure codes for conditions the API envelope never carries. */
type WebWizardErrorCode = "web.unexpected_response" | "web.csrf_rejected";

export type BlindSecretWriteOutcome =
  | { readonly ok: true; readonly receipt: BlindSecretWriteReceipt }
  | { readonly ok: false; readonly code: KnownErrorCode | WebWizardErrorCode };

type BlindSecretWriteMode = "value" | "generate";

/** What the wizard blind-write step submits to the server fn. */
export interface BlindSecretWriteSubmission {
  readonly csrfToken: string;
  readonly workspace: ProvisionedWorkspace;
  readonly variableKey: string;
  readonly mode: BlindSecretWriteMode;
  /** Present only for paste mode; never logged or echoed back. */
  readonly value?: string;
}

function parseOpaqueId(raw: unknown, parse: (value: string) => { ok: boolean }): string | null {
  return typeof raw === "string" && parse(raw).ok ? raw : null;
}

const parseOrganizationId = (value: string) => organizationId.parse(value);
const parseProjectId = (value: string) => projectId.parse(value);
const parseEnvironmentId = (value: string) => environmentId.parse(value);

function parseWorkspace(value: unknown): ProvisionedWorkspace | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const organizationIdRaw = parseOpaqueId(record.organizationId, parseOrganizationId);
  const projectIdRaw = parseOpaqueId(record.projectId, parseProjectId);
  const environmentIdRaw = parseOpaqueId(record.environmentId, parseEnvironmentId);
  if (organizationIdRaw === null || projectIdRaw === null || environmentIdRaw === null) {
    return null;
  }
  return {
    organizationId: organizationIdRaw,
    projectId: projectIdRaw,
    environmentId: environmentIdRaw,
  };
}

function parsePasteSubmission(
  record: Record<string, unknown>,
  workspace: ProvisionedWorkspace,
): BlindSecretWriteSubmission | null {
  if (typeof record.value !== "string") {
    return null;
  }
  return {
    csrfToken: record.csrfToken as string,
    workspace,
    variableKey: record.variableKey as string,
    mode: "value",
    value: record.value,
  };
}

function parseGenerateSubmission(
  record: Record<string, unknown>,
  workspace: ProvisionedWorkspace,
): BlindSecretWriteSubmission {
  return {
    csrfToken: record.csrfToken as string,
    workspace,
    variableKey: record.variableKey as string,
    mode: "generate",
  };
}

function parseSubmissionFields(data: unknown): {
  record: Record<string, unknown>;
  workspace: ProvisionedWorkspace;
  mode: BlindSecretWriteMode;
} | null {
  if (typeof data !== "object" || data === null) {
    return null;
  }
  const record = data as Record<string, unknown>;
  const workspace = parseWorkspace(record.workspace);
  const mode = record.mode;
  if (
    typeof record.csrfToken !== "string" ||
    typeof record.variableKey !== "string" ||
    workspace === null ||
    (mode !== "value" && mode !== "generate")
  ) {
    return null;
  }
  return { record, workspace, mode };
}

export function parseBlindSecretWriteSubmission(data: unknown): BlindSecretWriteSubmission | null {
  const fields = parseSubmissionFields(data);
  if (fields === null) {
    return null;
  }
  if (fields.mode === "value") {
    return parsePasteSubmission(fields.record, fields.workspace);
  }
  return parseGenerateSubmission(fields.record, fields.workspace);
}

function parseReceiptIds(record: Record<string, unknown>): {
  secretId: SecretId;
  secretVersionId: SecretVersionId;
  createdSecretShape: boolean;
} | null {
  if (
    typeof record.secretId !== "string" ||
    typeof record.secretVersionId !== "string" ||
    typeof record.createdSecretShape !== "boolean"
  ) {
    return null;
  }
  return {
    secretId: record.secretId as SecretId,
    secretVersionId: record.secretVersionId as SecretVersionId,
    createdSecretShape: record.createdSecretShape,
  };
}

function parseReceipt(data: unknown): BlindSecretWriteReceipt | null {
  if (typeof data !== "object" || data === null) {
    return null;
  }
  const record = data as Record<string, unknown>;
  const ids = parseReceiptIds(record);
  const variableKeyRaw = typeof record.variableKey === "string" ? record.variableKey : "";
  const variableKeyParsed = parseVariableKey(variableKeyRaw);
  if (ids === null || !variableKeyParsed.ok) {
    return null;
  }
  const auditEventId =
    typeof record.auditEventId === "string" ? { auditEventId: record.auditEventId } : {};
  return {
    ...ids,
    variableKey: variableKeyParsed.value,
    ...auditEventId,
  };
}

export function parseBlindSecretWriteOutcome(body: unknown): BlindSecretWriteOutcome {
  if (typeof body !== "object" || body === null) {
    return { ok: false, code: "web.unexpected_response" };
  }
  const envelope = body as Record<string, unknown>;
  if (envelope.ok === true) {
    const receipt = parseReceipt(envelope.data);
    return receipt === null
      ? { ok: false, code: "web.unexpected_response" }
      : { ok: true, receipt };
  }
  return parseCataloguedApiFailure(envelope);
}

export function blindSecretWriteReceiptRows(
  receipt: BlindSecretWriteReceipt,
): readonly { readonly label: string; readonly id: string }[] {
  return [
    { label: "Variable key", id: receipt.variableKey },
    { label: "Secret", id: receipt.secretId },
    { label: "Version", id: receipt.secretVersionId },
  ];
}
