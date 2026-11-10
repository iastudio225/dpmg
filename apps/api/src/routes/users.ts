import { Router, Request, Response } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";
import {
  userCreateSchema,
  userUpdateSchema,
  userStatusChangeSchema,
  resetPasswordSchema,
  userRoleAssignmentSchema,
  userRoleUpdateSchema,
  userListQuerySchema,
  auditLogListQuerySchema,
} from "@dpmg/shared/zod";
import { ApiError } from "@dpmg/shared";
import { ZodError } from "zod";
import type { RoleType } from "@dpmg/shared";
import {
  listUsers,
  getUserById,
  createUser,
  updateUser,
  changeUserStatus,
  resetPassword,
  invalidateSessions,
  assignUserRole,
  updateUserRole,
  removeUserRole,
  listAuditLogs,
} from "../services/user.service";

const router: Router = Router();

const TECHNICAL_ADMIN: RoleType = "TECHNICAL_ADMIN";
const SUPER_ADMIN: RoleType = "SUPER_ADMIN";

// ---------------------------------------------------------------------------
// Journal d'audit — route statique déclarée AVANT les routes dynamiques "/:id".
// ---------------------------------------------------------------------------
router.get(
  "/audit-logs",
  requireAuth,
  requireRole(TECHNICAL_ADMIN, SUPER_ADMIN),
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = auditLogListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({
        code: "VALIDATION_ERROR",
        message: "Filtres invalides",
        details: parsed.error.flatten().fieldErrors,
      } satisfies ApiError);
    }

    const logs = await listAuditLogs(req.user!.id, parsed.data);
    return res.json(logs);
  })
);

router.get(
  "/",
  requireAuth,
  requireRole(TECHNICAL_ADMIN, SUPER_ADMIN),
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = userListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({
        code: "VALIDATION_ERROR",
        message: "Filtres invalides",
        details: parsed.error.flatten().fieldErrors,
      } satisfies ApiError);
    }

    const users = await listUsers(parsed.data);
    return res.json(users);
  })
);

router.post(
  "/",
  requireAuth,
  requireRole(TECHNICAL_ADMIN, SUPER_ADMIN),
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = userCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        code: "VALIDATION_ERROR",
        message: "Données utilisateur invalides",
        details: parsed.error.flatten().fieldErrors,
      } satisfies ApiError);
    }

    const user = await createUser(req.user!.id, parsed.data);
    return res.status(201).json(user);
  })
);

router.get(
  "/:id",
  requireAuth,
  requireRole(TECHNICAL_ADMIN, SUPER_ADMIN),
  asyncHandler(async (req: Request, res: Response) => {
    const user = await getUserById(req.params["id"]!);
    return res.json(user);
  })
);

router.put(
  "/:id",
  requireAuth,
  requireRole(TECHNICAL_ADMIN, SUPER_ADMIN),
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = userUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        code: "VALIDATION_ERROR",
        message: "Données de modification invalides",
        details: parsed.error.flatten().fieldErrors,
      } satisfies ApiError);
    }

    const user = await updateUser(req.user!.id, req.params["id"]!, parsed.data);
    return res.json(user);
  })
);

router.put(
  "/:id/status",
  requireAuth,
  requireRole(TECHNICAL_ADMIN, SUPER_ADMIN),
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = userStatusChangeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        code: "VALIDATION_ERROR",
        message: "Données de statut invalides",
        details: parsed.error.flatten().fieldErrors,
      } satisfies ApiError);
    }

    const user = await changeUserStatus(req.user!.id, req.params["id"]!, parsed.data.status);
    return res.json(user);
  })
);

router.post(
  "/:id/reset-password",
  requireAuth,
  requireRole(TECHNICAL_ADMIN, SUPER_ADMIN),
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = resetPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        code: "VALIDATION_ERROR",
        message: "Données de réinitialisation invalides",
        details: parsed.error.flatten().fieldErrors,
      } satisfies ApiError);
    }

    const result = await resetPassword(req.user!.id, req.params["id"]!, parsed.data.password);
    return res.json({ temporaryPassword: result.temporaryPassword, success: true });
  })
);

router.delete(
  "/:id/sessions",
  requireAuth,
  requireRole(TECHNICAL_ADMIN, SUPER_ADMIN),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await invalidateSessions(req.user!.id, req.params["id"]!);
    return res.json(result);
  })
);

router.post(
  "/:id/roles",
  requireAuth,
  requireRole(TECHNICAL_ADMIN, SUPER_ADMIN),
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = userRoleAssignmentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        code: "VALIDATION_ERROR",
        message: "Données d'attribution invalides",
        details: parsed.error.flatten().fieldErrors,
      } satisfies ApiError);
    }

    await assignUserRole(req.user!.id, req.params["id"]!, parsed.data);
    return res.status(204).send();
  })
);

router.put(
  "/:id/roles/:roleId",
  requireAuth,
  requireRole(TECHNICAL_ADMIN, SUPER_ADMIN),
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = userRoleUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        code: "VALIDATION_ERROR",
        message: "Données de modification de rôle invalides",
        details: parsed.error.flatten().fieldErrors,
      } satisfies ApiError);
    }

    await updateUserRole(req.user!.id, req.params["id"]!, req.params["roleId"]!, parsed.data);
    return res.json({ success: true });
  })
);

router.delete(
  "/:id/roles/:roleId",
  requireAuth,
  requireRole(TECHNICAL_ADMIN, SUPER_ADMIN),
  asyncHandler(async (req: Request, res: Response) => {
    await removeUserRole(req.user!.id, req.params["id"]!, req.params["roleId"]!);
    return res.json({ success: true });
  })
);

export default router;
