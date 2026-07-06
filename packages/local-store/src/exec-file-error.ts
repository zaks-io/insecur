function readExecFailureCode(error: unknown): string | number | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as NodeJS.ErrnoException & { code?: string | number }).code;
    if (typeof code === "string" || typeof code === "number") {
      return code;
    }
  }
  return undefined;
}

function readSanitizableStderr(error: Error): string | undefined {
  if ("stderr" in error && typeof (error as { stderr?: unknown }).stderr === "string") {
    return (error as { stderr: string }).stderr;
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
    Object.assign(sanitized, { code });
  }
  const stderr = readSanitizableStderr(error);
  if (stderr !== undefined) {
    (sanitized as NodeJS.ErrnoException & { stderr?: string }).stderr = stderr;
  }
  return sanitized;
}
