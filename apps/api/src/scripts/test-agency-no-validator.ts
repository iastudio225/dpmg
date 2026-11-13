import { PrismaClient, RoleType, UserStatus, StructureType, DemandeCategory, DemandeStatus } from "@prisma/client";
import { hashPassword } from "../services/auth.service";
import { submitDemande } from "../services/demande.service";

const prisma = new PrismaClient();

async function main() {
  const db = await prisma.$queryRawUnsafe<Array<{ current_database: string }>>("SELECT current_database()");
  if (db[0]?.current_database !== "dpmg_admin_test") throw new Error("Refusing: not dpmg_admin_test");

  const passwordHash = await hashPassword("TestAgency!2026");
  const regional = await prisma.structure.create({ data: { code: "DCR-TEST2", name: "DR Test 2", type: StructureType.REGIONAL_DIRECTION, status: true } });
  const agency = await prisma.structure.create({ data: { code: "ABJ-TEST2", name: "Agence Test 2", type: StructureType.AGENCY, parentId: regional.id, status: true } });
  const dept = await prisma.department.create({ data: { name: "Dept 2", code: "LOGIS2", status: true, structureId: agency.id } });
  const employee = await prisma.user.create({ data: { email: "emp-agency2@test.local", firstName: "Emp", lastName: "Agency2", passwordHash, status: UserStatus.ACTIVE } });
  await prisma.userStructureRole.create({ data: { userId: employee.id, structureId: agency.id, role: RoleType.EMPLOYEE } });
  const demande = await prisma.demande.create({ data: { reference: "DEM-AGENCY-TEST2", title: "Demande test 2", description: "desc", status: DemandeStatus.BROUILLON, category: DemandeCategory.INFRASTRUCTURE, authorId: employee.id, departmentId: dept.id } });

  try {
    await submitDemande(demande.id, employee.id);
    console.log("UNEXPECTED_SUCCESS");
  } catch (e: any) {
    console.log("EXPECTED_ERROR", e.code, e.message);
  }
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
