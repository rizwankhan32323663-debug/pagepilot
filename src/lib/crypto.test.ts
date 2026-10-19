/**
 * PagePilot token-crypto tests (AES-256-GCM, Web Crypto).
 * No network, no Deno, no real keys — fixed TEST keys only.
 */
import { describe, expect, it } from "vitest";
import { decryptToken, encryptToken, loadEncryptionKey } from "./core";

const KEY_A = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const KEY_B = "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
const TOKEN = "EAABtest123|page-access-token-xyz";

describe("token crypto (AES-256-GCM)", () => {
  it("roundtrips a token", async () => {
    const blob = await encryptToken(TOKEN, KEY_A);
    expect(blob).toContain(":");
    expect(blob).not.toContain(TOKEN);
    expect(await decryptToken(blob, KEY_A)).toBe(TOKEN);
  });

  it("produces different ciphertexts for the same plaintext (random IV)", async () => {
    const a = await encryptToken(TOKEN, KEY_A);
    const b = await encryptToken(TOKEN, KEY_A);
    expect(a).not.toBe(b);
    expect(await decryptToken(a, KEY_A)).toBe(TOKEN);
    expect(await decryptToken(b, KEY_A)).toBe(TOKEN);
  });

  it("fails closed with the wrong key (GCM auth failure)", async () => {
    const blob = await encryptToken(TOKEN, KEY_A);
    await expect(decryptToken(blob, KEY_B)).rejects.toThrow();
  });

  it("refuses empty plaintext", async () => {
    await expect(encryptToken("", KEY_A)).rejects.toThrow(/empty plaintext/);
  });

  it("refuses empty blob", async () => {
    await expect(decryptToken("", KEY_A)).rejects.toThrow(/empty blob/);
  });

  it("refuses malformed blobs", async () => {
    await expect(decryptToken("no-separator-here", KEY_A)).rejects.toThrow(/malformed/);
    const good = await encryptToken(TOKEN, KEY_A);
    const [ivB64, ctB64] = good.split(":");
    // Truncated IV -> wrong length
    await expect(decryptToken(`${ivB64.slice(0, 4)}:${ctB64}`, KEY_A)).rejects.toThrow(/malformed/);
    // Corrupted ciphertext -> GCM auth failure
    const badCt = ctB64.slice(0, -4) + "AAAA";
    await expect(decryptToken(`${ivB64}:${badCt}`, KEY_A)).rejects.toThrow();
  });

  it("refuses malformed keys", async () => {
    await expect(encryptToken(TOKEN, "too-short")).rejects.toThrow(/64 hex/);
    await expect(encryptToken(TOKEN, "zz".repeat(32))).rejects.toThrow(/64 hex/);
    await expect(decryptToken("a:b", KEY_A.slice(0, 32))).rejects.toThrow();
  });

  it("loadEncryptionKey reads env and fails loudly when missing/malformed", () => {
    expect(loadEncryptionKey({ process: { env: { TOKEN_ENCRYPTION_KEY: KEY_A } } })).toBe(KEY_A);
    expect(() => loadEncryptionKey({})).toThrow(/TOKEN_ENCRYPTION_KEY/);
    expect(() => loadEncryptionKey({ process: { env: {} } })).toThrow(/TOKEN_ENCRYPTION_KEY/);
    expect(() => loadEncryptionKey({ process: { env: { TOKEN_ENCRYPTION_KEY: "bad" } } })).toThrow(
      /TOKEN_ENCRYPTION_KEY/,
    );
  });
});
