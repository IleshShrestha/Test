import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16; // 128 bits
const KEY_LENGTH = 32; // 256 bits
const SALT_LENGTH = 64; // 512 bits
const ITERATIONS = 100000; // PBKDF2 iterations

function getSalt(): Buffer {
  // Option 1: Use salt from environment variable (recommended for production)
  const envSalt = process.env.ENCRYPTION_SALT;
  if (envSalt) {
    // If provided as hex string, convert it
    if (envSalt.length === SALT_LENGTH * 2) {
      // 64 bytes = 128 hex chars
      try {
        return Buffer.from(envSalt, "hex");
      } catch {
        throw new Error("ENCRYPTION_SALT must be a valid hex string");
      }
    }
    // If provided as base64, convert it
    try {
      const salt = Buffer.from(envSalt, "base64");
      if (salt.length === SALT_LENGTH) {
        return salt;
      }
      throw new Error(
        `ENCRYPTION_SALT must be ${SALT_LENGTH} bytes when base64 decoded`
      );
    } catch {
      throw new Error("ENCRYPTION_SALT must be valid hex or base64");
    }
  }

  return crypto.randomBytes(SALT_LENGTH);
}

/**
 * Get encryption key from environment variable
 * In production, use a proper key management service (AWS KMS, HashiCorp Vault, etc.)
 */
function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  const salt = getSalt();
  if (!key) {
    throw new Error("ENCRYPTION_KEY environment variable is not set");
  }
  // Derive key from password using PBKDF2
  return crypto.pbkdf2Sync(key, salt, ITERATIONS, KEY_LENGTH, "sha256");
}

export function encryptSSN(ssn: string): string {
  if (!ssn || typeof ssn !== "string") {
    throw new Error("SSN must be a non-empty string");
  }

  const key = getEncryptionKey();
  // Generate a random IV -> creates a different cipher text for the same plain text
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(ssn, "utf8", "hex");
  encrypted += cipher.final("hex");

  const tag = cipher.getAuthTag();

  // Combine IV + encrypted data + auth tag
  // Format: iv:encrypted:tag (all hex encoded)
  return `${iv.toString("hex")}:${encrypted}:${tag.toString("hex")}`;
}

export function decryptSSN(encryptedSSN: string): string {
  if (!encryptedSSN || typeof encryptedSSN !== "string") {
    throw new Error("Encrypted SSN must be a non-empty string");
  }

  const parts = encryptedSSN.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted SSN format");
  }

  const [ivHex, encrypted, tagHex] = parts;
  const key = getEncryptionKey();
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}
