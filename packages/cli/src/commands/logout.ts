import { successEnvelope } from "@insecur/domain";
import type { GlobalCliFlags } from "../cli-options.js";
import { renderSuccess } from "../output/render.js";
import { clearMemorySession } from "../session/memory-session.js";
import { defaultSessionStore, type SessionStore } from "../session/persisted-session.js";

export async function runLogoutCommand(
  flags: GlobalCliFlags,
  sessionStore?: SessionStore,
): Promise<number> {
  clearMemorySession();
  const removed = await (sessionStore ?? defaultSessionStore()).clear();
  renderSuccess(successEnvelope({ removed }), flags, (data) =>
    data.removed ? "Logged out; persisted session removed." : "No persisted session to remove.",
  );
  return 0;
}
