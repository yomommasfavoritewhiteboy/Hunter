export function generatePsk256(): string {
  const bytes = new Uint8Array(32);
  if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function decodeBase64Bytes(b64: string): Uint8Array | null {
  try {
    const clean = b64.trim();
    if (!clean) return null;
    const binary = atob(clean);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      out[i] = binary.charCodeAt(i);
    }
    return out;
  } catch {
    return null;
  }
}

export function validatePskBase64(b64: string): { valid: boolean; bits: 128 | 256 | 0; error?: string } {
  const bytes = decodeBase64Bytes(b64);
  if (!bytes) {
    return { valid: false, bits: 0, error: 'Invalid Base64 PSK string.' };
  }
  if (bytes.length === 32) {
    return { valid: true, bits: 256 };
  }
  if (bytes.length === 16) {
    return { valid: true, bits: 128 };
  }
  return {
    valid: false,
    bits: 0,
    error: `Key must decode to 16 bytes (AES-128) or 32 bytes (AES-256); got ${bytes.length} bytes.`,
  };
}

function deriveKeystream(keyBytes: Uint8Array, nonce: Uint8Array, length: number): Uint8Array {
  const stream = new Uint8Array(length);
  let state = 0x9e3779b9;
  for (let i = 0; i < keyBytes.length; i++) {
    state = (state ^ ((keyBytes[i] + i * 31) << ((i % 4) * 8))) >>> 0;
  }
  for (let i = 0; i < nonce.length; i++) {
    state = (state ^ ((nonce[i] + 0x45d9f3b) << ((i % 3) * 8))) >>> 0;
  }
  for (let i = 0; i < length; i++) {
    state = (Math.imul(state ^ (state >>> 15), 0x85ebca6b) + i + keyBytes[i % keyBytes.length]) >>> 0;
    stream[i] = (state >>> ((i % 4) * 8)) & 0xff;
  }
  return stream;
}

export function encryptMeshtasticPayload(
  plaintext: string,
  pskBase64: string,
  packetId: number
): string {
  const keyBytes = decodeBase64Bytes(pskBase64) ?? new Uint8Array(32).fill(0x42);
  const encoder = new TextEncoder();
  const data = encoder.encode(plaintext);

  const nonce = new Uint8Array(8);
  nonce[0] = packetId & 0xff;
  nonce[1] = (packetId >>> 8) & 0xff;
  nonce[2] = (packetId >>> 16) & 0xff;
  nonce[3] = (packetId >>> 24) & 0xff;
  nonce[4] = keyBytes[0] ^ 0xa5;
  nonce[5] = keyBytes[1] ^ 0x5a;
  nonce[6] = data.length & 0xff;
  nonce[7] = 0x01;

  const keystream = deriveKeystream(keyBytes, nonce, data.length);
  const combined = new Uint8Array(nonce.length + data.length);
  combined.set(nonce, 0);
  for (let i = 0; i < data.length; i++) {
    combined[nonce.length + i] = data[i] ^ keystream[i];
  }

  return Array.from(combined)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function decryptMeshtasticPayload(ciphertextHex: string, pskBase64: string): string {
  const keyBytes = decodeBase64Bytes(pskBase64) ?? new Uint8Array(32).fill(0x42);
  const cleanHex = ciphertextHex.trim();
  if (cleanHex.length < 16 || cleanHex.length % 2 !== 0) {
    return '[Encrypted Frame]';
  }
  const combined = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < combined.length; i++) {
    combined[i] = parseInt(cleanHex.slice(i * 2, i * 2 + 2), 16);
  }
  const nonce = combined.slice(0, 8);
  const cipher = combined.slice(8);
  const keystream = deriveKeystream(keyBytes, nonce, cipher.length);
  const plain = new Uint8Array(cipher.length);
  for (let i = 0; i < cipher.length; i++) {
    plain[i] = cipher[i] ^ keystream[i];
  }
  try {
    return new TextDecoder().decode(plain);
  } catch {
    return '[Decryption Error]';
  }
}

export function pskToCppByteArray(pskBase64: string): string {
  const bytes = decodeBase64Bytes(pskBase64) ?? new Uint8Array(32).fill(0x01);
  return Array.from(bytes)
    .map((b) => `0x${b.toString(16).padStart(2, '0')}`)
    .join(', ');
}
