import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../trpc";
import { db } from "@/lib/db";
import { accounts, transactions } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { validateCardNumber } from "@/lib/utils/cardValidation";

function generateAccountNumber(): string {
  return Math.floor(Math.random() * 1000000000)
    .toString()
    .padStart(10, "0");
}

export const accountRouter = router({
  createAccount: protectedProcedure
    .input(
      z.object({
        accountType: z.enum(["checking", "savings"]),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Check if user already has an account of this type
      const existingAccount = await db
        .select()
        .from(accounts)
        .where(
          and(
            eq(accounts.userId, ctx.user.id),
            eq(accounts.accountType, input.accountType)
          )
        )
        .get();

      if (existingAccount) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `You already have a ${input.accountType} account`,
        });
      }

      let accountNumber;
      let isUnique = false;

      // Generate unique account number
      while (!isUnique) {
        accountNumber = generateAccountNumber();
        const existing = await db
          .select()
          .from(accounts)
          .where(eq(accounts.accountNumber, accountNumber))
          .get();
        isUnique = !existing;
      }

      await db.insert(accounts).values({
        userId: ctx.user.id,
        accountNumber: accountNumber!,
        accountType: input.accountType,
        balance: 0,
        status: "active",
      });

      // Fetch the created account
      const account = await db
        .select()
        .from(accounts)
        .where(eq(accounts.accountNumber, accountNumber!))
        .get();

      return (
        account || {
          id: 0,
          userId: ctx.user.id,
          accountNumber: accountNumber!,
          accountType: input.accountType,
          balance: 100,
          status: "pending",
          createdAt: new Date().toISOString(),
        }
      );
    }),

  getAccounts: protectedProcedure.query(async ({ ctx }) => {
    const userAccounts = await db
      .select()
      .from(accounts)
      .where(eq(accounts.userId, ctx.user.id));

    return userAccounts;
  }),

  fundAccount: protectedProcedure
    .input(
      z.object({
        accountId: z.number(),
        amount: z.number().positive(),
        fundingSource: z
          .object({
            type: z.enum(["card", "bank"]),
            accountNumber: z.string(),
            routingNumber: z.string().optional(),
          })
          .superRefine((source, ctx) => {
            if (source.type === "card") {
              const validation = validateCardNumber(source.accountNumber);
              if (validation !== true) {
                ctx.addIssue({
                  code: z.ZodIssueCode.custom,
                  message: validation,
                  path: ["accountNumber"],
                });
              }
            } else {
              if (!/^\d+$/.test(source.accountNumber)) {
                ctx.addIssue({
                  code: z.ZodIssueCode.custom,
                  message: "Invalid account number",
                  path: ["accountNumber"],
                });
              }

              if (!source.routingNumber) {
                ctx.addIssue({
                  code: z.ZodIssueCode.custom,
                  message: "Routing number is required",
                  path: ["routingNumber"],
                });
              } else if (!/^\d{9}$/.test(source.routingNumber)) {
                ctx.addIssue({
                  code: z.ZodIssueCode.custom,
                  message: "Routing number must be 9 digits",
                  path: ["routingNumber"],
                });
              }
            }
          }),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const amount = parseFloat(input.amount.toString());

      // Verify account belongs to user
      const account = await db
        .select()
        .from(accounts)
        .where(
          and(
            eq(accounts.id, input.accountId),
            eq(accounts.userId, ctx.user.id)
          )
        )
        .get();

      if (!account) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Account not found",
        });
      }

      if (account.status !== "active") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Account is not active",
        });
      }

      // Create transaction
      await db.insert(transactions).values({
        accountId: input.accountId,
        type: "deposit",
        amount,
        description: `Funding from ${input.fundingSource.type}`,
        status: "completed",
        processedAt: new Date().toISOString(),
      });

      const transaction = await db
        .select()
        .from(transactions)
        .where(eq(transactions.accountId, input.accountId))
        .orderBy(desc(transactions.id))
        .limit(1)
        .get();

      const currentBalanceInCents = Math.round(account.balance * 100);
      const amountInCents = Math.round(amount * 100);
      const newBalanceInCents = currentBalanceInCents + amountInCents;
      const newBalance = newBalanceInCents / 100;

      await db
        .update(accounts)
        .set({
          balance: newBalance,
        })
        .where(eq(accounts.id, input.accountId));

      return {
        transaction,
        newBalance,
      };
    }),

  getTransactions: protectedProcedure
    .input(
      z.object({
        accountId: z.number(),
      })
    )
    .query(async ({ input, ctx }) => {
      // Verify account belongs to user
      const account = await db
        .select()
        .from(accounts)
        .where(
          and(
            eq(accounts.id, input.accountId),
            eq(accounts.userId, ctx.user.id)
          )
        )
        .get();

      if (!account) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Account not found",
        });
      }

      const accountTransactions = await db
        .select()
        .from(transactions)
        .where(eq(transactions.accountId, input.accountId))
        .orderBy(transactions.createdAt);

      return accountTransactions.map((transaction) => ({
        ...transaction,
        accountType: account.accountType,
      }));
    }),
});
