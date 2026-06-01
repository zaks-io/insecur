const BASE64URL_ALPHABET_PATTERN = /^[A-Za-z0-9_-]*$/u;

export function bytesToBase64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/gu, "-")
    .replace(/\//gu, "_")
    .replace(/=+$/u, "");
}

export function base64UrlToBytes(value: string): Uint8Array | null {
  if (!BASE64URL_ALPHABET_PATTERN.test(value)) {
    return null;
  }
  if (value.length % 4 === 1) {
    return null;
  }
  try {
    const normalized = value.replace(/-/gu, "+").replace(/_/gu, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  } catch {
    return null;
  }
}
