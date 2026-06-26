import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const algorithm = "aes-256-gcm";

function getOrCreateSecret(secretPath: string): Buffer {
  if (existsSync(secretPath)) {
    return readFileSync(secretPath);
  }

  mkdirSync(dirname(secretPath), { recursive: true });
  const secret = randomBytes(32);
  writeFileSync(secretPath, secret, { mode: 0o600 });
  return secret;
}

export function encryptText(plainText: string, secretPath: string): string {
  const key = getOrCreateSecret(secretPath);
  const iv = randomBytes(12);
  const cipher = createCipheriv(algorithm, key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), encrypted.toString("base64")].join(".");
}

export function decryptText(payload: string, secretPath: string): string {
  const key = getOrCreateSecret(secretPath);
  const [ivText, tagText, encryptedText] = payload.split(".");

  if (!ivText || !tagText || !encryptedText) {
    throw new Error("Invalid encrypted payload.");
  }

  const decipher = createDecipheriv(algorithm, key, Buffer.from(ivText, "base64"));
  decipher.setAuthTag(Buffer.from(tagText, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedText, "base64")),
    decipher.final()
  ]).toString("utf8");
}
