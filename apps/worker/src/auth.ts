import type { Context, MiddlewareHandler } from 'hono';
import type { AuthCtx, Env, Variables } from './env';
import { log } from './audit';
import { canAccessProject, humanScopes, parseStoredScopes, type TokenAction } from './scopes';
import { sha256hex } from './util';
import { verifySession } from './session';

type Ctx = Context<{ Bindings: Env; Variables: Variables }>;

const readSessionCookie = (c: Ctx): string | null => {
  const cookie = c.req.header('cookie');
  if (!cookie) return null;
  const match = cookie.split(';').map(s => s.trim()).find(s => s.startsWith('insecur_session='));
  return match ? match.slice('insecur_session='.length) : null;
};

const resolveBearer = async (c: Ctx, token: string): Promise<AuthCtx | null> => {
  const hash = await sha256hex(token);
  const row = await c.env.DB.prepare(
    `SELECT t.id AS tid, t.scopes_json, t.expires_at, t.revoked_at, i.id AS iid, i.type, i.name
     FROM tokens t JOIN identities i ON i.id = t.identity_id
     WHERE t.hash = ?1`,
  )
    .bind(hash)
    .first<{
      tid: number;
      scopes_json: string;
      expires_at: string | null;
      revoked_at: string | null;
      iid: number;
      type: 'human' | 'machine';
      name: string;
    }>();

  if (!row) return null;
  if (row.revoked_at) return null;
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) return null;
  const scopes = parseStoredScopes(row.scopes_json);
  if (!scopes) return null;

  c.executionCtx.waitUntil(
    c.env.DB.prepare(`UPDATE tokens SET last_used_at = datetime('now') WHERE id = ?1`).bind(row.tid).run(),
  );

  return { identityId: row.iid, type: row.type, name: row.name, scopes };
};

const resolveSession = async (c: Ctx): Promise<AuthCtx | null> => {
  const raw = readSessionCookie(c);
  if (!raw) return null;
  const payload = await verifySession(raw, c.env.SESSION_SECRET);
  if (!payload) return null;
  const row = await c.env.DB.prepare(`SELECT id, type, name FROM identities WHERE id = ?1`)
    .bind(payload.iid)
    .first<{ id: number; type: 'human' | 'machine'; name: string }>();
  if (!row) return null;
  return { identityId: row.id, type: row.type, name: row.name, scopes: humanScopes() };
};

export const requireAuth = (): MiddlewareHandler<{ Bindings: Env; Variables: Variables }> => async (c, next) => {
  const authHeader = c.req.header('authorization');
  let ctx: AuthCtx | null = null;

  if (authHeader?.startsWith('Bearer ')) {
    ctx = await resolveBearer(c as Ctx, authHeader.slice('Bearer '.length).trim());
  } else {
    ctx = await resolveSession(c as Ctx);
  }

  if (!ctx) return c.json({ error: 'unauthorized' }, 401);
  c.set('auth', ctx);
  await next();
};

export const requireHuman = (): MiddlewareHandler<{ Bindings: Env; Variables: Variables }> => async (c, next) => {
  const auth = c.get('auth');
  if (auth.type !== 'human') {
    await log(c, { action: 'authz.denied', target: auth.name, meta: { reason: 'human_required' } });
    return c.json({ error: 'forbidden' }, 403);
  }

  await next();
};

export const requireProjectScope = (
  action: TokenAction,
  projectParam = 'project',
): MiddlewareHandler<{ Bindings: Env; Variables: Variables }> => async (c, next) => {
  const auth = c.get('auth');
  const project = c.req.param(projectParam);
  if (!project || !canAccessProject(auth, project, action)) {
    await log(c, {
      action: 'authz.denied',
      ...(project ? { scope: project } : {}),
      target: auth.name,
      meta: { required_action: action },
    });
    return c.json({ error: 'forbidden' }, 403);
  }

  await next();
};
