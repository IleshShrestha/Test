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
import jwt from "jsonwebtoken";

/**
 * Tests for SEC-304: Session Management
 * Verifies that login invalidates all existing sessions for a user
 */
describe("SEC-304: Session Invalidation on Login", () => {
  const originalEnv = {
    ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
    ENCRYPTION_SALT: process.env.ENCRYPTION_SALT,
    JWT_SECRET: process.env.JWT_SECRET,
  };

  const testEmails = [
    "session-invalidation1@example.com",
    "session-invalidation2@example.com",
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

  it("should invalidate all existing sessions when user logs in", async () => {
    const caller = authRouter.createCaller({
      user: null,
      req: { headers: { cookie: "" } } as any,
      res: { setHeader: jest.fn(), set: jest.fn() } as any,
    });

    // Create user and first login
    await caller.signup(
      createSignupData(
        "session-invalidation1@example.com",
        "TestPassword123!@#"
      )
    );

    const user = await db
      .select()
      .from(users)
      .where(eq(users.email, "session-invalidation1@example.com"))
      .get();

    // Get the first session
    const firstSession = await db
      .select()
      .from(sessions)
      .where(eq(sessions.userId, user!.id))
      .get();

    expect(firstSession).toBeDefined();

    // Manually create additional sessions to simulate multiple concurrent sessions
    // Use unique payloads to ensure unique tokens
    const timestamp = Date.now();
    const token2 = jwt.sign(
      { userId: user!.id, iat: timestamp },
      process.env.JWT_SECRET || "test-jwt-secret",
      { expiresIn: "7d" }
    );
    const token3 = jwt.sign(
      { userId: user!.id, iat: timestamp + 1 },
      process.env.JWT_SECRET || "test-jwt-secret",
      { expiresIn: "7d" }
    );

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    // Store the first session token
    const firstToken = firstSession!.token;

    // Create additional sessions (we already have 1 from signup, so we'll have 3 total)
    await db.insert(sessions).values({
      userId: user!.id,
      token: token2,
      expiresAt: expiresAt.toISOString(),
    });

    await db.insert(sessions).values({
      userId: user!.id,
      token: token3,
      expiresAt: expiresAt.toISOString(),
    });

    // Verify we have 3 sessions (1 from signup + 2 we just created)
    const allSessionsBefore = await db
      .select()
      .from(sessions)
      .where(eq(sessions.userId, user!.id))
      .all();

    expect(allSessionsBefore.length).toBe(3);

    // Login again - this should invalidate all existing sessions
    const loginResult = await caller.login({
      email: "session-invalidation1@example.com",
      password: "TestPassword123!@#",
    });

    expect(loginResult.user).toBeDefined();
    expect(loginResult.token).toBeDefined();

    // Verify all old sessions are deleted
    const allSessionsAfter = await db
      .select()
      .from(sessions)
      .where(eq(sessions.userId, user!.id))
      .all();

    // Should only have 1 session (the new one from login)
    // This proves that all 3 old sessions were deleted
    expect(allSessionsAfter.length).toBe(1);
    expect(allSessionsAfter[0].token).toBe(loginResult.token);

    // Verify old sessions are invalid
    // Check token2 and token3 (they should definitely be different from the new token)
    const oldSession2 = await db
      .select()
      .from(sessions)
      .where(eq(sessions.token, token2))
      .get();

    const oldSession3 = await db
      .select()
      .from(sessions)
      .where(eq(sessions.token, token3))
      .get();

    expect(oldSession2).toBeUndefined();
    expect(oldSession3).toBeUndefined();

    // Verify firstToken is either deleted or is the same as the new token
    // (if it's the same, that's fine - the important thing is we only have 1 session)
    const oldSession1 = await db
      .select()
      .from(sessions)
      .where(eq(sessions.token, firstToken))
      .get();

    // If firstToken still exists, it must be the same as the new login token
    // (which means we still only have 1 session, which is what we want)
    if (oldSession1) {
      expect(oldSession1.token).toBe(loginResult.token);
    } else {
      // If it doesn't exist, that's also fine - it was deleted
      expect(oldSession1).toBeUndefined();
    }
  });

  it("should create only one session after multiple logins", async () => {
    const caller = authRouter.createCaller({
      user: null,
      req: { headers: { cookie: "" } } as any,
      res: { setHeader: jest.fn(), set: jest.fn() } as any,
    });

    // Create user
    await caller.signup(
      createSignupData(
        "session-invalidation2@example.com",
        "TestPassword123!@#"
      )
    );

    const user = await db
      .select()
      .from(users)
      .where(eq(users.email, "session-invalidation2@example.com"))
      .get();

    // Login multiple times
    await caller.login({
      email: "session-invalidation2@example.com",
      password: "TestPassword123!@#",
    });

    await caller.login({
      email: "session-invalidation2@example.com",
      password: "TestPassword123!@#",
    });

    const finalLogin = await caller.login({
      email: "session-invalidation2@example.com",
      password: "TestPassword123!@#",
    });

    // Verify only one session exists (the last one)
    const allSessions = await db
      .select()
      .from(sessions)
      .where(eq(sessions.userId, user!.id))
      .all();

    expect(allSessions.length).toBe(1);
    expect(allSessions[0].token).toBe(finalLogin.token);
  });
});
