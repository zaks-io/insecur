/** Committed project config and CLI profile host value for Local Mode. */
export const LOCAL_MODE_HOST = "local";

export function isLocalModeHost(host: string): boolean {
  return host === LOCAL_MODE_HOST;
}
