import { Hono } from 'hono';
import type { Env, Variables } from '../env';
import { requireHuman } from '../auth';
import { canAccessProject } from '../scopes';
import { isSlug } from '../validation';
import { log } from '../audit';

export const projectRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

type ProjectRow = { id: number; slug: string; name: string; created_at: string };

projectRoutes.get('/', async (c) => {
  const auth = c.get('auth');
  const { results } = await c.env.DB.prepare(`SELECT id, slug, name, created_at FROM projects ORDER BY slug`)
    .all<ProjectRow>();
  const projects = results.filter(project =>
    canAccessProject(auth, project.slug, 'read') || canAccessProject(auth, project.slug, 'write'));
  return c.json({ projects });
});

projectRoutes.post('/', requireHuman(), async (c) => {
  const body = await c.req.json<{ slug: string; name: string }>();
  if (!body.slug || !body.name) return c.json({ error: 'missing_fields' }, 400);
  if (!isSlug(body.slug)) return c.json({ error: 'invalid_slug' }, 400);
  try {
    await c.env.DB.prepare(`INSERT INTO projects (slug, name) VALUES (?1, ?2)`).bind(body.slug, body.name).run();
  } catch (e) {
    return c.json({ error: 'slug_taken' }, 409);
  }
  await log(c, { action: 'project.create', target: body.slug });
  return c.json({ ok: true });
});

projectRoutes.get('/:slug/envs', async (c) => {
  const auth = c.get('auth');
  const slug = c.req.param('slug');
  if (!isSlug(slug)) return c.json({ error: 'invalid_slug' }, 400);
  if (!canAccessProject(auth, slug, 'read') && !canAccessProject(auth, slug, 'write')) {
    await log(c, {
      action: 'authz.denied',
      scope: slug,
      target: auth.name,
      meta: { required_action: 'read' },
    });
    return c.json({ error: 'forbidden' }, 403);
  }

  const { results } = await c.env.DB.prepare(
    `SELECT e.id, e.slug, e.name, e.created_at
     FROM environments e JOIN projects p ON p.id = e.project_id
     WHERE p.slug = ?1
     ORDER BY e.slug`,
  )
    .bind(slug)
    .all();
  return c.json({ environments: results });
});

projectRoutes.post('/:slug/envs', requireHuman(), async (c) => {
  const slug = c.req.param('slug');
  const body = await c.req.json<{ slug: string; name: string }>();
  if (!body.slug || !body.name) return c.json({ error: 'missing_fields' }, 400);
  if (!isSlug(slug) || !isSlug(body.slug)) return c.json({ error: 'invalid_slug' }, 400);
  const project = await c.env.DB.prepare(`SELECT id FROM projects WHERE slug = ?1`).bind(slug).first<{ id: number }>();
  if (!project) return c.json({ error: 'project_not_found' }, 404);

  try {
    await c.env.DB.prepare(`INSERT INTO environments (project_id, slug, name) VALUES (?1, ?2, ?3)`)
      .bind(project.id, body.slug, body.name)
      .run();
  } catch (e) {
    return c.json({ error: 'env_slug_taken' }, 409);
  }
  await log(c, { action: 'environment.create', scope: slug, target: body.slug });
  return c.json({ ok: true });
});
