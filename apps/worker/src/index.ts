import { Hono } from 'hono';
import type { Env, Variables } from './env';
import { requireAuth } from './auth';
import { oauthRoutes } from './routes/oauth';
import { projectRoutes } from './routes/projects';
import { secretRoutes } from './routes/secrets';
import { tokenRoutes } from './routes/tokens';

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

app.use('*', async (c, next) => {
  await next();
  c.header('x-content-type-options', 'nosniff');
  c.header('x-frame-options', 'DENY');
  c.header('referrer-policy', 'no-referrer');
  c.header('permissions-policy', 'camera=(), microphone=(), geolocation=()');
});

app.use('/v1/*', async (c, next) => {
  await next();
  c.header('cache-control', 'no-store');
});

app.get('/health', (c) => c.json({ ok: true }));

app.route('/v1/auth/github', oauthRoutes);

const api = new Hono<{ Bindings: Env; Variables: Variables }>();
api.use('*', requireAuth());
api.get('/me', (c) => c.json({ identity: c.get('auth') }));
api.route('/projects', projectRoutes);
api.route('/projects', secretRoutes);
api.route('/tokens', tokenRoutes);
app.route('/v1', api);

app.onError((err, c) => {
  console.error('unhandled', err);
  return c.json({ error: 'internal_error' }, 500);
});

app.notFound((c) => c.json({ error: 'not_found' }, 404));

export default app;
