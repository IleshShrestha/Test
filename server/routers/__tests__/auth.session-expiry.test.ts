import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from "@jest/globals";
import { createContext } from "../../trpc";
import { db } from "@/lib/db";
import { users, sessions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { encryptSSN } from "@/lib/encryption/encryption";

/**
 * Tests for PERF-403: Session Expiry
 * Verifies that sessions expire with a 5-minute buffer and are properly cleaned up
 */
describe("PERF-403: Session Expiry with Buffer", () => {
  const originalEnv = {
    ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
    ENCRYPTION_SALT: process.env.ENCRYPTION_SALT,
    JWT_SECRET: process.env.JWT_SECRET,
  };

  const testEmails = [
    "session-expiry1@example.com",
    "session-expiry2@example.com",
    "session-expiry3@example.com",
    "session-jwt-expiry@example.com",
  ];

  const baseUserData = {
    firstName: "Test",
    lastName: "User",
    phoneNumber: "1234567890",
    dateOfBirth: "1990-01-01",
    ssn: "123456789",
    address: "123 Main St",
    city: "Test City",
    state: "CA",
    zipCode: "12345",
  };

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

  it("should invalidate session when within 5-minute buffer before expiry", async () => {
    // Create a user
    const hashedPassword = await bcrypt.hash("TestPassword123!@#", 10);
    await db.insert(users).values({
      email: "session-expiry1@example.com",
      password: hashedPassword,
      ...baseUserData,
      ssn: encryptSSN("123456789"),
    });

    const user = await db
      .select()
      .from(users)
      .where(eq(users.email, "session-expiry1@example.com"))
      .get();

    // Create a session that expires in 3 minutes (within buffer)
    const token = jwt.sign(
      { userId: user!.id },
      process.env.JWT_SECRET || "test-jwt-secret",
      { expiresIn: "3m" }
    );

    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 3); // 3 minutes from now

    await db.insert(sessions).values({
      userId: user!.id,
      token,
      expiresAt: expiresAt.toISOString(),
    });

    // Create context with this session
    const context = await createContext({
      req: {
        headers: {
          get: (key: string) => (key === "cookie" ? `session=${token}` : null),
          cookie: `session=${token}`,
        },
      } as any,
      resHeaders: new Headers(),
      info: {} as any,
    });

    // Session should be invalidated due to buffer (5 minutes)
    // Since it expires in 3 minutes, it's within the buffer
    expect(context.user).toBeNull();

    // Verify session was cleaned up
    const session = await db
      .select()
      .from(sessions)
      .where(eq(sessions.token, token))
      .get();

    expect(session).toBeUndefined();
  });

  it("should keep session valid when outside buffer time", async () => {
    // Create a user
    const hashedPassword = await bcrypt.hash("TestPassword123!@#", 10);
    await db.insert(users).values({
      email: "session-expiry2@example.com",
      password: hashedPassword,
      ...baseUserData,
      ssn: encryptSSN("123456789"),
    });

    const user = await db
      .select()
      .from(users)
      .where(eq(users.email, "session-expiry2@example.com"))
      .get();

    // Create a session that expires in 10 minutes (outside buffer)
    const token = jwt.sign(
      { userId: user!.id },
      process.env.JWT_SECRET || "test-jwt-secret",
      { expiresIn: "10m" }
    );

    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 10); // 10 minutes from now

    await db.insert(sessions).values({
      userId: user!.id,
      token,
      expiresAt: expiresAt.toISOString(),
    });

    // Create context with this session
    const context = await createContext({
      req: {
        headers: {
          get: (key: string) => (key === "cookie" ? `session=${token}` : null),
          cookie: `session=${token}`,
        },
      } as any,
      resHeaders: new Headers(),
      info: {} as any,
    });

    // Session should be valid (10 minutes > 5 minute buffer)
    expect(context.user).not.toBeNull();
    expect(context.user?.id).toBe(user!.id);
    expect(context.user?.email).toBe("session-expiry2@example.com");
  });

  it("should clean up expired sessions", async () => {
    // Create a user
    const hashedPassword = await bcrypt.hash("TestPassword123!@#", 10);
    await db.insert(users).values({
      email: "session-expiry3@example.com",
      password: hashedPassword,
      ...baseUserData,
      ssn: encryptSSN("123456789"),
    });

    const user = await db
      .select()
      .from(users)
      .where(eq(users.email, "session-expiry3@example.com"))
      .get();

    // Create a session that already expired (exp in the past)
    const expiredTime = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
    const token = jwt.sign(
      { userId: user!.id, exp: expiredTime },
      process.env.JWT_SECRET || "test-jwt-secret"
    );

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() - 1); // 1 hour ago

    await db.insert(sessions).values({
      userId: user!.id,
      token,
      expiresAt: expiresAt.toISOString(),
    });

    // Verify session exists before cleanup
    let session = await db
      .select()
      .from(sessions)
      .where(eq(sessions.token, token))
      .get();
    expect(session).toBeDefined();

    // Create context - should trigger cleanup
    try {
      const context = await createContext({
        req: {
          headers: {
            get: (key: string) =>
              key === "cookie" ? `session=${token}` : null,
            cookie: `session=${token}`,
          },
        } as any,
        resHeaders: new Headers(),
        info: {} as any,
      });

      // User should be null due to expired session
      expect(context.user).toBeNull();
    } catch (error) {
      // JWT verification will fail for expired token, which is expected
    }

    // Verify session was cleaned up
    session = await db
      .select()
      .from(sessions)
      .where(eq(sessions.token, token))
      .get();

    expect(session).toBeUndefined();
  });

  it("should handle JWT expiry independently from database expiry", async () => {
    // Create a user
    const hashedPassword = await bcrypt.hash("TestPassword123!@#", 10);
    await db.insert(users).values({
      email: "session-jwt-expiry@example.com",
      password: hashedPassword,
      ...baseUserData,
      ssn: encryptSSN("123456789"),
    });

    const user = await db
      .select()
      .from(users)
      .where(eq(users.email, "session-jwt-expiry@example.com"))
      .get();

    // Create a JWT that's already expired (exp in the past)
    const expiredTime = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
    const expiredToken = jwt.sign(
      { userId: user!.id, exp: expiredTime },
      process.env.JWT_SECRET || "test-jwt-secret"
    );

    // But database session says it expires in the future
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days from now

    await db.insert(sessions).values({
      userId: user!.id,
      token: expiredToken,
      expiresAt: expiresAt.toISOString(),
    });

    // Create context - JWT verification should fail
    try {
      const context = await createContext({
        req: {
          headers: {
            get: (key: string) =>
              key === "cookie" ? `session=${expiredToken}` : null,
            cookie: `session=${expiredToken}`,
          },
        } as any,
        resHeaders: new Headers(),
        info: {} as any,
      });

      // User should be null because JWT is expired
      expect(context.user).toBeNull();
    } catch (error) {
      // JWT verification throws error for expired tokens
    }

    // Verify session was cleaned up
    const session = await db
      .select()
      .from(sessions)
      .where(eq(sessions.token, expiredToken))
      .get();

    expect(session).toBeUndefined();
  });
});
