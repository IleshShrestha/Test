import Database from "better-sqlite3";
import path from "path";

const dbPath = path.join(__dirname, "..", "bank.db");
const db = new Database(dbPath);

interface FundingOperation {
  accountId: number;
  amount: number;
  fundingSourceType: "card" | "bank";
  createdAt: string;
  processedAt: string;
}

// Valid test card numbers (pass Luhn check)
const VALID_CARD_NUMBERS = [
  "4111111111111111", // Visa
  "5555555555554444", // Mastercard
  "378282246310005", // Amex
  "6011111111111117", // Discover
];

// Valid test bank account and routing numbers
const VALID_BANK_ACCOUNTS = [
  { accountNumber: "123456789", routingNumber: "121000248" },
  { accountNumber: "987654321", routingNumber: "026009593" },
  { accountNumber: "456789123", routingNumber: "021000021" },
];

function generateRandomAmount(min: number = 10, max: number = 5000): number {
  return Math.round((Math.random() * (max - min) + min) * 100) / 100;
}

function generateRandomDate(startDaysAgo: number, endDaysAgo: number): string {
  const now = new Date();
  const startDate = new Date(now);
  startDate.setDate(now.getDate() - startDaysAgo);
  const endDate = new Date(now);
  endDate.setDate(now.getDate() - endDaysAgo);

  const randomTime =
    startDate.getTime() +
    Math.random() * (endDate.getTime() - startDate.getTime());
  return new Date(randomTime).toISOString();
}

function generateFundingOperations(
  accountId: number,
  count: number,
  options: {
    startDaysAgo?: number;
    endDaysAgo?: number;
    fundingSourceType?: "card" | "bank" | "mixed";
    minAmount?: number;
    maxAmount?: number;
  } = {}
): FundingOperation[] {
  const {
    startDaysAgo = 90,
    endDaysAgo = 0,
    fundingSourceType = "mixed",
    minAmount = 10,
    maxAmount = 5000,
  } = options;

  const operations: FundingOperation[] = [];

  for (let i = 0; i < count; i++) {
    const type: "card" | "bank" =
      fundingSourceType === "mixed"
        ? Math.random() > 0.5
          ? "card"
          : "bank"
        : fundingSourceType;

    const amount = generateRandomAmount(minAmount, maxAmount);
    const createdAt = generateRandomDate(startDaysAgo, endDaysAgo);

    operations.push({
      accountId,
      amount,
      fundingSourceType: type,
      createdAt,
      processedAt: createdAt, // Funding operations are processed immediately
    });
  }

  // Sort by createdAt to ensure chronological order
  operations.sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  return operations;
}

