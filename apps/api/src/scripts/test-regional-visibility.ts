import { PrismaClient, RoleType, UserStatus, StructureType, DemandeCategory, DemandeStatus } from "@prisma/client";
import { hashPassword } from "../services/auth.service";
import { listDemandes, getDemandeStats } from "../services/demande.service";

const prisma = new PrismaClient();

async function main() {
  const db = await prisma.$queryRawUnsafe<Array<{ current_database: string }>>("SELECT current_database()");
  if (db[0]?.current_database !== "dpmg_admin_test") throw new Error("Refusing: not dpmg_admin_test");

  const passwordHash = await hashPassword("TestVis!2026");

  const stamp = Date.now().toString();
  const regional = await prisma.structure.create({ data: { code: "DCR-VIS-" + stamp, name: "DR Vis", type: StructureType.REGIONAL_DIRECTION, status: true } });
  const agency = await prisma.structure.create({ data: { code: "ABJ-VIS-" + stamp, name: "Agence Vis", type: StructureType.AGENCY, parentId: regional.id, status: true } });

  const dept1 = await prisma.department.create({ data: { name: "Dept Infra Vis " + stamp, code: "INFRA-VIS-" + stamp, status: true, structureId: agency.id } });
  const dept2 = await prisma.department.create({ data: { name: "Dept Logis Vis " + stamp, code: "LOGIS-VIS-" + stamp, status: true } });

  const employee = await prisma.user.create({ data: { email: "emp-vis@test.local", firstName: "Emp", lastName: "Vis", passwordHash, status: UserStatus.ACTIVE } });
  const director = await prisma.user.create({ data: { email: "dir-vis@test.local", firstName: "Dir", lastName: "Vis", passwordHash, status: UserStatus.ACTIVE } });

  await prisma.userStructureRole.create({ data: { userId: employee.id, structureId: agency.id, role: RoleType.EMPLOYEE } });
  await prisma.userStructureRole.create({ data: { userId: director.id, structureId: regional.id, role: RoleType.HIERARCHICAL_MANAGER, scope: "*" } });

  await prisma.demande.create({ data: { reference: "DEM-VIS-1", title: "d1", description: "d", status: DemandeStatus.EN_ATTENTE_VALIDATION, category: DemandeCategory.INFRASTRUCTURE, authorId: employee.id, departmentId: dept1.id } });
  await prisma.demande.create({ data: { reference: "DEM-VIS-2", title: "d2", description: "d", status: DemandeStatus.EN_ATTENTE_VALIDATION, category: DemandeCategory.LOGISTIQUE, authorId: employee.id, departmentId: dept2.id } });

  const list = await listDemandes(director.id, [], {});
  const stats = await getDemandeStats(director.id, []);
  console.log("LIST_COUNT", list.length, list.map((x: any) => x.reference));
  console.log("STATS", JSON.stringify({ totalVisible: stats.totalVisible, enAttenteValidation: stats.enAttenteValidation }));
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
