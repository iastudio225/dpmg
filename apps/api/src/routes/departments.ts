import { Router, Request, Response } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";
import {
  departmentCreateSchema,
  departmentUpdateSchema,
  departmentStatusChangeSchema,
  departmentListQuerySchema,
} from "@dpmg/shared/zod";
import { ApiError } from "@dpmg/shared";
import type { RoleType } from "@dpmg/shared";
import {
  listDepartments,
  getDepartmentById,
  createDepartment,
  updateDepartment,
  changeDepartmentStatus,
} from "../services/department.service";

const router: Router = Router();

const TECHNICAL_ADMIN: RoleType = "TECHNICAL_ADMIN";
const SUPER_ADMIN: RoleType = "SUPER_ADMIN";

// Lecture : tout utilisateur authentifié.
router.get(
  "/",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = departmentListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({
        code: "VALIDATION_ERROR",
        message: "Filtres invalides",
        details: parsed.error.flatten().fieldErrors,
      } satisfies ApiError);
    }

    const departments = await listDepartments(parsed.data);
    return res.json(departments);
  })
);

router.get(
  "/:id",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const department = await getDepartmentById(req.params["id"]!);
    return res.json(department);
  })
);

// Écriture : réservée aux administrateurs techniques.
router.post(
  "/",
  requireAuth,
  requireRole(TECHNICAL_ADMIN, SUPER_ADMIN),
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = departmentCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        code: "VALIDATION_ERROR",
        message: "Données de département invalides",
        details: parsed.error.flatten().fieldErrors,
      } satisfies ApiError);
    }

    const department = await createDepartment(req.user!.id, parsed.data);
    return res.status(201).json(department);
  })
);

router.put(
  "/:id",
  requireAuth,
  requireRole(TECHNICAL_ADMIN, SUPER_ADMIN),
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = departmentUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        code: "VALIDATION_ERROR",
        message: "Données de modification invalides",
        details: parsed.error.flatten().fieldErrors,
      } satisfies ApiError);
    }

    const department = await updateDepartment(req.user!.id, req.params["id"]!, parsed.data);
    return res.json(department);
  })
);

router.put(
  "/:id/status",
  requireAuth,
  requireRole(TECHNICAL_ADMIN, SUPER_ADMIN),
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = departmentStatusChangeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        code: "VALIDATION_ERROR",
        message: "Données de statut invalides",
        details: parsed.error.flatten().fieldErrors,
      } satisfies ApiError);
    }

    const department = await changeDepartmentStatus(req.user!.id, req.params["id"]!, parsed.data.status);
    return res.json(department);
  })
);

export default router;
