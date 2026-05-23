import { b64urldecode, b64urlencode, constantTimeEqual } from './util';

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14;

export type SessionPayload = {
  iid: number;
  login: string;
  exp: number;
};

const importSigningKey = async (secret: string): Promise<CryptoKey> =>
  crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );

export const signSession = async (payload: Omit<SessionPayload, 'exp'>, secret: string): Promise<string> => {
  const full: SessionPayload = { ...payload, exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS };
  const body = b64urlencode(new TextEncoder().encode(JSON.stringify(full)));
  const key = await importSigningKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return `${body}.${b64urlencode(new Uint8Array(sig))}`;
};

export const verifySession = async (cookie: string, secret: string): Promise<SessionPayload | null> => {
  const [body, sig] = cookie.split('.');
  if (!body || !sig) return null;

  const key = await importSigningKey(secret);
  const expected = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  const expectedB64 = b64urlencode(new Uint8Array(expected));
  if (!constantTimeEqual(sig, expectedB64)) return null;

  try {
    const payload = JSON.parse(new TextDecoder().decode(b64urldecode(body))) as SessionPayload;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
};

export const sessionCookie = (value: string, maxAge = SESSION_TTL_SECONDS): string =>
  `insecur_session=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;

export const clearSessionCookie = (): string =>
  `insecur_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
