import { notFound, redirect } from "@tanstack/react-router";
import { loginRedirectHref } from "./login-redirect.js";
import type { ConsoleRead } from "../server/console-read.js";
import type { ConsoleSession } from "../server/console-session.js";
import { throwConsoleUnavailable } from "./unavailable.js";

export function requireConsoleSession(
  session: ConsoleSession,
  returnTo: string,
): Extract<ConsoleSession, { kind: "authenticated" }> {
  if (session.kind === "unauthenticated") {
    throw redirect({ href: loginRedirectHref(returnTo) });
  }
  if (session.kind === "unavailable") {
    throwConsoleUnavailable();
  }
  return session;
}

export function requireConsoleRead<T>(read: ConsoleRead<T>, returnTo: string): T {
  if (read.kind === "unauthenticated") {
    throw redirect({ href: loginRedirectHref(returnTo) });
  }
  if (read.kind === "unavailable") {
    throwConsoleUnavailable();
  }
  if (read.kind === "denied") {
    throw notFound();
  }
  return read.value;
}
