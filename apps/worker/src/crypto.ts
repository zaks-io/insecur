import { b64decode, b64encode, randomBytes } from './util';

export type WrappedSecret = {
  ciphertext_b64: string;
  dek_wrapped_b64: string;
  ct_nonce_b64: string;
  dek_nonce_b64: string;
};

const importKek = async (kekB64: string): Promise<CryptoKey> => {
  const raw = b64decode(kekB64);
  if (raw.byteLength !== 32) {
    throw new Error('KEK_B64 must decode to exactly 32 bytes');
  }
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
};

export const encryptSecret = async (plaintext: string, kekB64: string): Promise<WrappedSecret> => {
  const kek = await importKek(kekB64);

  const dek = (await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  )) as CryptoKey;
  const ctNonce = randomBytes(12);
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: ctNonce },
    dek,
    new TextEncoder().encode(plaintext),
  );

  const dekRaw = (await crypto.subtle.exportKey('raw', dek)) as ArrayBuffer;
  const dekNonce = randomBytes(12);
  const dekWrapped = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: dekNonce }, kek, dekRaw);

  return {
    ciphertext_b64: b64encode(new Uint8Array(ct)),
    dek_wrapped_b64: b64encode(new Uint8Array(dekWrapped)),
    ct_nonce_b64: b64encode(ctNonce),
    dek_nonce_b64: b64encode(dekNonce),
  };
};

export const decryptSecret = async (w: WrappedSecret, kekB64: string): Promise<string> => {
  const kek = await importKek(kekB64);

  const dekRaw = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64decode(w.dek_nonce_b64) },
    kek,
    b64decode(w.dek_wrapped_b64),
  );
  const dek = await crypto.subtle.importKey('raw', dekRaw, { name: 'AES-GCM' }, false, ['decrypt']);

  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64decode(w.ct_nonce_b64) },
    dek,
    b64decode(w.ciphertext_b64),
  );
  return new TextDecoder().decode(pt);
};
