import { PrismaClient } from "@prisma/client";
import { listDemandes, findVisibleDemande } from "../services/demande.service";

const prisma = new PrismaClient();

async function main() {
  const db = await prisma.$queryRawUnsafe<Array<{ current_database: string }>>("SELECT current_database()");
  if (db[0]?.current_database !== "dpmg") throw new Error("Refusing: not dpmg");

  const users = ["konate.mamourou@laposte.ci", "gbeu.olivier@laposte.ci"];
  for (const email of users) {
    const u = await prisma.user.findUnique({ where: { email } });
    if (!u) { console.log(email, "NOT_FOUND"); continue; }
    const list = await listDemandes(u.id, [], {});
    console.log(email, "VISIBLE", list.map((x: any) => x.reference + ":" + x.status));

    // Test cross-access to the two known demandes
    const refs = ["DEM-2026-ZENPK", "DEM-2026-8UVKP"];
    for (const ref of refs) {
      const d = await prisma.demande.findFirst({ where: { reference: ref } });
      if (!d) continue;
      const visible = await findVisibleDemande(d.id, u.id, []);
      console.log(email, "DETAIL", ref, visible ? "ACCESSIBLE" : "DENIED");
    }
  }

  // MAGASIN responsible search
  const magasinUsers = await prisma.user.findMany({
    where: { structureRoles: { some: { structure: { code: "MAGASIN" } } } },
    select: { email: true },
  });
  console.log("MAGASIN_RESPONSIBLES", JSON.stringify(magasinUsers));
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
