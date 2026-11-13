import { PrismaClient, RoleType, UserStatus, StructureType, DemandeCategory, DemandeStatus } from "@prisma/client";
import { hashPassword } from "../services/auth.service";
import { submitDemande, approveDemande } from "../services/demande.service";
import { reserveBatch, processOne } from "../worker/notifications";

const prisma = new PrismaClient();

async function main() {
  const db = await prisma.$queryRawUnsafe<Array<{ current_database: string }>>("SELECT current_database()");
  if (db[0]?.current_database !== "dpmg_admin_test") throw new Error("Refusing: not dpmg_admin_test");

  const passwordHash = await hashPassword("TestLotN1!2026");
  const stamp = Date.now().toString();

  const regional = await prisma.structure.create({ data: { code: "DCR-" + stamp, name: "DR", type: StructureType.REGIONAL_DIRECTION, status: true } });
  const agency = await prisma.structure.create({ data: { code: "ABJ-" + stamp, name: "Agence", type: StructureType.AGENCY, parentId: regional.id, status: true } });

  const dept = await prisma.department.create({ data: { name: "Dept Logis " + stamp, code: "LOGIS-" + stamp, status: true, structureId: agency.id } });

  const employee = await prisma.user.create({ data: { email: "emp-" + stamp + "@test.local", firstName: "Emp", lastName: "Test", passwordHash, status: UserStatus.ACTIVE } });
  const director = await prisma.user.create({ data: { email: "dir-" + stamp + "@test.local", firstName: "Dir", lastName: "Test", passwordHash, status: UserStatus.ACTIVE } });
  const deptMgr = await prisma.user.create({ data: { email: "mgr-" + stamp + "@test.local", firstName: "Mgr", lastName: "Test", passwordHash, status: UserStatus.ACTIVE } });
  const delegate = await prisma.user.create({ data: { email: "del-" + stamp + "@test.local", firstName: "Del", lastName: "Test", passwordHash, status: UserStatus.ACTIVE } });

  await prisma.userStructureRole.create({ data: { userId: employee.id, structureId: agency.id, role: RoleType.EMPLOYEE } });
  await prisma.userStructureRole.create({ data: { userId: director.id, structureId: regional.id, role: RoleType.HIERARCHICAL_MANAGER } });
  await prisma.userStructureRole.create({ data: { userId: deptMgr.id, structureId: agency.id, role: RoleType.DEPARTMENT_MANAGER, scope: "LOGIS-" + stamp } });
  // department manager with null scope + structural attachment
  const deptStructure = await prisma.structure.create({ data: { code: "DEPT-" + stamp, name: "Dept Structure", type: StructureType.OTHER, parentId: regional.id, status: true } });
  // attach department to this structure instead? Department structureId already agency. For null scope test, create separate dept manager on department structure.
  const deptMgrNull = await prisma.user.create({ data: { email: "mgrnull-" + stamp + "@test.local", firstName: "MgrNull", lastName: "Test", passwordHash, status: UserStatus.ACTIVE } });
  await prisma.userStructureRole.create({ data: { userId: deptMgrNull.id, structureId: deptStructure.id, role: RoleType.DEPARTMENT_MANAGER, scope: null } });
  // make department structure match deptStructure by updating department structureId
  await prisma.department.update({ where: { id: dept.id }, data: { structureId: deptStructure.id } });

  // delegate with delegation from deptMgr
  await prisma.userStructureRole.create({ data: { userId: delegate.id, structureId: deptStructure.id, role: RoleType.DEPARTMENT_DELEGATE, scope: "LOGIS-" + stamp, delegatedFromUserId: deptMgr.id, startDate: new Date() } });

  const demande = await prisma.demande.create({ data: { reference: "DEM-LOTN1-" + stamp, title: "Demande test", description: "desc", status: DemandeStatus.BROUILLON, category: DemandeCategory.LOGISTIQUE, authorId: employee.id, departmentId: dept.id } });

  await submitDemande(demande.id, employee.id);
  const approved = await approveDemande(demande.id, director.id);
  console.log("APPROVED_STATUS", approved.status);

  // process outbox
  const batch = await reserveBatch();
  for (const row of batch) await processOne(row);

  const outbox = await prisma.notificationOutbox.findMany({ where: { demandeId: demande.id, type: "DEMANDE_EN_ATTENTE_ANALYSE" } });
  const notifications = await prisma.notification.findMany({ where: { demandeId: demande.id, type: "DEMANDE_EN_ATTENTE_ANALYSE" } });
  console.log("OUTBOX", outbox.map(o => ({ recipient: o.recipientUserId, status: o.status })));
  console.log("NOTIFICATIONS", notifications.map(n => n.userId));
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
