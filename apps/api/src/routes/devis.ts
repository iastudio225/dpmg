import { Router, Request, Response } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";
import { devisCreateSchema, devisUpdateSchema } from "@dpmg/shared/zod";
import type { ApiError, RoleType } from "@dpmg/shared";
import * as svc from "../services/devis.service";

const router: Router = Router();
const CPMP: RoleType = "CPMP_USER";
const SA: RoleType = "SUPER_ADMIN";
const TA: RoleType = "TECHNICAL_ADMIN";
const roles = [CPMP, SA, TA] as const;

router.get("/demande/:demandeId", requireAuth, requireRole(...roles), asyncHandler(async (req, res) => {
  const page = req.query["page"] ? Number(req.query["page"]) : 1;
  const limit = req.query["limit"] ? Number(req.query["limit"]) : 20;
  const result = await svc.listDevisByDemande(req.user!.id, req.params["demandeId"]!, page, limit);
  return res.json(result);
}));

router.get("/:id", requireAuth, requireRole(...roles), asyncHandler(async (req, res) => {
  const d = await svc.getDevis(req.user!.id, req.params["id"]!);
  return res.json(d);
}));

router.post("/", requireAuth, requireRole(...roles), asyncHandler(async (req, res) => {
  const parsed = devisCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ code: "VALIDATION_ERROR", message: "Données invalides", details: parsed.error.flatten().fieldErrors } satisfies ApiError);
  const created = await svc.createDevis(parsed.data, req.user!.id);
  return res.status(201).json(created);
}));

router.patch("/:id", requireAuth, requireRole(...roles), asyncHandler(async (req, res) => {
  const parsed = devisUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ code: "VALIDATION_ERROR", message: "Données invalides", details: parsed.error.flatten().fieldErrors } satisfies ApiError);
  const updated = await svc.updateDevis(req.user!.id, req.params["id"]!, parsed.data);
  return res.json(updated);
}));

router.delete("/:id", requireAuth, requireRole(...roles), asyncHandler(async (req, res) => {
  const result = await svc.deleteDevis(req.user!.id, req.params["id"]!);
  return res.json(result);
}));

export default router;



