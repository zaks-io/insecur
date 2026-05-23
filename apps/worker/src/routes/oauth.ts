import { Hono } from 'hono';
import type { Env, Variables } from '../env';
import { b64urlencode, randomBytes } from '../util';
import { sessionCookie, signSession, clearSessionCookie } from '../session';
import { log } from '../audit';

const STATE_COOKIE = 'insecur_oauth_state';

const clearStateCookie = (): string =>
  `${STATE_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

export const oauthRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

oauthRoutes.get('/login', (c) => {
  const state = b64urlencode(randomBytes(24));
  const redirectUri = `${new URL(c.req.url).origin}/v1/auth/github/callback`;
  const url = new URL('https://github.com/login/oauth/authorize');
  url.searchParams.set('client_id', c.env.GITHUB_CLIENT_ID);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('scope', 'read:user');
  url.searchParams.set('state', state);

  return new Response(null, {
    status: 302,
    headers: {
      location: url.toString(),
      'set-cookie': `${STATE_COOKIE}=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
    },
  });
});

oauthRoutes.get('/callback', async (c) => {
  const url = new URL(c.req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const cookieHeader = c.req.header('cookie') ?? '';
  const cookieState = cookieHeader
    .split(';')
    .map(s => s.trim())
    .find(s => s.startsWith(`${STATE_COOKIE}=`))
    ?.slice(STATE_COOKIE.length + 1);

  if (!code || !state || !cookieState || state !== cookieState) {
    await log(c, { action: 'auth.callback', ok: false, meta: { reason: 'bad_state' } });
    return c.json({ error: 'bad_state' }, 400);
  }

  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({
      client_id: c.env.GITHUB_CLIENT_ID,
      client_secret: c.env.GITHUB_CLIENT_SECRET,
      code,
    }),
  });
  const tokenJson = (await tokenRes.json()) as { access_token?: string; error?: string };
  if (!tokenJson.access_token) {
    await log(c, { action: 'auth.callback', ok: false, meta: { reason: 'token_exchange' } });
    return c.json({ error: 'token_exchange_failed' }, 400);
  }

  const userRes = await fetch('https://api.github.com/user', {
    headers: {
      authorization: `Bearer ${tokenJson.access_token}`,
      accept: 'application/vnd.github+json',
      'user-agent': 'insecur',
    },
  });
  const user = (await userRes.json()) as { login?: string; name?: string };
  if (!user.login) {
    await log(c, { action: 'auth.callback', ok: false, meta: { reason: 'no_login' } });
    return c.json({ error: 'github_user_fetch_failed' }, 400);
  }

  const allowed = c.env.GITHUB_ALLOWED_LOGINS.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  if (!allowed.includes(user.login.toLowerCase())) {
    await log(c, { action: 'auth.callback', ok: false, target: user.login, meta: { reason: 'not_allowed' } });
    return c.json({ error: 'not_allowed', login: user.login }, 403);
  }

  await c.env.DB.prepare(
    `INSERT INTO identities (type, name, github_login)
     VALUES ('human', ?1, ?2)
     ON CONFLICT (github_login) DO UPDATE SET name = excluded.name`,
  )
    .bind(user.name ?? user.login, user.login)
    .run();

  const row = await c.env.DB.prepare(`SELECT id FROM identities WHERE github_login = ?1`)
    .bind(user.login)
    .first<{ id: number }>();
  if (!row) return c.json({ error: 'identity_lookup_failed' }, 500);

  const session = await signSession({ iid: row.id, login: user.login }, c.env.SESSION_SECRET);
  await log(c, { action: 'auth.login', target: user.login });
  const headers = new Headers({ location: '/' });
  headers.append('set-cookie', sessionCookie(session));
  headers.append('set-cookie', clearStateCookie());

  return new Response(null, {
    status: 302,
    headers,
  });
});

oauthRoutes.post('/logout', async (c) => {
  await log(c, { action: 'auth.logout' });
  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'content-type': 'application/json', 'set-cookie': clearSessionCookie() },
  });
});
