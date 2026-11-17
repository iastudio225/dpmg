import { env } from "../config";
import { PrismaClient } from "@prisma/client";
import pgSimple from "connect-pg-simple";
import session from "express-session";
import type { RequestHandler } from "express";
import type { Pool } from "pg";

const prisma = new PrismaClient();
const PgSession = pgSimple(session);

const prismaPool = (prisma as unknown as { $pool: Pool }).$pool;

/**
 * En production, le cookie est `secure` par défaut. `COOKIE_SECURE=false`
 * permet de fonctionner derrière un accès HTTP (ex. environnement interne
 * sans TLS), au prix de la protection `Secure`.
 */
export function cookieSecurity(): { secure: boolean; sameSite: "lax" | "none" } {
  const isProduction = env.NODE_ENV === "production";
  const allowInsecure = process.env["COOKIE_SECURE"] === "false";
  const secure = isProduction && !allowInsecure;
  return { secure, sameSite: secure ? "none" : "lax" };
}

function buildOptions() {
  const { secure, sameSite } = cookieSecurity();
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
      secure,
      sameSite,
      maxAge: env.SESSION_MAX_AGE,
      path: "/",
    },
  };
}

export function createSessionMiddleware(): RequestHandler {
  return session(buildOptions());
}

export function getSessionOptions() {
  return buildOptions();
}
