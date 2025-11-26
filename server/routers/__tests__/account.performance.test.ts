import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { accountRouter } from "../account";
import { db } from "@/lib/db";
import { users, accounts, transactions, sessions } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";

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

// Track test emails for cleanup
const testEmails: string[] = [];

const cleanupUser = async (email: string) => {
  const user = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .get();
  if (user) {
    // Delete in order to respect foreign key constraints
    // First, get all accounts for this user
    const userAccounts = await db
      .select()
      .from(accounts)
      .where(eq(accounts.userId, user.id))
      .all();

    // Delete transactions for all accounts
    for (const account of userAccounts) {
      await db
        .delete(transactions)
        .where(eq(transactions.accountId, account.id))
        .run();
    }

    // Delete sessions, accounts, and user in order to respect foreign key constraints
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

  // Track the email for cleanup
  testEmails.push(email);

  return user;
};

const createAccountForUser = async (
  user: any,
  accountType: "checking" | "savings" = "checking"
) => {
  const caller = accountRouter.createCaller(createMockContext(user));
  const account = await caller.createAccount({ accountType });

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
  // Clean up data from previous test run
  await Promise.all(testEmails.map(cleanupUser));
  testEmails.length = 0; // Clear the array
});

afterEach(async () => {
  // Clean up any remaining test data after each test
  await Promise.all(testEmails.map(cleanupUser));
  testEmails.length = 0; // Clear the array
});

describe("Account funding performance", () => {
  it("maintains precise balances after many deposits", async () => {
    const user = await createTestUser("balance-user");
    const account = await createAccountForUser(user);
    const caller = accountRouter.createCaller(createMockContext(user));

    const deposits = 200;
    const depositAmount = 10.23;

    for (let i = 0; i < deposits; i++) {
      await caller.fundAccount({
        accountId: account.id,
        amount: depositAmount,
        fundingSource: {
          type: "card",
          accountNumber: "4111111111111111",
        },
      });
    }

    const updatedAccount = await db
      .select()
      .from(accounts)
      .where(eq(accounts.id, account.id))
      .get();

    expect(updatedAccount?.balance).toBeCloseTo(deposits * depositAmount, 2);
  });

  it("returns the complete transaction history", async () => {
    const user = await createTestUser("history-user");
    const account = await createAccountForUser(user);
    const caller = accountRouter.createCaller(createMockContext(user));

    const transactionCount = 60;

    for (let i = 0; i < transactionCount; i++) {
      await caller.fundAccount({
        accountId: account.id,
        amount: 10 + i,
        fundingSource: {
          type: "card",
          accountNumber: "4111111111111111",
        },
      });
    }

    const transactionsResult = await caller.getTransactions({
      accountId: account.id,
      limit: 100, // Get all transactions in one call
    });

    expect(transactionsResult.transactions).toHaveLength(transactionCount);
    const amounts = transactionsResult.transactions.map((tx) => tx.amount);
    // Transactions are returned newest first (descending by amount), sort ascending for comparison
    const sortedAmounts = [...amounts].sort((a, b) => a - b);
    expect(sortedAmounts).toEqual(
      Array.from({ length: transactionCount }, (_, i) => 10 + i)
    );
  });

  it("handles concurrent funding without race conditions", async () => {
    const user = await createTestUser("concurrent-user");
    const account = await createAccountForUser(user);
    const caller = accountRouter.createCaller(createMockContext(user));

    const concurrentDeposits = 50;
    const amountPerDeposit = 37.42;

    await Promise.all(
      Array.from({ length: concurrentDeposits }, () =>
        caller.fundAccount({
          accountId: account.id,
          amount: amountPerDeposit,
          fundingSource: {
            type: "card",
            accountNumber: "4111111111111111",
          },
        })
      )
    );

    const updatedAccount = await db
      .select()
      .from(accounts)
      .where(eq(accounts.id, account.id))
      .get();

    expect(updatedAccount?.balance).toBeCloseTo(
      concurrentDeposits * amountPerDeposit,
      2
    );

    const transactionCountResult = await db
      .select({ count: sql<number>`cast(count(*) as integer)` })
      .from(transactions)
      .where(eq(transactions.accountId, account.id));

    expect(transactionCountResult[0]?.count).toBe(concurrentDeposits);
  });
});
