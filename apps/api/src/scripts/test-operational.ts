import { resetOperational } from "../services/database-admin.service";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function counts() {
  return {
    demandes: await prisma.demande.count(),
    decisions: await prisma.demandeDecision.count(),
    consolidations: await prisma.consolidation.count(),
    obs: await prisma.consolidationObservation.count(),
    notifications: await prisma.notification.count(),
    outbox: await prisma.notificationOutbox.count(),
    sessions: await prisma.session.count(),
    users: await prisma.user.count(),
    structures: await prisma.structure.count(),
    departments: await prisma.department.count(),
    audit: await prisma.adminAuditLog.count(),
  };
}
async function main() {
  const tech = await prisma.user.findFirst({ where: { email: "tech1@test.local" } });
  if (!tech) throw new Error("tech not found");
  console.log("before", await counts());
  const r = await resetOperational(tech.id, "TestAdmin!2026", "REINITIALISER");
  console.log(JSON.stringify(r));
  console.log("after", await counts());
}
main().catch(e=>{console.error(e);process.exit(1);}).finally(()=>prisma.$disconnect());
