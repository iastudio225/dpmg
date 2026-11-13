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
    where: { userId: u.id, startDate: { lte: now }, OR: [{ endDate: null }, { endDate: { gte: now } }] },
    include: { structure: true },
  });
  console.log("roles", JSON.stringify(roles.map(r => ({ role: r.role, structureId: r.structureId, structureCode: r.structure?.code, scope: r.scope, start: r.startDate, end: r.endDate }))));

  const depts = await prisma.department.findMany({ where: { structureId: { not: null } }, select: { id: true, code: true, structureId: true } });
  console.log("dept LOGIS", JSON.stringify(depts.find(d => d.code === "LOGIS")));

  const matching = depts.filter(d => roles.some(r => r.structureId === d.structureId));
  console.log("matching depts", JSON.stringify(matching));
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
