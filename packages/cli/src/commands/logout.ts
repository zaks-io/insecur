import { successEnvelope } from "@insecur/domain";
import type { GlobalCliFlags } from "../cli-options.js";
import { renderSuccess } from "../output/render.js";
import { clearMemorySession } from "../session/memory-session.js";
import { clearCachedSession } from "../session/session-cache.js";
import { resetSessionCredentialCacheForTests } from "../session/resolve-session.js";

export async function runLogoutCommand(flags: GlobalCliFlags): Promise<number> {
  clearMemorySession();
  await clearCachedSession();
  resetSessionCredentialCacheForTests();
  const output = successEnvelope({ loggedOut: true });
  renderSuccess(output, flags, () => "Logged out.");
  return 0;
}
