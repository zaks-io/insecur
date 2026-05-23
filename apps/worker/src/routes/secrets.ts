import { Hono, type Context } from 'hono';
import type { Env, Variables } from '../env';
import { requireProjectScope } from '../auth';
import { decryptSecret, encryptSecret, type WrappedSecret } from '../crypto';
import { isSecretName, isSlug } from '../validation';
import { log } from '../audit';

type AppCtx = Context<{ Bindings: Env; Variables: Variables }>;

export const secretRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

type EnvLookup = { project_id: number; env_id: number };

const resolveEnv = async (
  c: AppCtx,
  projectSlug: string,
  envSlug: string,
): Promise<EnvLookup | null> => {
  if (!isSlug(projectSlug) || !isSlug(envSlug)) return null;
  const row = await c.env.DB.prepare(
    `SELECT p.id AS project_id, e.id AS env_id
     FROM projects p JOIN environments e ON e.project_id = p.id
     WHERE p.slug = ?1 AND e.slug = ?2`,
  )
    .bind(projectSlug, envSlug)
    .first<EnvLookup>();
  return row;
};

secretRoutes.get('/:project/envs/:env/secrets', requireProjectScope('read'), async (c) => {
  const ref = await resolveEnv(c, c.req.param('project'), c.req.param('env'));
  if (!ref) return c.json({ error: 'env_not_found' }, 404);

  const { results } = await c.env.DB.prepare(
    `SELECT s.name, sv.n AS version, sv.created_at AS updated_at
     FROM secrets s
     LEFT JOIN secret_versions sv ON sv.id = s.current_version_id
     WHERE s.env_id = ?1
     ORDER BY s.name`,
  )
    .bind(ref.env_id)
    .all();
  return c.json({ secrets: results });
});

secretRoutes.get('/:project/envs/:env/secrets/:name', requireProjectScope('read'), async (c) => {
  if (!isSecretName(c.req.param('name'))) return c.json({ error: 'invalid_secret_name' }, 400);
  const ref = await resolveEnv(c, c.req.param('project'), c.req.param('env'));
  if (!ref) return c.json({ error: 'env_not_found' }, 404);

  const row = await c.env.DB.prepare(
    `SELECT sv.ciphertext_b64, sv.dek_wrapped_b64, sv.ct_nonce_b64, sv.dek_nonce_b64, sv.n
     FROM secrets s JOIN secret_versions sv ON sv.id = s.current_version_id
     WHERE s.env_id = ?1 AND s.name = ?2`,
  )
    .bind(ref.env_id, c.req.param('name'))
    .first<WrappedSecret & { n: number }>();
  if (!row) return c.json({ error: 'secret_not_found' }, 404);

  const value = await decryptSecret(row, c.env.KEK_B64);
  await log(c, {
    action: 'secret.read',
    scope: `${c.req.param('project')}/${c.req.param('env')}`,
    target: c.req.param('name'),
  });
  return c.json({ name: c.req.param('name'), value, version: row.n });
});

