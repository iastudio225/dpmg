import { PrismaClient } from "@prisma/client";
import { createNotificationOutboxEntries } from "../services/notification.service";

const prisma = new PrismaClient();

async function main() {
  const db = await prisma.$queryRawUnsafe<Array<{ current_database: string }>>("SELECT current_database()");
  if (db[0]?.current_database !== "dpmg_admin_test") throw new Error("Refusing: not dpmg_admin_test");

  const demande = await prisma.demande.findFirst({ where: { reference: { startsWith: "DEM-LOTN1-" } } });
  if (!demande) throw new Error("demande not found");

  const dept = await prisma.department.findUnique({ where: { id: demande.departmentId } });
  if (!dept) throw new Error("department not found");

  const created = await prisma.$transaction(async (tx) => {
    return createNotificationOutboxEntries(tx, {
      type: "DEMANDE_EN_ATTENTE_ANALYSE",
      demande: {
        id: demande.id,
        reference: demande.reference,
        authorId: demande.authorId,
        departmentId: demande.departmentId,
        department: { code: dept.code, structureId: dept.structureId ?? null },
        isUrgent: demande.isUrgent,
      },
      eventSourceId: demande.id,
    });
  });
  console.log("created on replay", created);
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
