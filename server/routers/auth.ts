import { z } from "zod";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { TRPCError } from "@trpc/server";
import { publicProcedure, router } from "../trpc";
import { db } from "@/lib/db";
import { users, sessions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { encryptSSN } from "@/lib/encryption/encryption";

export const authRouter = router({
  signup: publicProcedure
    .input(
      z.object({
        email: z.string().email().toLowerCase(),
        password: z
          .string()
          .min(12, "Password must be at least 12 characters")
          .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
          .regex(/[a-z]/, "Password must contain at least one lowercase letter")
          .regex(/\d/, "Password must contain at least one number")
          .regex(
            /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/,
            "Password must contain at least one special character (!@#$%^&*...)"
          ),
        firstName: z.string().min(1),
        lastName: z.string().min(1),
        phoneNumber: z.string().regex(/^\+?\d{10,15}$/),
        dateOfBirth: z
          .string()
          .refine(
            (val) => {
              const date = new Date(val);
              return !isNaN(date.getTime());
            },
            { message: "Invalid date format" }
          )
          .refine(
            (val) => {
              const birthDate = new Date(val);
              const today = new Date();
              const age = today.getFullYear() - birthDate.getFullYear();
              const monthDiff = today.getMonth() - birthDate.getMonth();
              const dayDiff = today.getDate() - birthDate.getDate();

              const actualAge =
                monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)
                  ? age - 1
                  : age;

              return actualAge >= 18;
            },
            { message: "You must be at least 18 years old to sign up" }
          ),
        ssn: z.string().regex(/^\d{9}$/),
        address: z.string().min(1),
        city: z.string().min(1),
        state: z.string().length(2).toUpperCase(),
        zipCode: z.string().regex(/^\d{5}$/),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const existingUser = await db
        .select()
        .from(users)
        .where(eq(users.email, input.email))
        .get();

      if (existingUser) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "User already exists",
        });
      }

      const hashedPassword = await bcrypt.hash(input.password, 10);

      await db.insert(users).values({
        ...input,
        password: hashedPassword,
        ssn: encryptSSN(input.ssn),
      });

      // Fetch the created user
      const user = await db
        .select()
        .from(users)
        .where(eq(users.email, input.email))
        .get();

      if (!user) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create user",
        });
      }

      // Create session
      const token = jwt.sign(
        { userId: user.id },
        process.env.JWT_SECRET || "temporary-secret-for-interview",
        {
          expiresIn: "7d",
        }
      );

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      await db.insert(sessions).values({
        userId: user.id,
        token,
        expiresAt: expiresAt.toISOString(),
      });

      // Set cookie
      if ("setHeader" in ctx.res) {
        ctx.res.setHeader(
          "Set-Cookie",
          `session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800`
        );
      } else {
        (ctx.res as Headers).set(
          "Set-Cookie",
          `session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800`
        );
      }

      return { user: { ...user, password: undefined }, token };
    }),

  login: publicProcedure
    .input(
      z.object({
        email: z.string().email().toLowerCase(),
        password: z.string().min(12),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const user = await db
        .select()
        .from(users)
        .where(eq(users.email, input.email))
        .get();

      if (!user) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid credentials",
        });
      }

      const validPassword = await bcrypt.compare(input.password, user.password);

      if (!validPassword) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid credentials",
        });
      }

      const token = jwt.sign(
        { userId: user.id },
        process.env.JWT_SECRET || "temporary-secret-for-interview",
        {
          expiresIn: "7d",
        }
      );

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      await db.insert(sessions).values({
        userId: user.id,
        token,
        expiresAt: expiresAt.toISOString(),
      });

      if ("setHeader" in ctx.res) {
        ctx.res.setHeader(
          "Set-Cookie",
          `session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800`
        );
      } else {
        (ctx.res as Headers).set(
          "Set-Cookie",
          `session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800`
        );
      }

      return { user: { ...user, password: undefined }, token };
    }),

  logout: publicProcedure.mutation(async ({ ctx }) => {
    if (ctx.user) {
      // Delete session from database
      let token: string | undefined;
      if ("cookies" in ctx.req) {
        token = (ctx.req as any).cookies.session;
      } else {
        const cookieHeader =
          ctx.req.headers.get?.("cookie") || (ctx.req.headers as any).cookie;
        token = cookieHeader
          ?.split("; ")
          .find((c: string) => c.startsWith("session="))
          ?.split("=")[1];
      }
      if (token) {
        await db.delete(sessions).where(eq(sessions.token, token));
      }
    }

    if ("setHeader" in ctx.res) {
      ctx.res.setHeader(
        "Set-Cookie",
        `session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`
      );
    } else {
      (ctx.res as Headers).set(
        "Set-Cookie",
        `session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`
      );
    }

    return {
      success: true,
      message: ctx.user ? "Logged out successfully" : "No active session",
    };
  }),
});
