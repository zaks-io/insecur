import {
  assertMetadataOnlyEnvelopeShape,
  type ErrorEnvelope,
  type MetadataEnvelope,
  type SuccessEnvelope,
} from "@insecur/domain";
import { formatRemediationProse } from "./cli-remediation.js";
import { sanitizeDisplayText } from "./sanitize-display.js";
import { getStyle } from "./style.js";
import { nextActionsFromRemediation } from "./next-actions.js";

export interface RenderOptions {
  readonly json: boolean;
  readonly quiet: boolean;
}

export const CLI_ENVELOPE_SCHEMA_VERSION = "1" as const;

function serializeCliEnvelope(envelope: MetadataEnvelope<unknown>): string {
  const projectedNext =
    envelope.next === undefined && !envelope.ok && envelope.remediation !== undefined
      ? nextActionsFromRemediation(envelope.remediation)
      : envelope.next;
  return JSON.stringify({
    schemaVersion: CLI_ENVELOPE_SCHEMA_VERSION,
    ...envelope,
    ...(projectedNext === undefined || projectedNext.length === 0 ? {} : { next: projectedNext }),
  });
}

export function renderSuccess<TData>(
  envelope: SuccessEnvelope<TData>,
  options: RenderOptions,
  formatHuman: (data: TData) => string,
): void {
  assertMetadataOnlyEnvelopeShape(envelope as unknown as Record<string, unknown>);
  if (options.json) {
    process.stdout.write(`${serializeCliEnvelope(envelope)}\n`);
    return;
  }
  if (!options.quiet) {
    process.stdout.write(`${formatHuman(envelope.data)}\n`);
  }
}

function renderError(envelope: ErrorEnvelope, options: RenderOptions): void {
  assertMetadataOnlyEnvelopeShape(envelope as unknown as Record<string, unknown>);
  if (options.json) {
    process.stderr.write(`${serializeCliEnvelope(envelope)}\n`);
    return;
  }
  if (!options.quiet) {
    const s = getStyle();
    // Server envelopes are untrusted display input; sanitize before styling.
    process.stderr.write(
      `${s.danger(s.glyph("fail"))} ${s.danger(sanitizeDisplayText(envelope.error.message))}\n`,
    );
    if (envelope.remediation !== undefined) {
      process.stderr.write(`${formatRemediationProse(envelope.remediation)}\n`);
    }
  }
}

export function renderEnvelope(
  envelope: MetadataEnvelope<unknown>,
  options: RenderOptions,
  formatHuman: (data: unknown) => string,
): void {
  if (envelope.ok) {
    renderSuccess(envelope, options, formatHuman);
    return;
  }
  renderError(envelope, options);
}
