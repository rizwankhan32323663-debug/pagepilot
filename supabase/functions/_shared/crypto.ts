// PagePilot token encryption — AES-256-GCM via the Web Crypto API.
// ZERO runtime imports: safe to import from Deno Edge Functions, Vite, and vitest.
// Tokens are encrypted at rest in Postgres text columns; the key lives ONLY in
// the TOKEN_ENCRYPTION_KEY server env var (64 hex chars = 32 bytes).
// Wire format: base64(iv) + ":" + base64(ciphertext). The IV is random per
// encryption, so identical tokens produce different ciphertexts.

const GCM_IV_BYTES = 12;
const KEY_HEX_RE = /^[0-9a-fA-F]{64}$/;

function keyBytes(keyHex: string): Uint8Array<ArrayBuffer> {
  if (!KEY_HEX_RE.test(keyHex)) {
    throw new Error("token crypto: key must be exactly 64 hex chars (32 bytes)");
  }
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) out[i] = parseInt(keyHex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function bytesToBase64(bytes: Uint8Array<ArrayBuffer>): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(b64); // throws on invalid base64
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

async function importKey(keyHex: string, usage: "encrypt" | "decrypt"): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", keyBytes(keyHex), { name: "AES-GCM" }, false, [usage]);
}

/** Encrypt a token. Throws on empty input or a malformed key. Never logs the plaintext. */
export async function encryptToken(plaintext: string, keyHex: string): Promise<string> {
  if (!plaintext) throw new Error("encryptToken: empty plaintext refused");
  const key = await importKey(keyHex, "encrypt");
  const iv = crypto.getRandomValues(new Uint8Array(GCM_IV_BYTES));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext)),
  );
  return `${bytesToBase64(iv)}:${bytesToBase64(ct)}`;
}

/**
 * Decrypt a token blob. Throws on empty/malformed input, a bad key, or a wrong
 * key (AES-GCM authentication failure — fails closed, no partial output).
 */
export async function decryptToken(blob: string, keyHex: string): Promise<string> {
  if (!blob) throw new Error("decryptToken: empty blob refused");
  const sep = blob.indexOf(":");
  if (sep <= 0) throw new Error("decryptToken: malformed ciphertext blob");
  const iv = base64ToBytes(blob.slice(0, sep));
  const ct = base64ToBytes(blob.slice(sep + 1));
  if (iv.length !== GCM_IV_BYTES || ct.length === 0) {
    throw new Error("decryptToken: malformed ciphertext blob");
  }
  const key = await importKey(keyHex, "decrypt");
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return new TextDecoder().decode(pt);
}

interface EnvLike {
  Deno?: { env: { get(name: string): string | undefined } };
  process?: { env?: Record<string, string | undefined> };
}

/**
 * Read TOKEN_ENCRYPTION_KEY from the server environment (Deno first, then
 * Node). Fails LOUDLY when missing or malformed — a function must never run
 * with a weak or absent encryption key.
 */
export function loadEncryptionKey(env: unknown = globalThis): string {
  const g = env as EnvLike;
  const key = g.Deno?.env.get("TOKEN_ENCRYPTION_KEY") ?? g.process?.env?.["TOKEN_ENCRYPTION_KEY"] ?? "";
  if (!KEY_HEX_RE.test(key)) {
    throw new Error(
      "Server misconfigured: TOKEN_ENCRYPTION_KEY must be set to a 64-char hex string " +
        "(generate with: openssl rand -hex 32)",
    );
  }
  return key;
}
