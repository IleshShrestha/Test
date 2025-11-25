import { describe, it, expect, beforeEach } from "@jest/globals";
import { accountRouter } from "../account";
import { db } from "@/lib/db";
import { users, accounts, transactions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

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
  await db.delete(transactions).run();
  await db.delete(accounts).run();
});

describe("Account funding performance", () => {
  it("maintains precise balances after many deposits", async () => {
    const user = await createTestUser("balance-user@example.com");
    const account = await createAccountForUser(user);
    const caller = accountRouter.createCaller(createMockContext(user));

    const deposits = 200;
    const depositAmount = 0.23;

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
    const user = await createTestUser("history-user@example.com");
    const account = await createAccountForUser(user);
    const caller = accountRouter.createCaller(createMockContext(user));

    const transactionCount = 60;

    for (let i = 0; i < transactionCount; i++) {
      await caller.fundAccount({
        accountId: account.id,
        amount: 5 + i,
        fundingSource: {
          type: "card",
          accountNumber: "4111111111111111",
        },
      });
    }

    const transactionsResult = await caller.getTransactions({
      accountId: account.id,
    });

    expect(transactionsResult).toHaveLength(transactionCount);
    const amounts = transactionsResult.map((tx) => tx.amount);
    expect(amounts).toEqual(
      Array.from({ length: transactionCount }, (_, i) => 5 + i)
    );
  });
});
