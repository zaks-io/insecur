import type { Context } from 'hono';
import type { Env, Variables } from './env';

export const log = async (
  c: Context<{ Bindings: Env; Variables: Variables }>,
  args: { action: string; scope?: string; target?: string; ok?: boolean; meta?: unknown },
): Promise<void> => {
  const auth = c.get('auth');
  const ip = c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for') ?? null;
  const ua = c.req.header('user-agent') ?? null;

  c.executionCtx.waitUntil(
    c.env.DB.prepare(
      `INSERT INTO audit_log (identity_id, action, scope, target, ip, ua, ok, meta_json)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
    )
      .bind(
        auth?.identityId ?? null,
        args.action,
        args.scope ?? null,
        args.target ?? null,
        ip,
        ua,
        args.ok === false ? 0 : 1,
        args.meta ? JSON.stringify(args.meta) : null,
      )
      .run(),
  );
};
