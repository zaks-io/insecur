const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;
const SECRET_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;

export const isSlug = (value: string): boolean => SLUG_RE.test(value);

export const isSecretName = (value: string): boolean => SECRET_NAME_RE.test(value);
