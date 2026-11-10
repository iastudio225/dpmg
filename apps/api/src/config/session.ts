import { env } from "../config";
import { PrismaClient } from "@prisma/client";
import pgSimple from "connect-pg-simple";
import session from "express-session";
import type { RequestHandler } from "express";
import type { Pool } from "pg";

const prisma = new PrismaClient();
const PgSession = pgSimple(session);

const prismaPool = (prisma as unknown as { $pool: Pool }).$pool;

export function createSessionMiddleware(): RequestHandler {
  const isProduction = env.NODE_ENV === "production";

  return session({
    store: new PgSession({
      pool: prismaPool,
      tableName: "session",
      createTableIfMissing: false,
    }),
    secret: env.SESSION_SECRET || "dev-secret-change-in-production",
    name: "dpmg.sid",
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
      maxAge: env.SESSION_MAX_AGE,
      path: "/",
    },
  });
}

export function getSessionOptions() {
  const isProduction = env.NODE_ENV === "production";

  return {
    store: new PgSession({
      pool: prismaPool,
      tableName: "session",
      createTableIfMissing: false,
    }),
    secret: env.SESSION_SECRET || "dev-secret-change-in-production",
    name: "dpmg.sid",
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
      maxAge: env.SESSION_MAX_AGE,
      path: "/",
    },
  };
}