# Setup

Phase 1 (this commit) gets you a working secrets API + CLI. No UI yet; you'll create projects/envs/tokens via curl.

## 0. Install

Run these commands from the repo root unless a step says otherwise.

```bash
pnpm install
```

Requires Node 20+ and a Cloudflare account.

## 1. Create the D1 database

```bash
pnpm --filter @insecur/worker exec wrangler login
pnpm --filter @insecur/worker exec wrangler d1 create insecur
```

Copy the `database_id` from the output into `apps/worker/wrangler.toml`, replacing `REPLACE_WITH_YOUR_D1_ID`.

## 2. Generate secrets

```bash
openssl rand -base64 32   # KEK_B64
openssl rand -base64 48   # SESSION_SECRET
```

Save these somewhere safe (you cannot recover encrypted data without KEK_B64).

## 3. Create a GitHub OAuth app

1. Visit <https://github.com/settings/developers> → New OAuth App
2. **Homepage URL**: `https://insecur.<your-subdomain>.workers.dev`
3. **Authorization callback URL**: `https://insecur.<your-subdomain>.workers.dev/v1/auth/github/callback`
4. Note the Client ID. Generate a Client Secret.

## 4. Set Worker secrets

```bash
echo "<KEK_B64>"           | pnpm --filter @insecur/worker exec wrangler secret put KEK_B64
echo "<SESSION_SECRET>"    | pnpm --filter @insecur/worker exec wrangler secret put SESSION_SECRET
echo "<client_id>"         | pnpm --filter @insecur/worker exec wrangler secret put GITHUB_CLIENT_ID
echo "<client_secret>"     | pnpm --filter @insecur/worker exec wrangler secret put GITHUB_CLIENT_SECRET
echo "your-github-login"   | pnpm --filter @insecur/worker exec wrangler secret put GITHUB_ALLOWED_LOGINS
```

`GITHUB_ALLOWED_LOGINS` is comma-separated. Only listed users can sign in.

## 5. Apply migrations

```bash
pnpm migrate:remote
```

For local dev:
```bash
pnpm migrate:local
pnpm dev:worker
```

## 6. Deploy

```bash
pnpm deploy:worker
```

Update `APP_URL` in `wrangler.toml` to your deployed URL and redeploy if needed.

## 7. First login (human)

Visit `https://<your-worker>/v1/auth/github/login`. You'll be sent through GitHub OAuth and end up with an `insecur_session` cookie.

## 8. Create a project + environment

```bash
curl -X POST https://<worker>/v1/projects \
  -b cookies.txt \
  -H 'content-type: application/json' \
  -d '{"slug":"site","name":"Marketing site"}'

curl -X POST https://<worker>/v1/projects/site/envs \
  -b cookies.txt \
  -H 'content-type: application/json' \
  -d '{"slug":"prod","name":"Production"}'
```

(Use your browser's session cookie via `--cookie "insecur_session=…"`.)

## 9. Mint a machine token

```bash
curl -X POST https://<worker>/v1/tokens \
  -b cookies.txt \
  -H 'content-type: application/json' \
  -d '{"name":"my-laptop","scopes":{"projects":["*"],"actions":["read","write"]}}'
```

Response includes a `token` string. Copy it.

## 10. Use the CLI

```bash
cd packages/cli
pnpm build
pnpm link --global   # or use ./dist/index.js directly

insecur login --host https://<worker> --token ins_live_...
insecur pull -p site -e prod              # prints .env to stdout
insecur pull -p site -e prod -o .env      # writes to file
insecur run  -p site -e prod -- npm start # spawns child with env injected
```

## 11. Write secrets

```bash
curl -X PUT https://<worker>/v1/projects/site/envs/prod/secrets/STRIPE_KEY \
  -H "authorization: Bearer ins_live_..." \
  -H 'content-type: application/json' \
  -d '{"value":"sk_live_abc123"}'
```

## What's not in Phase 1

- UI (Phase 3)
- GitHub Actions OIDC federation (Phase 2)
- Sync engines to Vercel/GitHub/Cloudflare (Phase 3)
- Rotation framework + R2 backups (Phase 4)
