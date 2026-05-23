import { Hono } from 'hono';
import type { Env, Variables } from '../env';
import { requireHuman } from '../auth';
import { defaultTokenScopes, normalizeTokenScopes } from '../scopes';
import { b64urlencode, randomBytes, sha256hex } from '../util';
import { log } from '../audit';

export const tokenRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

tokenRoutes.use('*', requireHuman());

tokenRoutes.post('/', async (c) => {
  const body = await c.req.json<{ name: string; scopes: unknown; expires_in_days?: number }>();
  if (!body.name) return c.json({ error: 'name_required' }, 400);
  if (
    body.expires_in_days !== undefined
    && (!Number.isInteger(body.expires_in_days) || body.expires_in_days < 1 || body.expires_in_days > 365)
  ) {
    return c.json({ error: 'invalid_expiry', message: 'expires_in_days must be an integer from 1 to 365' }, 400);
  }

  const scopes = normalizeTokenScopes(body.scopes ?? defaultTokenScopes());
  if (!scopes) {
    return c.json({
      error: 'invalid_scopes',
      expected: { projects: ['*'], actions: ['read', 'write'] },
    }, 400);
  }

  const identityRes = await c.env.DB.prepare(
    `INSERT INTO identities (type, name) VALUES ('machine', ?1)`,
  )
    .bind(body.name)
    .run();
  const identityId = identityRes.meta?.last_row_id;
  if (!identityId) return c.json({ error: 'identity_create_failed' }, 500);

  const tokenPlain = `ins_live_${b64urlencode(randomBytes(32))}`;
  const hash = await sha256hex(tokenPlain);
  const expiresAt = body.expires_in_days
    ? new Date(Date.now() + body.expires_in_days * 86400 * 1000).toISOString()
    : null;

  await c.env.DB.prepare(
    `INSERT INTO tokens (identity_id, hash, scopes_json, expires_at) VALUES (?1, ?2, ?3, ?4)`,
  )
    .bind(identityId, hash, JSON.stringify(scopes), expiresAt)
    .run();

  await log(c, { action: 'token.create', target: body.name, meta: { scopes } });
  return c.json({ token: tokenPlain, identity_id: identityId, scopes });
});

tokenRoutes.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT t.id, i.name, t.scopes_json, t.created_at, t.expires_at, t.last_used_at, t.revoked_at
     FROM tokens t JOIN identities i ON i.id = t.identity_id
     WHERE i.type = 'machine'
     ORDER BY t.created_at DESC`,
  ).all();
  return c.json({ tokens: results });
});

tokenRoutes.post('/:id/revoke', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) return c.json({ error: 'invalid_token_id' }, 400);
  await c.env.DB.prepare(`UPDATE tokens SET revoked_at = datetime('now') WHERE id = ?1`).bind(id).run();
  await log(c, { action: 'token.revoke', target: String(id) });
  return c.json({ ok: true });
});
