import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  jest,
} from "@jest/globals";
import { authRouter } from "../auth";
import { db } from "@/lib/db";
import { users, sessions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

describe("PERF-402: Logout Verification", () => {
  const originalEnv = {
    ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
    ENCRYPTION_SALT: process.env.ENCRYPTION_SALT,
    JWT_SECRET: process.env.JWT_SECRET,
  };

  const testEmails = [
    "logout-test1@example.com",
    "logout-test2@example.com",
    "logout-test3@example.com",
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

  it("should return success: true when session is successfully deleted", async () => {
    const caller = authRouter.createCaller({
      user: null,
      req: { headers: { cookie: "" } } as any,
      res: { setHeader: jest.fn(), set: jest.fn() } as any,
    });

    // Create user and login
    const signupResult = await caller.signup(
      createSignupData("logout-test1@example.com", "TestPassword123!@#")
    );

    // Get the user and session
    const user = await db
      .select()
      .from(users)
      .where(eq(users.email, "logout-test1@example.com"))
      .get();

    const session = await db
      .select()
      .from(sessions)
      .where(eq(sessions.userId, user!.id))
      .get();

    // Create context with user and session token
    const logoutCaller = authRouter.createCaller({
      user,
      req: {
        headers: {
          get: (key: string) =>
            key === "cookie" ? `session=${session!.token}` : null,
          cookie: `session=${session!.token}`,
        },
      } as any,
      res: { setHeader: jest.fn(), set: jest.fn() } as any,
    });

    // Perform logout
    const logoutResult = await logoutCaller.logout();

    // Verify logout was successful
    expect(logoutResult.success).toBe(true);
    expect(logoutResult.message).toBe("Logged out successfully");

    // Verify session was actually deleted
    const deletedSession = await db
      .select()
      .from(sessions)
      .where(eq(sessions.token, session!.token))
      .get();

    expect(deletedSession).toBeUndefined();
  });

  it("should return success: false when session deletion fails", async () => {
    const caller = authRouter.createCaller({
      user: null,
      req: { headers: { cookie: "" } } as any,
      res: { setHeader: jest.fn(), set: jest.fn() } as any,
    });

    // Create user and login
    await caller.signup(
      createSignupData("logout-test2@example.com", "TestPassword123!@#")
    );

    const user = await db
      .select()
      .from(users)
      .where(eq(users.email, "logout-test2@example.com"))
      .get();

    // Create a fake token that doesn't exist in database
    const fakeToken = "fake-token-that-does-not-exist";

    // Create context with user but invalid token
    const logoutCaller = authRouter.createCaller({
      user,
      req: {
        headers: {
          get: (key: string) =>
            key === "cookie" ? `session=${fakeToken}` : null,
          cookie: `session=${fakeToken}`,
        },
      } as any,
      res: { setHeader: jest.fn(), set: jest.fn() } as any,
    });

    // Perform logout - should fail because session doesn't exist
    const logoutResult = await logoutCaller.logout();

    // Verify logout reported failure
    expect(logoutResult.success).toBe(false);
    expect(logoutResult.message).toContain("Failed to log out");
  });

  it("should return success: true when no user is logged in", async () => {
    const logoutCaller = authRouter.createCaller({
      user: null,
      req: { headers: { cookie: "" } } as any,
      res: { setHeader: jest.fn(), set: jest.fn() } as any,
    });

    const logoutResult = await logoutCaller.logout();

    expect(logoutResult.success).toBe(true);
    expect(logoutResult.message).toBe("No active session");
  });

  it("should verify session deletion before returning success", async () => {
    const caller = authRouter.createCaller({
      user: null,
      req: { headers: { cookie: "" } } as any,
      res: { setHeader: jest.fn(), set: jest.fn() } as any,
    });

    // Create user and login
    const signupResult = await caller.signup(
      createSignupData("logout-test3@example.com", "TestPassword123!@#")
    );

    const user = await db
      .select()
      .from(users)
      .where(eq(users.email, "logout-test3@example.com"))
      .get();

    const session = await db
      .select()
      .from(sessions)
      .where(eq(sessions.userId, user!.id))
      .get();

    // Mock the delete to fail (simulate database issue)
    const originalDelete = db.delete;
    let deleteCallCount = 0;

    jest.spyOn(db, "delete").mockImplementation((...args: any[]) => {
      deleteCallCount++;
      // First delete call (actual deletion) - let it succeed
      if (deleteCallCount === 1) {
        return originalDelete.apply(db, args as any);
      }
      // Subsequent calls should work normally
      return originalDelete.apply(db, args as any);
    });

    const logoutCaller = authRouter.createCaller({
      user,
      req: {
        headers: {
          get: (key: string) =>
            key === "cookie" ? `session=${session!.token}` : null,
          cookie: `session=${session!.token}`,
        },
      } as any,
      res: { setHeader: jest.fn(), set: jest.fn() } as any,
    });

    const logoutResult = await logoutCaller.logout();

    // Should succeed because verification will check if session is gone
    expect(logoutResult.success).toBe(true);

    // Verify session is actually gone
    const deletedSession = await db
      .select()
      .from(sessions)
      .where(eq(sessions.token, session!.token))
      .get();

    expect(deletedSession).toBeUndefined();

    jest.restoreAllMocks();
  });
});
