import rateLimit from "express-rate-limit";
import { env } from "../config";

export const loginRateLimiter = rateLimit({
  windowMs: env.LOGIN_RATE_LIMIT_WINDOW_MS,
  max: env.LOGIN_RATE_LIMIT_MAX,
  message: {
    code: "RATE_LIMIT_EXCEEDED",
    message: "Trop de tentatives de connexion. Veuillez réessayer plus tard.",
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Ne compter que les échecs, et individualiser par IP + email pour éviter
  // qu'un utilisateur bloque tous les autres derrière une même IP (bureau/NAT).
  skipSuccessfulRequests: true,
  keyGenerator: (req) => {
    const body = (req as unknown as { body?: { email?: unknown } }).body;
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    return `${req.ip || "unknown"}:${email}`;
  },
  handler: (_req, res) => {
    res.status(429).json({
      code: "RATE_LIMIT_EXCEEDED",
      message: "Trop de tentatives de connexion. Veuillez réessayer plus tard.",
    });
  },
});

export const apiRateLimiter = rateLimit({
  windowMs: 60000,
  max: 100,
  message: {
    code: "RATE_LIMIT_EXCEEDED",
    message: "Trop de requêtes. Veuillez réessayer plus tard.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});