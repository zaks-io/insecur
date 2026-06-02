import {
  assertMetadataOnlyEnvelopeShape,
  type ErrorEnvelope,
  type MetadataEnvelope,
  type SuccessEnvelope,
} from "@insecur/domain";

export interface RenderOptions {
  readonly json: boolean;
  readonly quiet: boolean;
}

export function renderSuccess<TData>(
  envelope: SuccessEnvelope<TData>,
  options: RenderOptions,
  formatHuman: (data: TData) => string,
): void {
  assertMetadataOnlyEnvelopeShape(envelope as unknown as Record<string, unknown>);
  if (options.json) {
    process.stdout.write(`${JSON.stringify(envelope)}\n`);
    return;
  }
  if (!options.quiet) {
    process.stdout.write(`${formatHuman(envelope.data)}\n`);
  }
}

export function renderError(envelope: ErrorEnvelope, options: RenderOptions): void {
  assertMetadataOnlyEnvelopeShape(envelope as unknown as Record<string, unknown>);
  if (options.json) {
    process.stderr.write(`${JSON.stringify(envelope)}\n`);
    return;
  }
  if (!options.quiet) {
    process.stderr.write(`${envelope.error.message}\n`);
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
