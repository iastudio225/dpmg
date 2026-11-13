import { Router, Request, Response } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";
import { prestataireCreateSchema, prestataireUpdateSchema } from "@dpmg/shared/zod";
import type { ApiError, RoleType } from "@dpmg/shared";
import * as svc from "../services/prestataire.service";

const router: Router = Router();
const CPMP: RoleType = "CPMP_USER";
const SA: RoleType = "SUPER_ADMIN";
const TA: RoleType = "TECHNICAL_ADMIN";
const roles = [CPMP, SA, TA] as const;

router.get("/", requireAuth, requireRole(...roles), asyncHandler(async (req, res) => {
  const search = typeof req.query["search"] === "string" ? req.query["search"] : undefined;
  const isActive = req.query["isActive"] === "true" ? true : req.query["isActive"] === "false" ? false : undefined;
  const page = req.query["page"] ? Number(req.query["page"]) : 1;
  const limit = req.query["limit"] ? Number(req.query["limit"]) : 20;
  const result = await svc.listPrestataires({ search, isActive, page, limit });
  return res.json(result);
}));

router.get("/:id", requireAuth, requireRole(...roles), asyncHandler(async (req, res) => {
  const p = await svc.getPrestataire(req.params["id"]!);
  return res.json(p);
}));

router.post("/", requireAuth, requireRole(...roles), asyncHandler(async (req, res) => {
  const parsed = prestataireCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ code: "VALIDATION_ERROR", message: "Données invalides", details: parsed.error.flatten().fieldErrors } satisfies ApiError);
  const created = await svc.createPrestataire(parsed.data, req.user!.id);
  return res.status(201).json(created);
}));

router.patch("/:id", requireAuth, requireRole(...roles), asyncHandler(async (req, res) => {
  const parsed = prestataireUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ code: "VALIDATION_ERROR", message: "Données invalides", details: parsed.error.flatten().fieldErrors } satisfies ApiError);
  const updated = await svc.updatePrestataire(req.params["id"]!, parsed.data);
  return res.json(updated);
}));

router.post("/:id/activate", requireAuth, requireRole(...roles), asyncHandler(async (req, res) => {
  const updated = await svc.setPrestataireActive(req.params["id"]!, true);
  return res.json(updated);
}));

router.post("/:id/deactivate", requireAuth, requireRole(...roles), asyncHandler(async (req, res) => {
  const updated = await svc.setPrestataireActive(req.params["id"]!, false);
  return res.json(updated);
}));

export default router;



