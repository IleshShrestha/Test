import { initTRPC, TRPCError } from "@trpc/server";
import { CreateNextContextOptions } from "@trpc/server/adapters/next";
import { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import jwt from "jsonwebtoken";
import { db } from "@/lib/db";
import { sessions, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function createContext(
  opts: CreateNextContextOptions | FetchCreateContextFnOptions
) {
  // Handle different adapter types
  let req: any;
  let res: any;

  if ("req" in opts && "res" in opts) {
    // Next.js adapter
    req = opts.req;
    res = opts.res;
  } else {
    // Fetch adapter
    req = opts.req;
    res = opts.resHeaders;
  }

  // Get the session token
  let token: string | undefined;

  // For App Router, we need to read cookies from the request headers
  let cookieHeader = "";
  if (req.headers.cookie) {
    // Next.js Pages request
    cookieHeader = req.headers.cookie;
  } else if (req.headers.get) {
    // Fetch request (App Router)
    cookieHeader = req.headers.get("cookie") || "";
  }

  const cookiesObj = Object.fromEntries(
    cookieHeader
      .split("; ")
      .filter(Boolean)
      .map((c: string) => {
        const [key, ...val] = c.split("=");
        return [key, val.join("=")];
      })
  );
  token = cookiesObj.session;

  let user = null;
  if (token) {
    try {
      // First verify JWT hasn't expired
      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET || "temporary-secret-for-interview"
      ) as {
        userId: number;
        exp?: number; // JWT expiration timestamp
      };

      const session = await db
        .select()
        .from(sessions)
        .where(eq(sessions.token, token))
        .get();

      if (session) {
        const now = new Date();
        const expiresAt = new Date(session.expiresAt);

        // Adding a buffer time
        const BUFFER_TIME_MS = 5 * 60 * 1000; // 5 minutes
        const expiresWithBuffer = new Date(
          expiresAt.getTime() - BUFFER_TIME_MS
        );

        if (expiresWithBuffer <= now) {
          await db.delete(sessions).where(eq(sessions.token, token));
        } else {
          // Session is valid - fetch the user
          user = await db
            .select()
            .from(users)
            .where(eq(users.id, decoded.userId))
            .get();
        }
      }
    } catch (error) {
      // clean up session if invalid or expired JWT -
      if (token) {
        await db
          .delete(sessions)
          .where(eq(sessions.token, token))
          .catch(() => {});
      }
    }
  }

  return {
    user,
    req,
    res,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;
export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});
