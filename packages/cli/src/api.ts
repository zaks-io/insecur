import type { Config } from './config';

export const apiFetch = async (cfg: Config, path: string, init: RequestInit = {}): Promise<Response> => {
  const url = new URL(path, cfg.host).toString();
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      authorization: `Bearer ${cfg.token}`,
      accept: 'application/json',
    },
  });
  if (!res.ok && res.status === 401) {
    throw new Error('Auth failed. Token may be revoked or expired.');
  }
  return res;
};

export const getDotenv = async (cfg: Config, project: string, env: string): Promise<string> => {
  const res = await apiFetch(cfg, `/v1/projects/${encodeURIComponent(project)}/envs/${encodeURIComponent(env)}/dotenv`);
  if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${await res.text()}`);
  return res.text();
};

export const parseDotenv = (text: string): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (val.startsWith('"') && val.endsWith('"')) {
      val = val.slice(1, -1).replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    }
    out[key] = val;
  }
  return out;
};
