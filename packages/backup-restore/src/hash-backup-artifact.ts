import { bytesToBase64Url } from "@insecur/domain";

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

/** SHA-256 digest of the sealed artifact bytes, encoded as metadata-safe base64url. */
export async function hashBackupArtifact(sealedArtifact: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", toArrayBuffer(sealedArtifact));
  return bytesToBase64Url(new Uint8Array(digest));
}
