function readExecFailureCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as NodeJS.ErrnoException).code;
    return typeof code === "string" ? code : undefined;
  }
  return undefined;
}

export function sanitizeChildProcessFailureCause(error: unknown): Error | undefined {
  if (!(error instanceof Error)) {
    return undefined;
  }

  const sanitized = new Error("child process execFile failed");
  sanitized.name = error.name;
  const code = readExecFailureCode(error);
  if (code !== undefined) {
    (sanitized as NodeJS.ErrnoException).code = code;
  }
  return sanitized;
}
