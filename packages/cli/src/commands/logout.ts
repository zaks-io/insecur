import { successEnvelope } from "@insecur/domain";
import type { GlobalCliFlags } from "../cli-options.js";
import { renderSuccess } from "../output/render.js";
import { clearSessionCredentialHandoff } from "../session/resolve-session.js";

export function runLogoutCommand(flags: GlobalCliFlags): number {
  clearSessionCredentialHandoff();
  const output = successEnvelope({ loggedOut: true });
  renderSuccess(output, flags, () => "Logged out.");
  return 0;
}
