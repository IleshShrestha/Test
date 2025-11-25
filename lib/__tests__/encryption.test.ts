import { encryptSSN, decryptSSN } from "@/lib/encryption/encryption";
describe("SSN Encryption", () => {
  // Set a test encryption key before all tests
  const originalEnv = process.env.ENCRYPTION_KEY;
  const originalSalt = process.env.ENCRYPTION_SALT;
  beforeAll(() => {
    // These keys were generated for the purpose of testing the encryption and decryption functions
    process.env.ENCRYPTION_KEY =
      "a6bee235e13a32abea12cf49ebb32f826cb2d256db9eb1b13356bff74cc0f9fe";

    process.env.ENCRYPTION_SALT =
      "c393c71185235c6e4f8930695009544e6c9f4dcf35806e87ef8fc93cd35d854a73d30e7844b4cf2b6e74e1cdd5908eb6a884be0894b42af65e8dacfdd7a8de5e";
  });

  afterAll(() => {
    process.env.ENCRYPTION_KEY = originalEnv;
    process.env.ENCRYPTION_SALT = originalSalt;
  });

  describe("encryptSSN", () => {
    it("should encrypt a valid SSN", () => {
      const ssn = "123456789";
      const encrypted = encryptSSN(ssn);

      expect(encrypted).toBeDefined();
      expect(encrypted).not.toBe(ssn);
      expect(encrypted).toContain(":"); // Should have format iv:encrypted:tag
      expect(encrypted.split(":")).toHaveLength(3);
    });

    it("should produce different ciphertext for same SSN (random IV generation)", () => {
      const ssn = "123456789";
      const encrypted1 = encryptSSN(ssn);
      const encrypted2 = encryptSSN(ssn);

      // Same SSN should produce different encrypted values (due to random IV)
      expect(encrypted1).not.toBe(encrypted2);
    });

    it("should throw error for empty string", () => {
      expect(() => encryptSSN("")).toThrow("SSN must be a non-empty string");
    });

    it("should throw error for null/undefined", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(() => encryptSSN(null as any)).toThrow();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(() => encryptSSN(undefined as any)).toThrow();
    });
  });

  describe("decryptSSN", () => {
    it("should decrypt encrypted SSN correctly", () => {
      const originalSSN = "123456789";
      const encrypted = encryptSSN(originalSSN);
      const decrypted = decryptSSN(encrypted);

      expect(decrypted).toBe(originalSSN);
    });

    it("should handle multiple encrypt/decrypt cycles", () => {
      const ssn = "987654321";

      // Encrypt and decrypt multiple times
      let encrypted = encryptSSN(ssn);
      let decrypted = decryptSSN(encrypted);
      expect(decrypted).toBe(ssn);

      encrypted = encryptSSN(ssn);
      decrypted = decryptSSN(encrypted);
      expect(decrypted).toBe(ssn);
    });

    it("should throw error for invalid format", () => {
      expect(() => decryptSSN("invalid-format")).toThrow(
        "Invalid encrypted SSN format"
      );
      expect(() => decryptSSN("part1:part2")).toThrow(
        "Invalid encrypted SSN format"
      );
    });

    it("should throw error for tampered data", () => {
      const encrypted = encryptSSN("123456789");
      const parts = encrypted.split(":");
      // Tamper with the encrypted data
      const tampered = `${parts[0]}:${parts[1]}00:${parts[2]}`;

      expect(() => decryptSSN(tampered)).toThrow();
    });

    it("should throw error for empty string", () => {
      expect(() => decryptSSN("")).toThrow(
        "Encrypted SSN must be a non-empty string"
      );
    });
  });

  describe("Integration with auth flow", () => {
    it("should encrypt and decrypt SSN in signup scenario", () => {
      const userSSN = "555123456";

      // Simulate signup: encrypt before storing
      const encryptedForStorage = encryptSSN(userSSN);

      // Simulate retrieval: decrypt when needed
      const decryptedForUse = decryptSSN(encryptedForStorage);

      expect(decryptedForUse).toBe(userSSN);
      expect(encryptedForStorage).not.toContain(userSSN);
    });
  });
});
