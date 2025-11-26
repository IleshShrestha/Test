import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  jest,
} from "@jest/globals";
import { accountRouter } from "../account";
import { db } from "@/lib/db";
import { users, accounts, transactions, sessions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const baseUser = {
  firstName: "Limit",
  lastName: "Tester",
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

const testEmails: string[] = [];

const cleanupUser = async (email: string) => {
  const user = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .get();

  if (user) {
    const userAccounts = await db
      .select()
      .from(accounts)
      .where(eq(accounts.userId, user.id))
      .all();

    for (const account of userAccounts) {
      await db
        .delete(transactions)
        .where(eq(transactions.accountId, account.id))
        .run();
    }

    await Promise.all([
      db.delete(sessions).where(eq(sessions.userId, user.id)).run(),
      db.delete(accounts).where(eq(accounts.userId, user.id)).run(),
      db.delete(users).where(eq(users.id, user.id)).run(),
    ]);
  }
};

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

  testEmails.push(email);

  return user;
};

const createAccountForUser = async (user: any) => {
  const caller = accountRouter.createCaller(createMockContext(user));
  const account = await caller.createAccount({ accountType: "checking" });

  if (!account || !account.id) {
    const existing = await db
      .select()
      .from(accounts)
      .where(eq(accounts.userId, user.id))
      .get();

    if (!existing) {
      throw new Error("Failed to create account");
    }

    return existing;
  }

  return account;
};

beforeEach(async () => {
  await Promise.all(testEmails.map(cleanupUser));
  testEmails.length = 0;
});

afterEach(async () => {
  await Promise.all(testEmails.map(cleanupUser));
  testEmails.length = 0;
});

describe("Account funding limits", () => {
  it("allows funding with the minimum allowed amount", async () => {
    const user = await createTestUser("min-limit");
    const account = await createAccountForUser(user);
    const caller = accountRouter.createCaller(createMockContext(user));

    const result = await caller.fundAccount({
      accountId: account.id,
      amount: 10,
      fundingSource: {
        type: "card",
        accountNumber: "4111111111111111",
      },
    });

    expect(result.newBalance).toBe(10);
  });

  it("allows funding with the maximum allowed amount", async () => {
    const user = await createTestUser("max-limit");
    const account = await createAccountForUser(user);
    const caller = accountRouter.createCaller(createMockContext(user));

    const result = await caller.fundAccount({
      accountId: account.id,
      amount: 10000,
      fundingSource: {
        type: "card",
        accountNumber: "4111111111111111",
      },
    });

    expect(result.newBalance).toBe(10000);
  });

  it("rejects funding below the minimum amount", async () => {
    const user = await createTestUser("below-min");
    const account = await createAccountForUser(user);
    const caller = accountRouter.createCaller(createMockContext(user));

    await expect(
      caller.fundAccount({
        accountId: account.id,
        amount: 5,
        fundingSource: {
          type: "card",
          accountNumber: "4111111111111111",
        },
      })
    ).rejects.toThrow(/Amount must be at least \$10\.00/);
  });

  it("rejects funding above the maximum amount", async () => {
    const user = await createTestUser("above-max");
    const account = await createAccountForUser(user);
    const caller = accountRouter.createCaller(createMockContext(user));

    await expect(
      caller.fundAccount({
        accountId: account.id,
        amount: 15000,
        fundingSource: {
          type: "card",
          accountNumber: "4111111111111111",
        },
      })
    ).rejects.toThrow(/Amount cannot exceed \$10,000/);
  });
});
