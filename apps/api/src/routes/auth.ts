import { Router, Request, Response } from "express";
import { loginRateLimiter } from "../middleware/rateLimiter";
import { requireAuth } from "../middleware/auth";
import { asyncHandler, logServerError } from "../middleware/errorHandler";
import { loginRequestSchema, authMeResponseSchema, changePasswordSchema } from "@dpmg/shared/zod";
import { ApiError } from "@dpmg/shared";
import { ZodError } from "zod";
import { findUserByEmail, verifyPassword, createSessionRecord, deleteSessionRecord } from "../services/auth.service";
import { changePassword } from "../services/user.service";
import { randomBytes } from "crypto";
import { env } from "../config";

const router: Router = Router();

router.post("/login", loginRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  try {
    const parsed = loginRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        code: "VALIDATION_ERROR",
        message: "Données de connexion invalides",
        details: parsed.error.flatten().fieldErrors,
      } satisfies import("@dpmg/shared").ApiError);
    }

    const { email, password } = parsed.data;

    const user = await findUserByEmail(email);

    if (!user) {
      return res.status(401).json({
        code: "INVALID_CREDENTIALS",
        message: "Identifiants invalides",
      } satisfies import("@dpmg/shared").ApiError);
    }

    if (user.status !== "ACTIVE") {
      return res.status(403).json({
        code: "ACCOUNT_DISABLED",
        message: "Compte désactivé ou suspendu",
      } satisfies import("@dpmg/shared").ApiError);
    }

    const isValid = await verifyPassword(password, user.passwordHash);

    if (!isValid) {
      return res.status(401).json({
        code: "INVALID_CREDENTIALS",
        message: "Identifiants invalides",
      } satisfies import("@dpmg/shared").ApiError);
    }

    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await createSessionRecord(user.id, token, expiresAt);

    const response = {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        status: user.status,
        mustChangePassword: user.mustChangePassword,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
      },
      roles: user.structureRoles.map((r) => ({
        id: r.id,
        role: r.role,
        structureId: r.structureId,
        structureName: r.structureName,
        structureCode: r.structureCode,
        structureType: r.structureType,
        scope: r.scope,
        startDate: r.startDate.toISOString(),
        endDate: r.endDate?.toISOString() ?? null,
        delegationNote: r.delegationNote,
      })),
    };

    const validatedResponse = authMeResponseSchema.parse(response);

    res.cookie("dpmg.sid", token, {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: 24 * 60 * 60 * 1000,
      path: "/",
    });

    return res.json(validatedResponse);
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({
        code: "VALIDATION_ERROR",
        message: "Données invalides",
        details: error.flatten().fieldErrors,
      } satisfies import("@dpmg/shared").ApiError);
    }
    logServerError("Login error", error);
    return res.status(500).json({
      code: "INTERNAL_ERROR",
      message: "Erreur interne du serveur",
    } satisfies import("@dpmg/shared").ApiError);
  }
}));

router.post("/change-password", requireAuth, asyncHandler(async (req: Request, res: Response) => {
  try {
    const parsed = changePasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        code: "VALIDATION_ERROR",
        message: "Données invalides",
        details: parsed.error.flatten().fieldErrors,
      } satisfies ApiError);
    }

    const { currentPassword, newPassword } = parsed.data;
    const result = await changePassword(req.user!.id, currentPassword, newPassword);

    return res.json({
      message: "Mot de passe modifié avec succès",
      mustChangePassword: result.mustChangePassword,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({
        code: "VALIDATION_ERROR",
        message: "Données invalides",
        details: error.flatten().fieldErrors,
      } satisfies ApiError);
    }
    logServerError("Change password error", error);
    return res.status(500).json({
      code: "INTERNAL_ERROR",
      message: "Erreur interne du serveur",
    } satisfies ApiError);
  }
}));

router.post("/logout", requireAuth, asyncHandler(async (req: Request, res: Response) => {
  try {
    const token = req.sessionToken || req.cookies?.["dpmg.sid"];

    if (token) {
      await deleteSessionRecord(token);
    }

    res.clearCookie("dpmg.sid", {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: env.NODE_ENV === "production" ? "none" : "lax",
      path: "/",
    });

    return res.json({ message: "Déconnexion réussie" });
  } catch (error) {
    logServerError("Logout error", error);
    return res.status(500).json({
      code: "INTERNAL_ERROR",
      message: "Erreur interne du serveur",
    } satisfies import("@dpmg/shared").ApiError);
  }
}));

router.get("/me", requireAuth, asyncHandler(async (req: Request, res: Response) => {
  try {
    const response = {
      user: req.user!,
      roles: req.userRoles!,
    };

    const validatedResponse = authMeResponseSchema.parse(response);
    return res.json(validatedResponse);
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({
        code: "VALIDATION_ERROR",
        message: "Erreur de validation de la réponse",
        details: error.flatten().fieldErrors,
      } satisfies import("@dpmg/shared").ApiError);
    }
    logServerError("/me error", error);
    return res.status(500).json({
      code: "INTERNAL_ERROR",
      message: "Erreur interne du serveur",
    } satisfies import("@dpmg/shared").ApiError);
  }
}));

export default router;