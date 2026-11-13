import { prisma } from "../lib/prisma";
import { AppError } from "../middleware/errorHandler";

async function assertDemandeAccess(demandeId: string) {
  const d = await prisma.demande.findUnique({ where: { id: demandeId } });
  if (!d) throw new AppError("NOT_FOUND", "Demande non trouvée", 404);
}

export async function createDevis(data: any, userId: string) {
  await assertDemandeAccess(data.demandeId);
  const demande = await prisma.demande.findUnique({ where: { id: data.demandeId } });
  if (!demande) throw new AppError("NOT_FOUND", "Demande non trouvée", 404);
  const prestataire = await prisma.prestataire.findUnique({ where: { id: data.prestataireId } });
  if (!prestataire) throw new AppError("NOT_FOUND", "Prestataire non trouvé", 404);
  if (!prestataire.isActive) throw new AppError("PRESTATAIRE_INACTIF", "Prestataire inactif", 409);
  // financial validations
  const ht = data.montantHT ?? null;
  const tva = data.montantTVA ?? null;
  const ttc = data.montantTTC ?? null;
  if (ht !== null && ht < 0) throw new AppError("VALIDATION_ERROR", "Montant HT négatif", 400);
  if (tva !== null && tva < 0) throw new AppError("VALIDATION_ERROR", "Montant TVA négatif", 400);
  if (ttc !== null && ttc < 0) throw new AppError("VALIDATION_ERROR", "Montant TTC négatif", 400);
  if (ht !== null && tva !== null && ttc !== null && Math.abs(ttc - (ht + tva)) > 0.001) throw new AppError("VALIDATION_ERROR", "Incohérence TTC = HT + TVA", 400);
  if (ht !== null && ttc !== null && ttc < ht) throw new AppError("VALIDATION_ERROR", "TTC < HT", 400);

  return prisma.devis.create({
    data: {
      reference: data.reference ?? null,
      demandeId: data.demandeId,
      prestataireId: data.prestataireId,
      dateDevis: data.dateDevis ? new Date(data.dateDevis) : null,
      dateValidite: data.dateValidite ? new Date(data.dateValidite) : null,
      montantHT: ht,
      montantTVA: tva,
      montantTTC: ttc,
      devise: data.devise ?? "XOF",
      description: data.description ?? null,
      observations: data.observations ?? null,
      createdById: userId,
    },
  });
}

export async function listDevisByDemande(demandeId: string, page = 1, limit = 20) {
  await assertDemandeAccess(demandeId);
  const [items, total] = await Promise.all([
    prisma.devis.findMany({ where: { demandeId }, include: { prestataire: true }, orderBy: { createdAt: "desc" }, skip: (page-1)*limit, take: limit }),
    prisma.devis.count({ where: { demandeId } }),
  ]);
  return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
}

export async function getDevis(id: string) {
  const d = await prisma.devis.findUnique({ where: { id }, include: { prestataire: true, demande: true } });
  if (!d) throw new AppError("NOT_FOUND", "Devis non trouvé", 404);
  await assertDemandeAccess(d.demandeId);
  return d;
}

export async function updateDevis(id: string, data: any) {
  const existing = await prisma.devis.findUnique({ where: { id } });
  if (!existing) throw new AppError("NOT_FOUND", "Devis non trouvé", 404);
  await assertDemandeAccess(existing.demandeId);
  const ht = data.montantHT !== undefined ? data.montantHT : (existing.montantHT ? Number(existing.montantHT) : null);
  const tva = data.montantTVA !== undefined ? data.montantTVA : (existing.montantTVA ? Number(existing.montantTVA) : null);
  const ttc = data.montantTTC !== undefined ? data.montantTTC : (existing.montantTTC ? Number(existing.montantTTC) : null);
  if (ht !== null && ht < 0) throw new AppError("VALIDATION_ERROR", "Montant HT négatif", 400);
  if (tva !== null && tva < 0) throw new AppError("VALIDATION_ERROR", "Montant TVA négatif", 400);
  if (ttc !== null && ttc < 0) throw new AppError("VALIDATION_ERROR", "Montant TTC négatif", 400);
  if (ht !== null && tva !== null && ttc !== null && Math.abs(ttc - (ht + tva)) > 0.001) throw new AppError("VALIDATION_ERROR", "Incohérence TTC = HT + TVA", 400);
  if (ht !== null && ttc !== null && ttc < ht) throw new AppError("VALIDATION_ERROR", "TTC < HT", 400);

  const updateData: any = {};
  if (data.reference !== undefined) updateData.reference = data.reference;
  if (data.dateDevis !== undefined) updateData.dateDevis = data.dateDevis ? new Date(data.dateDevis) : null;
  if (data.dateValidite !== undefined) updateData.dateValidite = data.dateValidite ? new Date(data.dateValidite) : null;
  if (data.montantHT !== undefined) updateData.montantHT = data.montantHT;
  if (data.montantTVA !== undefined) updateData.montantTVA = data.montantTVA;
  if (data.montantTTC !== undefined) updateData.montantTTC = data.montantTTC;
  if (data.devise !== undefined) updateData.devise = data.devise;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.observations !== undefined) updateData.observations = data.observations;
  if (data.prestataireId !== undefined) {
    const p = await prisma.prestataire.findUnique({ where: { id: data.prestataireId } });
    if (!p) throw new AppError("NOT_FOUND", "Prestataire non trouvé", 404);
    if (!p.isActive) throw new AppError("PRESTATAIRE_INACTIF", "Prestataire inactif", 409);
    updateData.prestataireId = data.prestataireId;
  }
  return prisma.devis.update({ where: { id }, data: updateData });
}

export async function deleteDevis(id: string) {
  const existing = await prisma.devis.findUnique({ where: { id }, include: { documents: true } });
  if (!existing) throw new AppError("NOT_FOUND", "Devis non trouvé", 404);
  await assertDemandeAccess(existing.demandeId);
  if (existing.documents && existing.documents.length > 0) {
    throw new AppError("DEVIS_HAS_DOCUMENTS", "Le devis est associé à des documents", 409);
  }
  await prisma.devis.delete({ where: { id } });
  return { deleted: true };
}
