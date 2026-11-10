import { Router, Request, Response } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";
import {
  consolidationCreateSchema,
  consolidationAddDemandesSchema,
} from "@dpmg/shared/zod";
import type { ApiError, RoleType } from "@dpmg/shared";
import {
  createConsolidation,
  listConsolidations,
  getConsolidation,
  addDemandes,
  removeDemande,
  transmitConsolidation,
  deleteConsolidation,
  getAvisCompleteness,
} from "../services/consolidation.service";
import {
  addConsolidationObservation,
  listConsolidationObservations,
} from "../services/consolidation-observation.service";
import { consolidationObservationCreateSchema } from "@dpmg/shared/zod";

const router: Router = Router();

const DPMG_MANAGER: RoleType = "DPMG_MANAGER";
const SUPER_ADMIN: RoleType = "SUPER_ADMIN";
const TECHNICAL_ADMIN: RoleType = "TECHNICAL_ADMIN";

const writeRoles = [DPMG_MANAGER, SUPER_ADMIN, TECHNICAL_ADMIN] as const;

router.post(
  "/",
  requireAuth,
  requireRole(...writeRoles),
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = consolidationCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        code: "VALIDATION_ERROR",
        message: "Données de consolidation invalides",
        details: parsed.error.flatten().fieldErrors,
      } satisfies ApiError);
    }
    const consolidation = await createConsolidation(req.user!.id, parsed.data);
    return res.status(201).json(consolidation);
  })
);

router.get(
  "/",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const consolidations = await listConsolidations(req.user!.id);
    return res.json(consolidations);
  })
);

router.get(
  "/:id",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const consolidation = await getConsolidation(req.params["id"]!, req.user!.id);
    return res.json(consolidation);
  })
);

router.post(
  "/:id/demandes",
  requireAuth,
  requireRole(...writeRoles),
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = consolidationAddDemandesSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        code: "VALIDATION_ERROR",
        message: "Données de rattachement invalides",
        details: parsed.error.flatten().fieldErrors,
      } satisfies ApiError);
    }
    const consolidation = await addDemandes(req.params["id"]!, req.user!.id, parsed.data);
    return res.json(consolidation);
  })
);

router.delete(
  "/:id/demandes/:demandeId",
  requireAuth,
  requireRole(...writeRoles),
  asyncHandler(async (req: Request, res: Response) => {
    const consolidation = await removeDemande(req.params["id"]!, req.user!.id, req.params["demandeId"]!);
    return res.json(consolidation);
  })
);

router.post(
  "/:id/transmettre",
  requireAuth,
  requireRole(...writeRoles),
  asyncHandler(async (req: Request, res: Response) => {
    const consolidation = await transmitConsolidation(req.params["id"]!, req.user!.id);
    return res.json(consolidation);
  })
);

router.delete(
  "/:id",
  requireAuth,
  requireRole(...writeRoles),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await deleteConsolidation(req.params["id"]!, req.user!.id);
    return res.json(result);
  })
);

router.post(
  "/:id/observations",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = consolidationObservationCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        code: "VALIDATION_ERROR",
        message: "Données d'observation invalides",
        details: parsed.error.flatten().fieldErrors,
      } satisfies ApiError);
    }
    const observation = await addConsolidationObservation(req.params["id"]!, parsed.data.commentaire, req.user!.id);
    return res.status(201).json(observation);
  })
);

router.get(
  "/:id/observations",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const observations = await listConsolidationObservations(req.params["id"]!, req.user!.id);
    return res.json(observations);
  })
);

router.get(
  "/:id/avis",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const result = await getAvisCompleteness(req.params["id"]!, req.user!.id);
    return res.json(result);
  })
);

export default router;
