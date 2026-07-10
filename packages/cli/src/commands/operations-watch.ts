import { assertMetadataOnlyValue } from "@insecur/domain";
import type { ApiClient } from "../api/types.js";
import type { GlobalCliFlags } from "../cli-options.js";
import type { ResolvedCliContext } from "../config/load-cli-context.js";
import { CLI_ENVELOPE_SCHEMA_VERSION } from "../output/render.js";
import { EXIT_WAIT_TIMEOUT } from "../output/exit-codes.js";
import {
  fetchOperationState,
  formatOperationHuman,
  isSuccessTerminalOperationPollState,
  isTerminalOperationPollState,
} from "./operations-get.js";
import { parseOperationIdOrThrow } from "./operations-scope.js";
import { readyResumeArgv } from "./operations-wait.js";

export interface OperationsWatchCommandOptions {
  readonly operationId: string;
  readonly timeoutSeconds?: number;
  readonly jsonl: boolean;
  readonly pollIntervalMs?: number;
}

function writeEvent(data: Awaited<ReturnType<typeof fetchOperationState>>): void {
  const event = {
    schemaVersion: CLI_ENVELOPE_SCHEMA_VERSION,
    event: "operation.state",
    data,
  };
  assertMetadataOnlyValue(event);
  process.stdout.write(`${JSON.stringify(event)}\n`);
}

async function delay(ms: number): Promise<void> {
  if (ms === 0) {
    await Promise.resolve();
    return;
  }
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function writeStateChange(
  data: Awaited<ReturnType<typeof fetchOperationState>>,
  previousRevision: string | undefined,
  flags: GlobalCliFlags,
  jsonl: boolean,
): string {
  const revision = `${data.state}:${data.updatedAt}`;
  if (revision === previousRevision) {
    return revision;
  }
  if (jsonl) {
    writeEvent(data);
  } else if (!flags.quiet) {
    process.stdout.write(`${formatOperationHuman(data)}\n`);
  }
  return revision;
}

function watchExitCode(
  data: Awaited<ReturnType<typeof fetchOperationState>>,
  deadline: number | undefined,
): number | undefined {
  if (readyResumeArgv(data) !== undefined) {
    return 0;
  }
  if (isTerminalOperationPollState(data.state)) {
    return isSuccessTerminalOperationPollState(data.state) ? 0 : EXIT_WAIT_TIMEOUT;
  }
  return deadline !== undefined && Date.now() >= deadline ? EXIT_WAIT_TIMEOUT : undefined;
}

export async function runOperationsWatchCommand(
  flags: GlobalCliFlags,
  api: ApiClient,
  context: ResolvedCliContext,
  options: OperationsWatchCommandOptions,
): Promise<number> {
  const operationId = parseOperationIdOrThrow(options.operationId);
  const deadline =
    options.timeoutSeconds === undefined ? undefined : Date.now() + options.timeoutSeconds * 1_000;
  let lastRevision: string | undefined;

  for (;;) {
    const data = await fetchOperationState(api, context, operationId);
    lastRevision = writeStateChange(data, lastRevision, flags, options.jsonl || flags.json);
    const exitCode = watchExitCode(data, deadline);
    if (exitCode !== undefined) {
      return exitCode;
    }
    await delay(options.pollIntervalMs ?? 1_000);
  }
}
