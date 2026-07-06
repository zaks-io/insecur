import type { KeyStoreNotice } from "./types.js";

export const FILE_FALLBACK_NOTICE: KeyStoreNotice = {
  code: "local_store.file_fallback_active",
  summary:
    "Local Mode is using a 0600 key file because no OS keychain adapter is available on this machine.",
};
