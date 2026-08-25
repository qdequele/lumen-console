import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Gateway master keys are stored in `gateway_secrets` encrypted with
 * AES-256-GCM under CONSOLE_ENCRYPTION_KEY (32 bytes, base64). The database
 * alone can never recover a master key; the console server alone holds
 * nothing. Generate a key with:
 *
 *   openssl rand -base64 32
 */
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function encryptionKey(): Buffer {
  const raw = process.env.CONSOLE_ENCRYPTION_KEY;
  if (!raw) throw new Error("CONSOLE_ENCRYPTION_KEY is not set");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("CONSOLE_ENCRYPTION_KEY must be 32 bytes of base64 (openssl rand -base64 32)");
  }
  return key;
}

/** base64(iv || ciphertext || tag) */
export function sealSecret(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, ciphertext, cipher.getAuthTag()]).toString("base64");
}

export function openSecret(sealed: string): string {
  const raw = Buffer.from(sealed, "base64");
  if (raw.length < IV_LENGTH + TAG_LENGTH) {
    throw new Error("sealed secret is malformed");
  }
  const iv = raw.subarray(0, IV_LENGTH);
  const tag = raw.subarray(raw.length - TAG_LENGTH);
  const ciphertext = raw.subarray(IV_LENGTH, raw.length - TAG_LENGTH);
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
