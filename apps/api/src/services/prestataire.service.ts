import { prisma } from "../lib/prisma";
import { AppError } from "../middleware/errorHandler";

export async function listPrestataires(params: { search?: string; isActive?: boolean; page?: number; limit?: number }) {
  const { search, isActive, page = 1, limit = 20 } = params;
  const where: any = {};
  if (isActive !== undefined) where.isActive = isActive;
  if (search) where.OR = [{ nom: { contains: search, mode: "insensitive" } }, { raisonSociale: { contains: search, mode: "insensitive" } }];
  const [items, total] = await Promise.all([
    prisma.prestataire.findMany({ where, skip: (page - 1) * limit, take: limit, orderBy: { nom: "asc" } }),
    prisma.prestataire.count({ where }),
  ]);
  return { items, total, page, limit };
}

export async function createPrestataire(data: any, userId: string) {
  return prisma.prestataire.create({ data: { ...data, createdById: userId, isActive: true } });
}

export async function getPrestataire(id: string) {
  const p = await prisma.prestataire.findUnique({ where: { id } });
  if (!p) throw new AppError("NOT_FOUND", "Prestataire non trouvé", 404);
  return p;
}

export async function updatePrestataire(id: string, data: any) {
  const p = await prisma.prestataire.findUnique({ where: { id } });
  if (!p) throw new AppError("NOT_FOUND", "Prestataire non trouvé", 404);
  return prisma.prestataire.update({ where: { id }, data });
}

export async function setPrestataireActive(id: string, isActive: boolean) {
  const p = await prisma.prestataire.findUnique({ where: { id } });
  if (!p) throw new AppError("NOT_FOUND", "Prestataire non trouvé", 404);
  return prisma.prestataire.update({ where: { id }, data: { isActive } });
}
