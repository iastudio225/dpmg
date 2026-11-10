import { Router, Request, Response } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";
import {
  structureCreateSchema,
  structureUpdateSchema,
  structureStatusChangeSchema,
  structureListQuerySchema,
} from "@dpmg/shared/zod";
import { ApiError } from "@dpmg/shared";
import type { RoleType } from "@dpmg/shared";
import {
  listStructures,
  getStructureById,
  createStructure,
  updateStructure,
  changeStructureStatus,
  listChildren,
  getAncestors,
} from "../services/structure.service";

const router: Router = Router();

const TECHNICAL_ADMIN: RoleType = "TECHNICAL_ADMIN";
const SUPER_ADMIN: RoleType = "SUPER_ADMIN";

// Lecture : tout utilisateur authentifié (requis par les formulaires de rôle).
router.get(
  "/",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = structureListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({
        code: "VALIDATION_ERROR",
        message: "Filtres invalides",
        details: parsed.error.flatten().fieldErrors,
      } satisfies ApiError);
    }

    const structures = await listStructures(parsed.data);
    return res.json(structures);
  })
);

router.get(
  "/:id",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const structure = await getStructureById(req.params["id"]!);
    return res.json(structure);
  })
);

// Écriture : réservée aux administrateurs techniques.
router.post(
  "/",
  requireAuth,
  requireRole(TECHNICAL_ADMIN, SUPER_ADMIN),
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = structureCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        code: "VALIDATION_ERROR",
        message: "Données de structure invalides",
        details: parsed.error.flatten().fieldErrors,
      } satisfies ApiError);
    }

    const structure = await createStructure(req.user!.id, parsed.data);
    return res.status(201).json(structure);
  })
);

router.put(
  "/:id",
  requireAuth,
  requireRole(TECHNICAL_ADMIN, SUPER_ADMIN),
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = structureUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        code: "VALIDATION_ERROR",
        message: "Données de modification invalides",
        details: parsed.error.flatten().fieldErrors,
      } satisfies ApiError);
    }

    const structure = await updateStructure(req.user!.id, req.params["id"]!, parsed.data);
    return res.json(structure);
  })
);

router.get(
  "/:id/children",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const children = await listChildren(req.params["id"]!);
    return res.json(children);
  })
);

router.get(
  "/:id/ancestors",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const ancestors = await getAncestors(req.params["id"]!);
    return res.json(ancestors);
  })
);

router.put(
  "/:id/status",
  requireAuth,
  requireRole(TECHNICAL_ADMIN, SUPER_ADMIN),
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = structureStatusChangeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        code: "VALIDATION_ERROR",
        message: "Données de statut invalides",
        details: parsed.error.flatten().fieldErrors,
      } satisfies ApiError);
    }

    const structure = await changeStructureStatus(req.user!.id, req.params["id"]!, parsed.data.status);
    return res.json(structure);
  })
);

export default router;