secretRoutes.put('/:project/envs/:env/secrets/:name', requireProjectScope('write'), async (c) => {
  if (!isSecretName(c.req.param('name'))) return c.json({ error: 'invalid_secret_name' }, 400);
  const ref = await resolveEnv(c, c.req.param('project'), c.req.param('env'));
  if (!ref) return c.json({ error: 'env_not_found' }, 404);
  const auth = c.get('auth');
  const body = await c.req.json<{ value: string; comment?: string }>();
  if (typeof body.value !== 'string') return c.json({ error: 'value_required' }, 400);

  const wrapped = await encryptSecret(body.value, c.env.KEK_B64);
  const name = c.req.param('name');

  // upsert secret, then insert new version
  await c.env.DB.prepare(
    `INSERT INTO secrets (project_id, env_id, name) VALUES (?1, ?2, ?3)
     ON CONFLICT (env_id, name) DO NOTHING`,
  )
    .bind(ref.project_id, ref.env_id, name)
    .run();
  const secret = await c.env.DB.prepare(`SELECT id FROM secrets WHERE env_id = ?1 AND name = ?2`)
    .bind(ref.env_id, name)
    .first<{ id: number }>();
  if (!secret) return c.json({ error: 'upsert_failed' }, 500);

  const last = await c.env.DB.prepare(`SELECT COALESCE(MAX(n), 0) AS max_n FROM secret_versions WHERE secret_id = ?1`)
    .bind(secret.id)
    .first<{ max_n: number }>();
  const nextN = (last?.max_n ?? 0) + 1;

  const insertRes = await c.env.DB.prepare(
    `INSERT INTO secret_versions
       (secret_id, n, ciphertext_b64, dek_wrapped_b64, ct_nonce_b64, dek_nonce_b64, comment, created_by)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
  )
    .bind(
      secret.id,
      nextN,
      wrapped.ciphertext_b64,
      wrapped.dek_wrapped_b64,
      wrapped.ct_nonce_b64,
      wrapped.dek_nonce_b64,
      body.comment ?? null,
      auth.identityId,
    )
    .run();

  const versionId = insertRes.meta?.last_row_id;
  await c.env.DB.prepare(`UPDATE secrets SET current_version_id = ?1 WHERE id = ?2`)
    .bind(versionId, secret.id)
    .run();

  await log(c, {
    action: 'secret.write',
    scope: `${c.req.param('project')}/${c.req.param('env')}`,
    target: name,
    meta: { version: nextN },
  });
  return c.json({ ok: true, version: nextN });
});

secretRoutes.get('/:project/envs/:env/secrets/:name/versions', requireProjectScope('read'), async (c) => {
  if (!isSecretName(c.req.param('name'))) return c.json({ error: 'invalid_secret_name' }, 400);
  const ref = await resolveEnv(c, c.req.param('project'), c.req.param('env'));
  if (!ref) return c.json({ error: 'env_not_found' }, 404);
  const name = c.req.param('name');
  const { results } = await c.env.DB.prepare(
    `SELECT sv.n, sv.created_at, sv.comment, i.name AS created_by
     FROM secret_versions sv
     JOIN secrets s ON s.id = sv.secret_id
     LEFT JOIN identities i ON i.id = sv.created_by
     WHERE s.env_id = ?1 AND s.name = ?2
     ORDER BY sv.n DESC`,
  )
    .bind(ref.env_id, name)
    .all();
  return c.json({ versions: results });
});

secretRoutes.post('/:project/envs/:env/secrets/:name/rollback', requireProjectScope('write'), async (c) => {
  if (!isSecretName(c.req.param('name'))) return c.json({ error: 'invalid_secret_name' }, 400);
  const ref = await resolveEnv(c, c.req.param('project'), c.req.param('env'));
  if (!ref) return c.json({ error: 'env_not_found' }, 404);
  const name = c.req.param('name');
  const body = await c.req.json<{ to: number }>();
  if (typeof body.to !== 'number') return c.json({ error: 'to_required' }, 400);

  const src = await c.env.DB.prepare(
    `SELECT sv.ciphertext_b64, sv.dek_wrapped_b64, sv.ct_nonce_b64, sv.dek_nonce_b64, s.id AS secret_id
     FROM secret_versions sv JOIN secrets s ON s.id = sv.secret_id
     WHERE s.env_id = ?1 AND s.name = ?2 AND sv.n = ?3`,
  )
    .bind(ref.env_id, name, body.to)
    .first<WrappedSecret & { secret_id: number }>();
  if (!src) return c.json({ error: 'version_not_found' }, 404);

  const last = await c.env.DB.prepare(`SELECT MAX(n) AS max_n FROM secret_versions WHERE secret_id = ?1`)
    .bind(src.secret_id)
    .first<{ max_n: number }>();
  const nextN = (last?.max_n ?? 0) + 1;
  const auth = c.get('auth');

  const insertRes = await c.env.DB.prepare(
    `INSERT INTO secret_versions
       (secret_id, n, ciphertext_b64, dek_wrapped_b64, ct_nonce_b64, dek_nonce_b64, comment, created_by)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
  )
    .bind(
      src.secret_id,
      nextN,
      src.ciphertext_b64,
      src.dek_wrapped_b64,
      src.ct_nonce_b64,
      src.dek_nonce_b64,
      `rollback to v${body.to}`,
      auth.identityId,
    )
    .run();

  await c.env.DB.prepare(`UPDATE secrets SET current_version_id = ?1 WHERE id = ?2`)
    .bind(insertRes.meta?.last_row_id, src.secret_id)
    .run();
  await log(c, {
    action: 'secret.rollback',
    scope: `${c.req.param('project')}/${c.req.param('env')}`,
    target: name,
    meta: { to: body.to, new_version: nextN },
  });
  return c.json({ ok: true, version: nextN });
});

secretRoutes.get('/:project/envs/:env/dotenv', requireProjectScope('read'), async (c) => {
  const ref = await resolveEnv(c, c.req.param('project'), c.req.param('env'));
  if (!ref) return c.json({ error: 'env_not_found' }, 404);

  const { results } = await c.env.DB.prepare(
    `SELECT s.name, sv.ciphertext_b64, sv.dek_wrapped_b64, sv.ct_nonce_b64, sv.dek_nonce_b64
     FROM secrets s JOIN secret_versions sv ON sv.id = s.current_version_id
     WHERE s.env_id = ?1
     ORDER BY s.name`,
  )
    .bind(ref.env_id)
    .all<{ name: string } & WrappedSecret>();

  const lines: string[] = [];
  for (const r of results) {
    const value = await decryptSecret(r, c.env.KEK_B64);
    const escaped = value.includes('\n') || value.includes('"') || value.includes(' ')
      ? `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`
      : value;
    lines.push(`${r.name}=${escaped}`);
  }

  await log(c, {
    action: 'secret.bulk_read',
    scope: `${c.req.param('project')}/${c.req.param('env')}`,
    meta: { count: results.length },
  });
  return new Response(lines.join('\n') + '\n', {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
});
