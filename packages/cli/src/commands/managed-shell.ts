import { spawn } from "node:child_process";

export function runInteractiveShell(shell: string, childEnv: NodeJS.ProcessEnv): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const child = spawn(shell, [], { env: childEnv, stdio: "inherit", shell: false });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve(code ?? 0);
    });
  });
}

export function resolveInteractiveShell(): string {
  return process.env.SHELL ?? "/bin/bash";
}
