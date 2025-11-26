import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from "@jest/globals";
import { authRouter } from "../auth";
import { db } from "@/lib/db";
import { users, sessions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const mockContext = {
  user: null,
  req: { headers: { cookie: "" } } as any,
  res: {
    setHeader: jest.fn(),
    set: jest.fn(),
  } as any,
};

/**
 * Backend Password Validation Tests
 * Tests password validation, hashing, and authentication
 */
describe("Password Validation - Backend", () => {
  const originalEnv = {
    ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
    ENCRYPTION_SALT: process.env.ENCRYPTION_SALT,
    JWT_SECRET: process.env.JWT_SECRET,
  };

  const testEmails = [
    "test1@example.com",
    "test2@example.com",
    "test3@example.com",
    "complex@example.com",
    "hash-test@example.com",
    "hash1@example.com",
    "hash2@example.com",
    "login-test@example.com",
    "wrong-pass@example.com",
    "case-test@example.com",
    "special@example.com",
    "unicode@example.com",
    "longpass@example.com",
    "nouppercase@example.com",
    "nolowercase@example.com",
    "nonumber@example.com",
    "nospecial@example.com",
  ];

  const baseUserData = {
    firstName: "Test",
    lastName: "User",
    phoneNumber: "+1234567890",
    dateOfBirth: "1990-01-01",
    ssn: "123456789",
    address: "123 Main St",
    city: "Test City",
    state: "CA",
    zipCode: "12345",
  };

  const createSignupData = (email: string, password: string) => ({
    email,
    password,
    ...baseUserData,
  });

  const cleanupUser = async (email: string) => {
    const user = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .get();
    if (user) {
      await db.delete(sessions).where(eq(sessions.userId, user.id));
      await db.delete(users).where(eq(users.id, user.id));
    }
  };

  beforeAll(() => {
    process.env.ENCRYPTION_KEY =
      "a6bee235e13a32abea12cf49ebb32f826cb2d256db9eb1b13356bff74cc0f9fe";
    process.env.ENCRYPTION_SALT =
      "c393c71185235c6e4f8930695009544e6c9f4dcf35806e87ef8fc93cd35d854a73d30e7844b4cf2b6e74e1cdd5908eb6a884be0894b42af65e8dacfdd7a8de5e";
    process.env.JWT_SECRET = "test-jwt-secret";
  });

  beforeEach(async () => {
    await Promise.all(testEmails.map(cleanupUser));
  });

  afterAll(async () => {
    await Promise.all(testEmails.map(cleanupUser));
    process.env.ENCRYPTION_KEY = originalEnv.ENCRYPTION_KEY;
    process.env.ENCRYPTION_SALT = originalEnv.ENCRYPTION_SALT;
    process.env.JWT_SECRET = originalEnv.JWT_SECRET;
  });

  describe("Password Length Requirements", () => {
    it("should reject passwords shorter than 12 characters", async () => {
      const caller = authRouter.createCaller(mockContext);
      await expect(
        caller.signup(createSignupData("test1@example.com", "Short1!"))
      ).rejects.toThrow();
    });

    it("should accept passwords with exactly 12 characters", async () => {
      const caller = authRouter.createCaller(mockContext);
      await expect(
        caller.signup(createSignupData("test2@example.com", "ValidPass12!"))
      ).resolves.toBeDefined();
    });

    it("should accept passwords longer than 12 characters", async () => {
      const caller = authRouter.createCaller(mockContext);
      await expect(
        caller.signup(
          createSignupData("test3@example.com", "VeryLongPassword123!@#")
        )
      ).resolves.toBeDefined();
    });
  });

  describe("Password Complexity Requirements", () => {
    it("should accept passwords with all required complexity elements", async () => {
      const caller = authRouter.createCaller(mockContext);
      const result = await caller.signup(
        createSignupData("complex@example.com", "ComplexPass123!@#")
      );

      expect(result.user).toBeDefined();
      expect(result.user.password).toBeUndefined();
    });

    it("should reject passwords without uppercase letters", async () => {
      const caller = authRouter.createCaller(mockContext);
      await expect(
        caller.signup(
          createSignupData("nouppercase@example.com", "lowercase123!@#")
        )
      ).rejects.toThrow("uppercase");
    });

    it("should reject passwords without lowercase letters", async () => {
      const caller = authRouter.createCaller(mockContext);
      await expect(
        caller.signup(
          createSignupData("nolowercase@example.com", "UPPERCASE123!@#")
        )
      ).rejects.toThrow("lowercase");
    });

    it("should reject passwords without numbers", async () => {
      const caller = authRouter.createCaller(mockContext);
      await expect(
        caller.signup(createSignupData("nonumber@example.com", "NoNumbers!@#"))
      ).rejects.toThrow("number");
    });

    it("should reject passwords without special characters", async () => {
      const caller = authRouter.createCaller(mockContext);
      await expect(
        caller.signup(createSignupData("nospecial@example.com", "NoSpecial123"))
      ).rejects.toThrow("special character");
    });
  });

  describe("Password Hashing", () => {
    it("should hash passwords before storing", async () => {
      const caller = authRouter.createCaller(mockContext);
      const testPassword = "TestPassword123!@#";

      await caller.signup(
        createSignupData("hash-test@example.com", testPassword)
      );

      const user = await db
        .select()
        .from(users)
        .where(eq(users.email, "hash-test@example.com"))
        .get();

      expect(user?.password).not.toBe(testPassword);
      expect(user?.password).not.toContain(testPassword);
      expect(user?.password.length).toBeGreaterThan(50);
      expect(user?.password.startsWith("$2")).toBe(true);
    });

    it("should produce different hashes for the same password", async () => {
      const caller = authRouter.createCaller(mockContext);
      const testPassword = "SamePassword123!@#";

      await caller.signup({
        ...createSignupData("hash1@example.com", testPassword),
        ssn: "111111111",
      });
      await caller.signup({
        ...createSignupData("hash2@example.com", testPassword),
        ssn: "222222222",
      });

      const user1 = await db
        .select()
        .from(users)
        .where(eq(users.email, "hash1@example.com"))
        .get();
      const user2 = await db
        .select()
        .from(users)
        .where(eq(users.email, "hash2@example.com"))
        .get();

      expect(user1!.password).not.toBe(user2!.password);

      const bcrypt = require("bcryptjs");
      expect(await bcrypt.compare(testPassword, user1!.password)).toBe(true);
      expect(await bcrypt.compare(testPassword, user2!.password)).toBe(true);
    });
  });

  describe("Password Login Verification", () => {
    const loginTest = async (email: string, password: string) => {
      const caller = authRouter.createCaller(mockContext);
      await caller.signup(createSignupData(email, password));
      const user = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .get();
      if (user) await db.delete(sessions).where(eq(sessions.userId, user.id));
      await new Promise((resolve) => setTimeout(resolve, 50));
      return caller.login({ email, password });
    };

    it("should verify correct password during login", async () => {
      const loginResult = await loginTest(
        "login-test@example.com",
        "LoginTest123!@#"
      );

      expect(loginResult.user).toBeDefined();
      expect(loginResult.token).toBeDefined();
      expect(loginResult.user.email).toBe("login-test@example.com");
    });

    it("should reject incorrect password during login", async () => {
      const caller = authRouter.createCaller(mockContext);
      await caller.signup(
        createSignupData("wrong-pass@example.com", "CorrectPass123!@#")
      );

      await expect(
        caller.login({
          email: "wrong-pass@example.com",
          password: "WrongPass123!@#",
        })
      ).rejects.toThrow("Invalid credentials");
    });

    it("should handle case-sensitive password verification", async () => {
      const caller = authRouter.createCaller(mockContext);
      const testPassword = "CaseSensitive123!@#";

      await caller.signup(
        createSignupData("case-test@example.com", testPassword)
      );
      const user = await db
        .select()
        .from(users)
        .where(eq(users.email, "case-test@example.com"))
        .get();
      if (user) await db.delete(sessions).where(eq(sessions.userId, user.id));

      await expect(
        caller.login({
          email: "case-test@example.com",
          password: "casesensitive123!@#",
        })
      ).rejects.toThrow("Invalid credentials");

      await new Promise((resolve) => setTimeout(resolve, 50));
      const loginResult = await caller.login({
        email: "case-test@example.com",
        password: testPassword,
      });

      expect(loginResult).toBeDefined();
    });
  });

  describe("Edge Cases", () => {
    it("should handle passwords with special characters", async () => {
      const caller = authRouter.createCaller(mockContext);
      const password = "Pass!@#$%^&*()_+-=[]{}|;:,.<>?123";
      const email = "special@example.com";

      const result = await caller.signup(createSignupData(email, password));
      expect(result).toBeDefined();

      const user = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .get();
      if (user) await db.delete(sessions).where(eq(sessions.userId, user.id));
      await new Promise((resolve) => setTimeout(resolve, 50));

      const loginResult = await caller.login({ email, password });
      expect(loginResult).toBeDefined();
    });

    it("should handle passwords with unicode characters", async () => {
      const caller = authRouter.createCaller(mockContext);
      const password = "UnicodePass123!@#ñáéíóú";
      const email = "unicode@example.com";

      const result = await caller.signup(createSignupData(email, password));
      expect(result).toBeDefined();

      const user = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .get();
      if (user) await db.delete(sessions).where(eq(sessions.userId, user.id));
      await new Promise((resolve) => setTimeout(resolve, 50));

      const loginResult = await caller.login({ email, password });
      expect(loginResult).toBeDefined();
    });

    it("should handle very long passwords", async () => {
      const caller = authRouter.createCaller(mockContext);
      const password = "VeryLongPassword123!@#" + "x".repeat(100);
      const email = "longpass@example.com";

      const result = await caller.signup(createSignupData(email, password));
      expect(result).toBeDefined();

      const user = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .get();
      if (user) await db.delete(sessions).where(eq(sessions.userId, user.id));
      await new Promise((resolve) => setTimeout(resolve, 50));

      const loginResult = await caller.login({ email, password });
      expect(loginResult).toBeDefined();
    });
  });
});