function seedFunding() {
  const userEmail = process.argv[2];
  const count = parseInt(process.argv[3] || "50", 10);
  const startDaysAgo = parseInt(process.argv[4] || "90", 10);
  const endDaysAgo = parseInt(process.argv[5] || "0", 10);
  const fundingType = (process.argv[6] || "mixed") as "card" | "bank" | "mixed";
  const minAmount = parseFloat(process.argv[7] || "10");
  const maxAmount = parseFloat(process.argv[8] || "5000");

  if (!userEmail) {
    console.error(
      "Usage: npm run seed:funding <userEmail> [count] [startDaysAgo] [endDaysAgo] [type] [minAmount] [maxAmount]"
    );
    console.error("\nExamples:");
    console.error("  npm run seed:funding user@example.com");
    console.error("  npm run seed:funding user@example.com 100");
    console.error("  npm run seed:funding user@example.com 200 180 0");
    console.error("  npm run seed:funding user@example.com 50 90 0 card");
    console.error(
      "  npm run seed:funding user@example.com 50 90 0 mixed 25 1000"
    );
    console.error("\nParameters:");
    console.error("  userEmail    - Email of the user whose accounts to fund");
    console.error(
      "  count        - Number of funding operations (default: 50)"
    );
    console.error(
      "  startDaysAgo - Start date range in days ago (default: 90)"
    );
    console.error(
      "  endDaysAgo   - End date range in days ago (default: 0 = today)"
    );
    console.error(
      "  type         - Funding source type: 'card', 'bank', or 'mixed' (default: mixed)"
    );
    console.error("  minAmount    - Minimum funding amount (default: 10)");
    console.error("  maxAmount    - Maximum funding amount (default: 5000)");
    process.exit(1);
  }

  // Find user
  const user = db
    .prepare(
      "SELECT id, email, first_name, last_name FROM users WHERE email = ?"
    )
    .get(userEmail) as
    | { id: number; email: string; first_name: string; last_name: string }
    | undefined;

  if (!user) {
    console.error(`User with email ${userEmail} not found.`);
    console.error("\nAvailable users:");
    const users = db
      .prepare("SELECT id, email, first_name, last_name FROM users")
      .all() as Array<{
      id: number;
      email: string;
      first_name: string;
      last_name: string;
    }>;
    if (users.length === 0) {
      console.error("No users found in database.");
    } else {
      users.forEach((u) => {
        console.error(
          `  Email: ${u.email}, Name: ${u.first_name} ${u.last_name}`
        );
      });
    }
    db.close();
    process.exit(1);
  }

  // Find user's active accounts
  const accounts = db
    .prepare(
      "SELECT id, account_number, account_type, balance, status FROM accounts WHERE user_id = ? AND status = 'active'"
    )
    .all(user.id) as Array<{
    id: number;
    account_number: string;
    account_type: string;
    balance: number;
    status: string;
  }>;

  if (accounts.length === 0) {
    console.error(`No active accounts found for user ${userEmail}.`);
    const allAccounts = db
      .prepare(
        "SELECT id, account_number, account_type, status FROM accounts WHERE user_id = ?"
      )
      .all(user.id) as Array<{
      id: number;
      account_number: string;
      account_type: string;
      status: string;
    }>;
    if (allAccounts.length > 0) {
      console.error("\nUser's accounts (may be inactive):");
      allAccounts.forEach((acc) => {
        console.error(
          `  ID: ${acc.id}, Number: ${acc.account_number}, Type: ${acc.account_type}, Status: ${acc.status}`
        );
      });
    }
    db.close();
    process.exit(1);
  }

  console.log(`\n=== Seeding Funding Operations ===`);
  console.log(`User: ${user.first_name} ${user.last_name} (${user.email})`);
  console.log(`Active accounts: ${accounts.length}`);
  accounts.forEach((acc) => {
    console.log(
      `  - Account ID ${acc.id}: ${acc.account_number} (${
        acc.account_type
      }), Balance: $${acc.balance.toFixed(2)}`
    );
  });
  console.log(`\nFunding operations per account: ${count}`);
  console.log(`Date range: ${startDaysAgo} days ago to ${endDaysAgo} days ago`);
  console.log(`Funding type: ${fundingType}`);
  console.log(
    `Amount range: $${minAmount.toFixed(2)} - $${maxAmount.toFixed(2)}`
  );

  // Generate operations for each account
  const allOperations: Array<
    FundingOperation & { accountNumber: string; accountType: string }
  > = [];
  for (const account of accounts) {
    const operations = generateFundingOperations(account.id, count, {
      startDaysAgo,
      endDaysAgo,
      fundingSourceType: fundingType,
      minAmount,
      maxAmount,
    });
    operations.forEach((op) => {
      allOperations.push({
        ...op,
        accountNumber: account.account_number,
        accountType: account.account_type,
      });
    });
  }

  console.log(`\nTotal funding operations to create: ${allOperations.length}`);
  console.log(`Generating and inserting...`);

  // Prepare statements
  const insertTransactionStmt = db.prepare(`
    INSERT INTO transactions (
      account_id, type, amount, description, status, created_at, processed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const updateAccountStmt = db.prepare(`
    UPDATE accounts SET balance = ? WHERE id = ?
  `);

  const getAccountStmt = db.prepare(`
    SELECT balance FROM accounts WHERE id = ?
  `);

  // Process operations in a transaction
  const processFunding = db.transaction((operations: FundingOperation[]) => {
    const accountBalances = new Map<number, number>();

    // Initialize balances
    for (const op of operations) {
      if (!accountBalances.has(op.accountId)) {
        const account = getAccountStmt.get(op.accountId) as
          | { balance: number }
          | undefined;
        accountBalances.set(op.accountId, account?.balance || 0);
      }
    }

    // Process each funding operation
    for (const op of operations) {
      const currentBalance = accountBalances.get(op.accountId)!;

      // Calculate new balance using same logic as fundAccount (integer cents)
      const currentBalanceInCents = Math.round(currentBalance * 100);
      const amountInCents = Math.round(op.amount * 100);
      const newBalanceInCents = currentBalanceInCents + amountInCents;
      const newBalance = newBalanceInCents / 100;

      // Insert transaction
      const fundingSource =
        op.fundingSourceType === "card"
          ? VALID_CARD_NUMBERS[
              Math.floor(Math.random() * VALID_CARD_NUMBERS.length)
            ]
          : VALID_BANK_ACCOUNTS[
              Math.floor(Math.random() * VALID_BANK_ACCOUNTS.length)
            ];

      const description =
        op.fundingSourceType === "card"
          ? `Funding from card`
          : `Funding from bank`;

      insertTransactionStmt.run(
        op.accountId,
        "deposit",
        op.amount,
        description,
        "completed",
        op.createdAt,
        op.processedAt
      );

      // Update balance
      accountBalances.set(op.accountId, newBalance);
    }

    // Update all account balances
    for (const [accountId, balance] of accountBalances.entries()) {
      updateAccountStmt.run(balance, accountId);
    }
  });

  const startTime = Date.now();
  processFunding(allOperations);
  const duration = Date.now() - startTime;

  // Get updated account info
  console.log(
    `\n✅ Successfully created ${allOperations.length} funding operations in ${duration}ms`
  );
  console.log(`\n=== Updated Account Balances ===`);
  for (const account of accounts) {
    const updated = db
      .prepare("SELECT balance FROM accounts WHERE id = ?")
      .get(account.id) as { balance: number };

    const totalFunded = allOperations
      .filter((op) => op.accountId === account.id)
      .reduce((sum, op) => sum + op.amount, 0);

    console.log(
      `Account ${account.account_number} (${account.account_type}): ` +
        `$${account.balance.toFixed(2)} → $${updated.balance.toFixed(2)} ` +
        `(+$${totalFunded.toFixed(2)})`
    );
  }

  // Get transaction statistics
  const accountIds = accounts.map((a) => a.id).join(",");
  const stats = db
    .prepare(
      `
      SELECT 
        COUNT(*) as count,
        SUM(amount) as total,
        MIN(amount) as min_amount,
        MAX(amount) as max_amount,
        AVG(amount) as avg_amount
      FROM transactions 
      WHERE account_id IN (${accountIds})
        AND type = 'deposit'
        AND status = 'completed'
    `
    )
    .get() as {
    count: number;
    total: number;
    min_amount: number;
    max_amount: number;
    avg_amount: number;
  };

  console.log(`\n=== Transaction Statistics ===`);
  console.log(`Total deposits: ${stats.count}`);
  console.log(`Total amount: $${stats.total?.toFixed(2) || "0.00"}`);
  console.log(`Min amount: $${stats.min_amount?.toFixed(2) || "0.00"}`);
  console.log(`Max amount: $${stats.max_amount?.toFixed(2) || "0.00"}`);
  console.log(`Avg amount: $${stats.avg_amount?.toFixed(2) || "0.00"}`);

  db.close();
}

seedFunding();
