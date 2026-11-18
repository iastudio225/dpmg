import { PrismaClient, Prisma, DemandeStatus } from "@prisma/client";
import {
  type RapportDemandeRow,
  type RapportGlobalQuery,
  type RapportGlobalResponse,
} from "@dpmg/shared/zod";
import { buildDemandeVisibilityWhere } from "./demande.service";

const prisma = new PrismaClient();

/**
 * Rapport global DPMG : agrégats + détail des demandes visibles par
 * l'utilisateur, filtrables par période, département, direction, statut et
 * urgence. Réutilise strictement la même règle de visibilité que la liste
 * des demandes (buildDemandeVisibilityWhere).
 */
export async function getRapportGlobal(
  userId: string,
  managerScopes: string[],
  filters: RapportGlobalQuery
): Promise<RapportGlobalResponse> {
  const baseWhere = await buildDemandeVisibilityWhere(userId, managerScopes);
  const andClauses: Prisma.DemandeWhereInput[] = [
    ...((baseWhere.AND as Prisma.DemandeWhereInput[] | undefined) ?? []),
  ];

  if (filters.from || filters.to) {
    const createdAt: Prisma.DateTimeFilter = {};
    if (filters.from) createdAt.gte = new Date(`${filters.from}T00:00:00.000Z`);
    if (filters.to) createdAt.lte = new Date(`${filters.to}T23:59:59.999Z`);
    andClauses.push({ createdAt });
  }
  if (filters.departmentId) andClauses.push({ departmentId: filters.departmentId });
  if (filters.structureId) andClauses.push({ department: { structureId: filters.structureId } });
  if (filters.status) andClauses.push({ status: filters.status });
  if (filters.urgent !== undefined) andClauses.push({ isUrgent: filters.urgent });

  const rows = await prisma.demande.findMany({
    where: { AND: andClauses },
    select: {
      id: true,
      reference: true,
      title: true,
      status: true,
      category: true,
      isUrgent: true,
      createdAt: true,
      submittedAt: true,
      closedAt: true,
      departmentId: true,
      department: {
        select: {
          code: true,
          name: true,
          structureId: true,
          structure: { select: { name: true } },
        },
      },
      author: { select: { firstName: true, lastName: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const byStatus = new Map<DemandeStatus, number>();
  const byDepartment = new Map<
    string,
    { departmentId: string; departmentCode: string; departmentName: string; count: number }
  >();
  const byStructure = new Map<
    string | null,
    { structureId: string | null; structureName: string | null; count: number }
  >();

  let urgentes = 0;
  let cloturees = 0;

  const demandes: RapportDemandeRow[] = rows.map((row) => {
    byStatus.set(row.status, (byStatus.get(row.status) ?? 0) + 1);

    const deptAgg = byDepartment.get(row.departmentId);
    if (deptAgg) {
      deptAgg.count += 1;
    } else {
      byDepartment.set(row.departmentId, {
        departmentId: row.departmentId,
        departmentCode: row.department.code,
        departmentName: row.department.name,
        count: 1,
      });
    }

    const structureId = row.department.structureId;
    const structureName = row.department.structure?.name ?? null;
    const structAgg = byStructure.get(structureId);
    if (structAgg) {
      structAgg.count += 1;
    } else {
      byStructure.set(structureId, { structureId, structureName, count: 1 });
    }

    if (row.isUrgent) urgentes += 1;
    if (row.status === DemandeStatus.CLOTUREE) cloturees += 1;

    return {
      id: row.id,
      reference: row.reference,
      title: row.title,
      status: row.status,
      category: row.category,
      departmentId: row.departmentId,
      departmentCode: row.department.code,
      departmentName: row.department.name,
      structureId,
      structureName,
      authorFirstName: row.author.firstName,
      authorLastName: row.author.lastName,
      isUrgent: row.isUrgent,
      createdAt: row.createdAt.toISOString(),
      submittedAt: row.submittedAt?.toISOString() ?? null,
      closedAt: row.closedAt?.toISOString() ?? null,
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    from: filters.from ?? null,
    to: filters.to ?? null,
    total: demandes.length,
    urgentes,
    cloturees,
    byStatus: [...byStatus.entries()]
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count),
    byDepartment: [...byDepartment.values()].sort((a, b) => b.count - a.count),
    byStructure: [...byStructure.values()].sort((a, b) => b.count - a.count),
    demandes,
  };
}
