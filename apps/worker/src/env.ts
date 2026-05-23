import type { TokenScopes } from './scopes';

export type Env = {
  DB: D1Database;
  KEK_B64: string;
  SESSION_SECRET: string;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  GITHUB_ALLOWED_LOGINS: string;
  APP_URL: string;
};

export type AuthCtx = {
  identityId: number;
  type: 'human' | 'machine';
  name: string;
  scopes: TokenScopes;
};

export type Variables = {
  auth: AuthCtx;
};
