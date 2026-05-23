import { isSlug } from './validation';

export const TOKEN_ACTIONS = ['read', 'write'] as const;

export type TokenAction = (typeof TOKEN_ACTIONS)[number];

export type TokenScopes = {
  projects: string[];
  actions: TokenAction[];
};

type ScopedAuth = {
  type: 'human' | 'machine';
  scopes: TokenScopes;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isTokenAction = (value: string): value is TokenAction =>
  TOKEN_ACTIONS.includes(value as TokenAction);

export const humanScopes = (): TokenScopes => ({
  projects: ['*'],
  actions: ['read', 'write'],
});

export const defaultTokenScopes = (): TokenScopes => ({
  projects: ['*'],
  actions: ['read'],
});

export const normalizeTokenScopes = (value: unknown): TokenScopes | null => {
  if (!isRecord(value) || !Array.isArray(value.projects) || !Array.isArray(value.actions)) {
    return null;
  }

  const projects = [...new Set(value.projects.map(project => (
    typeof project === 'string' ? project.trim().toLowerCase() : ''
  )))].filter(Boolean);
  const actions = [...new Set(value.actions.map(action => (
    typeof action === 'string' ? action.trim().toLowerCase() : ''
  )))].filter(Boolean);

  if (projects.length === 0 || actions.length === 0) return null;
  if (!projects.every(project => project === '*' || isSlug(project))) return null;
  if (!actions.every(isTokenAction)) return null;

  return {
    projects: projects.includes('*') ? ['*'] : projects,
    actions,
  };
};

export const parseStoredScopes = (value: string): TokenScopes | null => {
  try {
    return normalizeTokenScopes(JSON.parse(value));
  } catch {
    return null;
  }
};

export const canAccessProject = (
  auth: ScopedAuth,
  projectSlug: string,
  action: TokenAction,
): boolean => {
  if (auth.type === 'human') return true;
  if (!auth.scopes.actions.includes(action)) return false;
  return auth.scopes.projects.includes('*') || auth.scopes.projects.includes(projectSlug.toLowerCase());
};
