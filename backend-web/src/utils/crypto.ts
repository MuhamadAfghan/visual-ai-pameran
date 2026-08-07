import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12; // 96-bit recommended for GCM
const TAG_BYTES = 16;

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * @param plaintext - The string to encrypt
 * @param keyHex   - 64-character hex string (32 bytes)
 * @returns Colon-delimited hex string: `iv:authTag:ciphertext`
 */
export function encrypt(plaintext: string, keyHex: string): string {
  const key = Buffer.from(keyHex, "hex");
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

/**
 * Decrypts a value produced by `encrypt()`.
 * @throws If the format is invalid or authentication tag fails (tampered data)
 */
export function decrypt(ciphertext: string, keyHex: string): string {
  const parts = ciphertext.split(":");
  if (parts.length !== 3) throw new Error("Invalid encrypted value format");

  const [ivHex, tagHex, dataHex] = parts;
  const key = Buffer.from(keyHex, "hex");
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const data = Buffer.from(dataHex, "hex");

  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
    throw new Error("Invalid encrypted value lengths");
  }

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

/** Returns true if the string looks like an AES-GCM encrypted value (`iv:tag:data`). */
export function isEncrypted(value: string): boolean {
  const parts = value.split(":");
  return (
    parts.length === 3 &&
    parts[0].length === IV_BYTES * 2 &&
    parts[1].length === TAG_BYTES * 2
  );
}
