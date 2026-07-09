import path from "node:path";

const REDACTED_SENTRY_MESSAGE = "[redacted by insecur]";

interface SentryFrameLike {
  abs_path?: string;
  context_line?: string;
  filename?: string;
  module?: string;
  post_context?: string[];
  pre_context?: string[];
  vars?: Record<string, unknown>;
}

export interface SentryEventLike {
  breadcrumbs?: unknown[];
  contexts?: Record<string, unknown>;
  debug_meta?: unknown;
  exception?: {
    values?: {
      stacktrace?: { frames?: SentryFrameLike[] };
      type?: string;
      value?: string;
    }[];
  };
  extra?: Record<string, unknown>;
  fingerprint?: unknown;
  logentry?: unknown;
  message?: string;
  modules?: Record<string, string>;
  request?: unknown;
  server_name?: string;
  tags?: Record<string, unknown>;
  threads?: unknown;
  user?: unknown;
}

export function prepareCliCrashEvent<TEvent extends SentryEventLike>(event: TEvent): TEvent {
  event.message = REDACTED_SENTRY_MESSAGE;
  for (const value of event.exception?.values ?? []) {
    value.value = REDACTED_SENTRY_MESSAGE;
    sanitizeFrames(value.stacktrace?.frames ?? []);
  }
  return sanitizeCliEventMetadata(event);
}

function sanitizeCliEventMetadata<TEvent extends SentryEventLike>(event: TEvent): TEvent {
  event.breadcrumbs = [];
  event.extra = {};
  event.tags = pickAllowlistedTags(event.tags);
  delete event.contexts;
  delete event.debug_meta;
  delete event.fingerprint;
  delete event.logentry;
  delete event.modules;
  delete event.request;
  delete event.server_name;
  delete event.threads;
  delete event.user;
  return event;
}

function sanitizeFrames(frames: SentryFrameLike[]): void {
  for (const frame of frames) {
    delete frame.abs_path;
    delete frame.context_line;
    delete frame.module;
    delete frame.post_context;
    delete frame.pre_context;
    delete frame.vars;
    if (frame.filename !== undefined) {
      frame.filename = sanitizeFrameFilename(frame.filename);
    }
  }
}

function sanitizeFrameFilename(filename: string): string {
  const normalized = filename.replaceAll("\\", "/");
  const nodeModulesIndex = normalized.lastIndexOf("/node_modules/");
  if (nodeModulesIndex !== -1) {
    return normalized.slice(nodeModulesIndex + "/node_modules/".length);
  }
  const cliIndex = normalized.lastIndexOf("/packages/cli/");
  if (cliIndex !== -1) {
    return normalized.slice(cliIndex + 1);
  }
  return path.basename(normalized);
}

function pickAllowlistedTags(tags: Record<string, unknown> | undefined): Record<string, string> {
  const allowlist = ["command_family", "crash_source", "node_major", "platform", "service"];
  const picked: Record<string, string> = {};
  for (const key of allowlist) {
    const value = tags?.[key];
    if (typeof value === "string" && value.length > 0 && value.length <= 64) {
      picked[key] = value;
    }
  }
  return picked;
}
