import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdir, readFile, writeFile, chmod } from 'node:fs/promises';

export type Config = {
  host: string;
  token: string;
};

const CONFIG_DIR = join(homedir(), '.insecur');
const CONFIG_PATH = join(CONFIG_DIR, 'config.json');

export const loadConfig = async (): Promise<Config> => {
  try {
    const raw = await readFile(CONFIG_PATH, 'utf8');
    return JSON.parse(raw) as Config;
  } catch {
    throw new Error(`Not logged in. Run: insecur login --host <url> --token <token>`);
  }
};

export const saveConfig = async (cfg: Config): Promise<void> => {
  await mkdir(CONFIG_DIR, { recursive: true, mode: 0o700 });
  await writeFile(CONFIG_PATH, JSON.stringify(cfg, null, 2));
  await chmod(CONFIG_PATH, 0o600);
};
