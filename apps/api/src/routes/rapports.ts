import { Router, Request, Response } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";
import { rapportGlobalQuerySchema } from "@dpmg/shared/zod";
import type { ApiError, RoleType } from "@dpmg/shared";
import { getRapportGlobal } from "../services/rapport.service";

const router: Router = Router();

const DPMG_MANAGER: RoleType = "DPMG_MANAGER";
const DPMG_DELEGATE: RoleType = "DPMG_DELEGATE";
const SUPER_ADMIN: RoleType = "SUPER_ADMIN";
const TECHNICAL_ADMIN: RoleType = "TECHNICAL_ADMIN";

const reportRoles = [DPMG_MANAGER, DPMG_DELEGATE, SUPER_ADMIN, TECHNICAL_ADMIN] as const;

const MANAGER_ROLES = new Set([
  "HIERARCHICAL_MANAGER",
  "DEPARTMENT_MANAGER",
  "DEPARTMENT_DELEGATE",
  "DPMG_MANAGER",
  "DPMG_DELEGATE",
]);

/** Codes de périmètre (scope) des rôles de management de l'utilisateur. */
function managerScopesFromRequest(req: Request): string[] {
  const scopes = new Set<string>();
  for (const role of req.userRoles ?? []) {
    if (MANAGER_ROLES.has(role.role) && role.scope && role.scope !== "*") {
      scopes.add(role.scope);
    }
  }
  return [...scopes];
}

/**
 * Rapport global : agrégats + détail des demandes visibles, filtrables par
 * période (AAAA-MM-JJ), département, direction, statut et urgence.
 */
router.get(
  "/global",
  requireAuth,
  requireRole(...reportRoles),
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = rapportGlobalQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({
        code: "VALIDATION_ERROR",
        message: "Filtres de rapport invalides",
        details: parsed.error.flatten().fieldErrors,
      } satisfies ApiError);
    }
    const rapport = await getRapportGlobal(req.user!.id, managerScopesFromRequest(req), parsed.data);
    return res.json(rapport);
  })
);

export default router;
