import {
  describe,
  it,
  expect,
  beforeEach,
  jest,
  afterEach,
} from "@jest/globals";
import { accountRouter } from "../account";
import { db } from "@/lib/db";
import { users, accounts, transactions, sessions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

const baseUser = {
  firstName: "Test",
  lastName: "User",
  phoneNumber: "1234567890",
  dateOfBirth: "1990-01-01",
  ssn: "123456789",
  address: "123 Main St",
  city: "Test City",
  state: "CA",
  zipCode: "12345",
  password: "hashed-password",
};

const createMockContext = (user: any) => ({
  user,
  req: { headers: { cookie: "" } } as any,
  res: { setHeader: jest.fn(), set: jest.fn() } as any,
});

const createTestUser = async (identifier: string) => {
  const email = `${identifier}-${Date.now()}@example.com`;
  await db.insert(users).values({
    email,
    ...baseUser,
  });

  const user = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .get();

  if (!user) {
    throw new Error("Failed to create test user");
  }

  return user;
};

beforeEach(async () => {
  // Delete in order to respect foreign key constraints
  await db.delete(transactions).run();
  await db.delete(sessions).run();
  await db.delete(accounts).run();
  await db.delete(users).run();
});

// Note: Cleanup is done within each test to avoid conflicts when tests run in parallel

describe("Account Creation - PERF-401 Fix", () => {
  it("should throw error instead of returning fake $100 balance when account fetch fails", async () => {
    const user = await createTestUser("test-user");
    const caller = accountRouter.createCaller(createMockContext(user));

    // Mock the database select to return null (simulating fetch failure)
    const originalSelect = db.select;
    let selectCallCount = 0;

    jest.spyOn(db, "select").mockImplementation((...args: any[]) => {
      selectCallCount++;
      // After insert, make the fetch return null (simulating failure)
      if (selectCallCount > 1) {
        // This is the fetch after insert - return null to simulate failure
        const mockGet = jest.fn() as any;
        mockGet.mockResolvedValue = jest
          .fn()
          .mockResolvedValue(undefined as unknown as never);
        return {
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              get: mockGet,
            }),
          }),
        } as any;
      }
      // First select is for checking existing accounts - let it work normally
      return originalSelect.apply(db, args as any);
    });

    // Attempt to create account - should throw error instead of returning fake data
    await expect(
      caller.createAccount({ accountType: "checking" })
    ).rejects.toThrow(TRPCError);

    await expect(
      caller.createAccount({ accountType: "checking" })
    ).rejects.toThrow("Account was created but could not be retrieved");

    // Restore original implementation
    jest.restoreAllMocks();
  });

  it("should return account with $0 balance when creation succeeds", async () => {
    const user = await createTestUser("test-user-success");
    const caller = accountRouter.createCaller(createMockContext(user));

    const account = await caller.createAccount({ accountType: "checking" });

    expect(account).toBeDefined();
    expect(account.id).toBeGreaterThan(0);
    expect(account.balance).toBe(0); // ✅ Should be $0, not $100
    expect(account.status).toBe("active"); // ✅ Should be "active", not "pending"
    expect(account.accountType).toBe("checking");

    // Clean up this test's data
    await db.delete(accounts).where(eq(accounts.id, account.id)).run();
    await db.delete(users).where(eq(users.id, user.id)).run();
  });

  it("should not return fake account data with id: 0", async () => {
    const user = await createTestUser("test-user-no-fake");
    const caller = accountRouter.createCaller(createMockContext(user));

    const account = await caller.createAccount({ accountType: "savings" });

    // ✅ Should never return fake data with id: 0
    expect(account.id).not.toBe(0);
    expect(account.id).toBeGreaterThan(0);
    expect(account.balance).toBe(0);

    // Clean up this test's data
    await db.delete(accounts).where(eq(accounts.id, account.id)).run();
    await db.delete(users).where(eq(users.id, user.id)).run();
  });
});
