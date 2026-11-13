import { Router, Request, Response } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";
import { RoleType } from "@prisma/client";
import { z } from "zod";
import {
  createBackup,
  resetOperational,
  resetFull,
} from "../services/database-admin.service";

const router: Router = Router();
const TECHNICAL_ADMIN: RoleType = "TECHNICAL_ADMIN";

const resetSchema = z.object({
  currentPassword: z.string().min(1),
  confirmationText: z.string(),
});

router.post(
  "/backup",
  requireAuth,
  requireRole(TECHNICAL_ADMIN),
  asyncHandler(async (_req: Request, res: Response) => {
    const result = await createBackup();
    return res.json(result);
  })
);

router.post(
  "/reset-operational",
  requireAuth,
  requireRole(TECHNICAL_ADMIN),
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = resetSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        code: "VALIDATION_ERROR",
        message: "Données invalides",
        details: parsed.error.flatten().fieldErrors,
      });
    }
    const result = await resetOperational(
      req.user!.id,
      parsed.data.currentPassword,
      parsed.data.confirmationText
    );
    return res.json(result);
  })
);

router.post(
  "/reset-full",
  requireAuth,
  requireRole(TECHNICAL_ADMIN),
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = resetSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        code: "VALIDATION_ERROR",
        message: "Données invalides",
        details: parsed.error.flatten().fieldErrors,
      });
    }
    const result = await resetFull(
      req.user!.id,
      parsed.data.currentPassword,
      parsed.data.confirmationText
    );
    return res.json(result);
  })
);

export default router;
