import { Router, Request, Response } from "express";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";
import { AppError } from "../middleware/errorHandler";
import { z } from "zod";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const router: Router = Router();

const listQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(50).default(20),
  cursor: z.string().optional(),
  isRead: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
});

function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(JSON.stringify({ createdAt: createdAt.toISOString(), id })).toString("base64");
}

function decodeCursor(cursor: string): { createdAt: Date; id: string } | null {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64").toString("utf8"));
    if (typeof parsed?.createdAt !== "string" || typeof parsed?.id !== "string") return null;
    const d = new Date(parsed.createdAt);
    if (isNaN(d.getTime())) return null;
    return { createdAt: d, id: parsed.id };
  } catch {
    return null;
  }
}

function toResponse(n: any) {
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    message: n.message,
    priority: n.priority,
    isRead: n.isRead,
    readAt: n.readAt ? n.readAt.toISOString() : null,
    createdAt: n.createdAt.toISOString(),
    demandeId: n.demandeId,
  };
}

// GET /api/notifications
router.get(
  "/",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({
        code: "VALIDATION_ERROR",
        message: "Paramètres invalides",
        details: parsed.error.flatten().fieldErrors,
      });
    }
    const { limit, cursor, isRead } = parsed.data;
    const userId = req.user!.id;

    const where: any = { userId };
    if (isRead !== undefined) where.isRead = isRead;

    if (cursor) {
      const c = decodeCursor(cursor);
      if (!c) {
        return res.status(400).json({ code: "VALIDATION_ERROR", message: "Curseur invalide" });
      }
      where.OR = [
        { createdAt: { lt: c.createdAt } },
        { AND: [{ createdAt: c.createdAt }, { id: { lt: c.id } }] },
      ];
    }

    const items = await prisma.notification.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    });

    let nextCursor: string | null = null;
    if (items.length > limit) {
      const last = items[limit - 1];
      if (last) {
        nextCursor = encodeCursor(last.createdAt, last.id);
      }
      items.splice(limit);
    }

    return res.json({ items: items.map(toResponse), nextCursor });
  })
);

// GET /api/notifications/unread-count
router.get(
  "/unread-count",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const count = await prisma.notification.count({
      where: { userId: req.user!.id, isRead: false },
    });
    return res.json({ count });
  })
);

// PATCH /api/notifications/read-all
router.patch(
  "/read-all",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const now = new Date();
    const result = await prisma.notification.updateMany({
      where: { userId: req.user!.id, isRead: false },
      data: { isRead: true, readAt: now },
    });
    return res.json({ updated: result.count });
  })
);

// PATCH /api/notifications/by-demande/:demandeId/read
router.patch(
  "/by-demande/:demandeId/read",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const demandeId = req.params["demandeId"]!;
    const result = await prisma.notification.updateMany({
      where: { userId: req.user!.id, demandeId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    return res.json({ updated: result.count });
  })
);

// PATCH /api/notifications/:id/read
router.patch(
  "/:id/read",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params["id"]!;
    const existing = await prisma.notification.findUnique({ where: { id } });
    if (!existing || existing.userId !== req.user!.id) {
      return res.status(404).json({ code: "NOT_FOUND", message: "Notification non trouvée" });
    }
    if (existing.isRead) {
      return res.json(toResponse(existing));
    }
    const updated = await prisma.notification.update({
      where: { id },
      data: { isRead: true, readAt: new Date() },
    });
    return res.json(toResponse(updated));
  })
);

export default router;