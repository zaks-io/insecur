function shellSingleQuoted(value: string): string {
  return `'${value.split("'").join(`'"'"'`)}'`;
}

/** Shell assignments for eval; stdout only — never JSON or committed config. */
export function buildSessionShellExport(credential: string, host: string): string {
  return [
    `export INSECUR_SESSION_TOKEN=${shellSingleQuoted(credential)}`,
    `export INSECUR_HOST=${shellSingleQuoted(host)}`,
  ].join("\n");
}
