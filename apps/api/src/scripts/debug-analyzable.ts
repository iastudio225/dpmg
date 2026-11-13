import { PrismaClient, RoleType, UserStatus } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const db = await prisma.$queryRawUnsafe<Array<{ current_database: string }>>("SELECT current_database()");
  if (db[0]?.current_database !== "dpmg") throw new Error("Refusing: not dpmg");

  const email = "gbeu.olivier@laposte.ci";
  const u = await prisma.user.findUnique({ where: { email } });
  if (!u) throw new Error("not found");
  const now = new Date();

  const roles = await prisma.userStructureRole.findMany({
    where: {
      userId: u.id,
      startDate: { lte: now },
      OR: [{ endDate: null }, { endDate: { gte: now } }],
      role: { in: [RoleType.DEPARTMENT_MANAGER, RoleType.DEPARTMENT_DELEGATE] },
      user: { status: UserStatus.ACTIVE },
    },
    include: { structure: true, delegatedFrom: { include: { structureRoles: { include: { structure: true } } } } },
  });
  console.log("hab count", roles.length);

  // replicate activeDepartmentHabilitations own target
  const habilitations = roles.map(r => ({ role: r.role, own: { structureId: r.structureId, scope: r.scope, startDate: r.startDate, endDate: r.endDate }, delegatorTargets: [] }));
  const departments = await prisma.department.findMany({ where: { structureId: { not: null } }, select: { id: true, code: true, structureId: true } });
  const matching = departments.filter(d => habilitations.some(h => h.own.structureId === d.structureId));
  console.log("matching dept ids", JSON.stringify(matching));

  const demandes = await prisma.demande.findMany({ where: { status: "EN_ATTENTE_ANALYSE", departmentId: { in: matching.map(d => d.id) } } });
  console.log("demandes", demandes.map(d => d.reference));
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
