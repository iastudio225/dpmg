import { Request, Response, NextFunction, RequestHandler } from "express";
import { AppError, asyncHandler } from "./errorHandler";
import { findSessionByToken, getUserActiveRoles } from "../services/auth.service";
import { UserResponse, UserRoleResponse, RoleType } from "@dpmg/shared";

declare module "express" {
  interface Request {
    user?: UserResponse;
    userRoles?: UserRoleResponse[];
    sessionToken?: string;
  }
}

export const requireAuth: RequestHandler = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  const token = req.cookies?.["dpmg.sid"] || req.headers.authorization?.replace("Bearer ", "");

  if (!token) {
    throw new AppError("UNAUTHORIZED", "Authentification requise", 401);
  }

  const session = await findSessionByToken(token);

  if (!session || session.expiresAt < new Date()) {
    throw new AppError("SESSION_EXPIRED", "Session expirée ou invalide", 401);
  }

  const user = session.user;

  if (user.status !== "ACTIVE") {
    throw new AppError("ACCOUNT_DISABLED", "Compte désactivé ou suspendu", 403);
  }

  const mustChangePassword = user.mustChangePassword === true;
  if (mustChangePassword) {
    const pathname = `${req.baseUrl ?? ""}${req.path}`;
    const allowedPaths = ["/api/auth/change-password", "/api/auth/logout", "/api/auth/me"];
    if (!allowedPaths.includes(pathname)) {
      throw new AppError(
        "MUST_CHANGE_PASSWORD",
        "Vous devez changer votre mot de passe avant d'accéder à l'application",
        403
      );
    }
  }

  const activeRoles = await getUserActiveRoles(user.id);

  req.user = {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    status: user.status,
    mustChangePassword,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };

  req.userRoles = activeRoles.map((r) => ({
    id: r.id,
    role: r.role,
    structureId: r.structure?.id ?? null,
    structureName: r.structure?.name ?? null,
    structureCode: r.structure?.code ?? null,
    structureType: r.structure?.type ?? null,
    scope: r.scope,
    startDate: r.startDate.toISOString(),
    endDate: r.endDate?.toISOString() ?? null,
    delegationNote: r.delegationNote,
  }));

  req.sessionToken = token;

  next();
});

export function requireRole(...allowedRoles: RoleType[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user || !req.userRoles) {
      throw new AppError("UNAUTHORIZED", "Authentification requise", 401);
    }

    const hasRole = req.userRoles.some((r) => allowedRoles.includes(r.role));

    if (!hasRole) {
      throw new AppError("FORBIDDEN", "Accès non autorisé : rôle insuffisant", 403);
    }

    next();
  };
}

export function requireAnyRole(roles: RoleType[]) {
  return requireRole(...roles);
}

export function requireScope(scope: string) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.userRoles) {
      throw new AppError("UNAUTHORIZED", "Authentification requise", 401);
    }

    const hasScope = req.userRoles.some((r) => r.scope === scope || r.scope === "*");

    if (!hasScope) {
      throw new AppError("FORBIDDEN", `Accès non autorisé : périmètre ${scope} requis`, 403);
    }

    next();
  };
}

export function requireStructure(structureId: string) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.userRoles) {
      throw new AppError("UNAUTHORIZED", "Authentification requise", 401);
    }

    const hasAccess = req.userRoles.some((r) => r.structureId === structureId);

    if (!hasAccess) {
      throw new AppError("FORBIDDEN", "Accès non autorisé : structure non accessible", 403);
    }

    next();
  };
}