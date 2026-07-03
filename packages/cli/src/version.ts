declare const __INSECUR_CLI_VERSION__: string | undefined;

export function cliVersion(): string {
  return typeof __INSECUR_CLI_VERSION__ === "string" ? __INSECUR_CLI_VERSION__ : "0.0.0";
}
