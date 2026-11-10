import { Router, Request, Response } from "express";
import { healthCheckResponseSchema } from "@dpmg/shared/zod";

const router: Router = Router();

router.get("/health", (_req: Request, res: Response) => {
  const response = {
    status: "ok" as const,
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
  };

  const parsed = healthCheckResponseSchema.safeParse(response);
  if (!parsed.success) {
    return res.status(500).json({
      code: "INTERNAL_ERROR",
      message: "Erreur de validation de la réponse health check",
    });
  }

  return res.json(parsed.data);
});

export default router;