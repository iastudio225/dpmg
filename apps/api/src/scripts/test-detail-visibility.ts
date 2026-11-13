import { PrismaClient } from "@prisma/client";
import { findVisibleDemande } from "../services/demande.service";

const prisma = new PrismaClient();

async function main() {
  const db = await prisma.$queryRawUnsafe<Array<{ current_database: string }>>("SELECT current_database()");
  if (db[0]?.current_database !== "dpmg_admin_test") throw new Error("Refusing: not dpmg_admin_test");

  const dir = await prisma.user.findFirst({ where: { email: "dir-vis@test.local" } });
  if (!dir) throw new Error("director not found");
  const demande = await prisma.demande.findFirst({ where: { reference: "DEM-VIS-1" } });
  if (!demande) throw new Error("demande not found");

  const result = await findVisibleDemande(demande.id, dir.id, []);
  console.log("DETAIL_RESULT", result ? result.reference + " " + result.status : "null");
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
