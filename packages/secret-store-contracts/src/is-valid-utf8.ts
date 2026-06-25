function isContinuation(bytes: Uint8Array, start: number, count: number): boolean {
  for (let offset = 0; offset < count; offset += 1) {
    const byte = bytes[start + offset];
    if (byte === undefined || byte < 0x80 || byte > 0xbf) {
      return false;
    }
  }
  return start + count <= bytes.byteLength;
}

function readTwoByteSequence(bytes: Uint8Array, index: number, lead: number): number | null {
  if (lead >= 0xc2 && lead <= 0xdf) {
    return isContinuation(bytes, index + 1, 1) ? index + 2 : null;
  }
  return null;
}

function readThreeByteSequence(bytes: Uint8Array, index: number, lead: number): number | null {
  const b1 = bytes[index + 1];
  if (b1 === undefined) {
    return null;
  }

  if (lead === 0xe0) {
    return b1 >= 0xa0 && b1 <= 0xbf && isContinuation(bytes, index + 2, 1) ? index + 3 : null;
  }
  if (lead >= 0xe1 && lead <= 0xec) {
    return isContinuation(bytes, index + 1, 2) ? index + 3 : null;
  }
  if (lead === 0xed) {
    return b1 >= 0x80 && b1 <= 0x9f && isContinuation(bytes, index + 2, 1) ? index + 3 : null;
  }
  if (lead >= 0xee && lead <= 0xef) {
    return isContinuation(bytes, index + 1, 2) ? index + 3 : null;
  }
  return null;
}

function readFourByteSequence(bytes: Uint8Array, index: number, lead: number): number | null {
  const b1 = bytes[index + 1];
  if (b1 === undefined) {
    return null;
  }

  if (lead === 0xf0) {
    return b1 >= 0x90 && b1 <= 0xbf && isContinuation(bytes, index + 2, 2) ? index + 4 : null;
  }
  if (lead >= 0xf1 && lead <= 0xf3) {
    return isContinuation(bytes, index + 1, 3) ? index + 4 : null;
  }
  if (lead === 0xf4) {
    return b1 >= 0x80 && b1 <= 0x8f && isContinuation(bytes, index + 2, 2) ? index + 4 : null;
  }
  return null;
}

/** Returns true when bytes are valid UTF-8 (no replacement-character decoding). */
export function isValidUtf8(bytes: Uint8Array): boolean {
  let index = 0;
  while (index < bytes.byteLength) {
    const lead = bytes[index];
    if (lead === undefined) {
      return false;
    }

    if (lead <= 0x7f) {
      index += 1;
      continue;
    }

    const twoByte = readTwoByteSequence(bytes, index, lead);
    if (twoByte !== null) {
      index = twoByte;
      continue;
    }

    const threeByte = readThreeByteSequence(bytes, index, lead);
    if (threeByte !== null) {
      index = threeByte;
      continue;
    }

    const fourByte = readFourByteSequence(bytes, index, lead);
    if (fourByte !== null) {
      index = fourByte;
      continue;
    }

    return false;
  }

  return true;
}
