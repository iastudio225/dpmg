import { resetFull } from "../services/database-admin.service";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function main() {
  const techBefore = await prisma.user.findMany({ where: { structureRoles: { some: { role: "TECHNICAL_ADMIN" } } }, select: { id: true, email: true, status: true, passwordHash: true, structureRoles: { select: { role: true, structureId: true } } } });
  console.log("techBefore", JSON.stringify(techBefore));
  console.log("before users", await prisma.user.count(), "structures", await prisma.structure.count(), "departments", await prisma.department.count());
  const actor = techBefore[0]!;
  const r = await resetFull(actor.id, "TestAdmin!2026", "REINITIALISER");
  console.log(JSON.stringify(r));
  const techAfter = await prisma.user.findMany({ where: { structureRoles: { some: { role: "TECHNICAL_ADMIN" } } }, select: { id: true, email: true, status: true, passwordHash: true, structureRoles: { select: { role: true, structureId: true } } } });
  console.log("techAfter", JSON.stringify(techAfter));
  console.log("after users", await prisma.user.count(), "structures", await prisma.structure.count(), "departments", await prisma.department.count());
}
main().catch(e=>{console.error(e);process.exit(1);}).finally(()=>prisma.$disconnect());
