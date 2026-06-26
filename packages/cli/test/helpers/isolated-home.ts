import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface IsolatedHomeHandle {
  readonly homeDir: string;
  restore(): void;
}

export async function createIsolatedHome(
  prefix = "insecur-cli-home-",
): Promise<IsolatedHomeHandle> {
  const homeDir = await mkdtemp(join(tmpdir(), prefix));
  const previous = {
    configHome: process.env.INSECUR_CONFIG_HOME,
    home: process.env.HOME,
  };

  process.env.INSECUR_CONFIG_HOME = homeDir;
  process.env.HOME = homeDir;

  return {
    homeDir,
    restore() {
      if (previous.configHome === undefined) {
        delete process.env.INSECUR_CONFIG_HOME;
      } else {
        process.env.INSECUR_CONFIG_HOME = previous.configHome;
      }
      if (previous.home === undefined) {
        delete process.env.HOME;
      } else {
        process.env.HOME = previous.home;
      }
    },
  };
}
