import { PrismaClient } from "@prisma/client";
import { listDemandes, getDemandeStats } from "../services/demande.service";

const prisma = new PrismaClient();

async function main() {
  const db = await prisma.$queryRawUnsafe<Array<{ current_database: string }>>("SELECT current_database()");
  if (db[0]?.current_database !== "dpmg") throw new Error("Refusing: not dpmg");

  for (const email of ["konate.mamourou@laposte.ci", "gbeu.olivier@laposte.ci"]) {
    const u = await prisma.user.findUnique({ where: { email } });
    if (!u) { console.log(email, "NOT_FOUND"); continue; }
    const list = await listDemandes(u.id, [], {});
    const stats = await getDemandeStats(u.id, []);
    console.log(email, "LIST", list.length, list.map((x: any) => x.reference + ":" + x.status));
    console.log(email, "STATS", JSON.stringify({ totalVisible: stats.totalVisible, enAttenteAnalyse: stats.enAttenteAnalyse }));
  }
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
