import { PrismaClient, RoleType, UserStatus, StructureType, DemandeStatus, DemandeCategory } from "@prisma/client";
import { hashPassword } from "../services/auth.service";

const prisma = new PrismaClient();

async function main() {
  const db = await prisma.$queryRawUnsafe<Array<{ current_database: string }>>("SELECT current_database()");
  const name = db[0]?.current_database;
  if (name !== "dpmg_admin_test") {
    throw new Error(`Refusing to seed: current database is ${name}, expected dpmg_admin_test`);
  }

  const existing = await prisma.user.count();
  if (existing > 0) {
    throw new Error("Refusing to seed: database already contains users");
  }

  const passwordHash = await hashPassword("TestAdmin!2026");

  const structure = await prisma.structure.create({
    data: { code: "DPMG-TEST", name: "Structure DPMG Test", type: StructureType.DIRECTION, status: true },
  });
  const child1 = await prisma.structure.create({
    data: { code: "CHILD-1", name: "Structure Enfant 1", type: StructureType.AGENCY, parentId: structure.id, status: true },
  });
  const child2 = await prisma.structure.create({
    data: { code: "CHILD-2", name: "Structure Enfant 2", type: StructureType.AGENCY, parentId: structure.id, status: true },
  });

  const dept = await prisma.department.create({
    data: { name: "Département Test", code: "DEPT-TEST", description: "Dept test", status: true, structureId: structure.id },
  });

  const tech1 = await prisma.user.create({
    data: { email: "tech1@test.local", firstName: "Tech", lastName: "One", passwordHash, status: UserStatus.ACTIVE },
  });
  const tech2 = await prisma.user.create({
    data: { email: "tech2@test.local", firstName: "Tech", lastName: "Two", passwordHash, status: UserStatus.ACTIVE },
  });
  const tech3 = await prisma.user.create({
    data: { email: "tech3@test.local", firstName: "Tech", lastName: "Three", passwordHash, status: UserStatus.DISABLED },
  });
  const manager = await prisma.user.create({
    data: { email: "manager@test.local", firstName: "Manager", lastName: "Test", passwordHash, status: UserStatus.ACTIVE },
  });
  const employee = await prisma.user.create({
    data: { email: "employee@test.local", firstName: "Employee", lastName: "Test", passwordHash, status: UserStatus.ACTIVE },
  });

  await prisma.userStructureRole.createMany({
    data: [
      { userId: tech1.id, structureId: null, role: RoleType.TECHNICAL_ADMIN },
      { userId: tech2.id, structureId: null, role: RoleType.TECHNICAL_ADMIN },
      { userId: tech3.id, structureId: null, role: RoleType.TECHNICAL_ADMIN },
      { userId: manager.id, structureId: structure.id, role: RoleType.DPMG_MANAGER },
      { userId: employee.id, structureId: structure.id, role: RoleType.EMPLOYEE },
      // structure-scoped role for tech1 to test removal
      { userId: tech1.id, structureId: child1.id, role: RoleType.DEPARTMENT_MANAGER },
    ],
  });

  const demande = await prisma.demande.create({
    data: {
      reference: "DEM-TEST-001",
      title: "Demande test",
      description: "Description",
      status: DemandeStatus.BROUILLON,
      category: DemandeCategory.INFRASTRUCTURE,
      authorId: employee.id,
      departmentId: dept.id,
    },
  });

  await prisma.demandeDecision.create({
    data: { demandeId: demande.id, actorId: manager.id, type: "SOUMISSION", commentaire: "test" },
  });

  const consolidation = await prisma.consolidation.create({
    data: { reference: "CONS-TEST-001", periodStart: new Date(), periodEnd: new Date(), createdById: manager.id },
  });

  await prisma.consolidationObservation.create({
    data: { consolidationId: consolidation.id, actorId: manager.id, role: RoleType.DPMG_MANAGER, commentaire: "obs" },
  });

  await prisma.notification.create({
    data: { userId: employee.id, eventKey: "evt-1", type: "DEMANDE_SOUMISE", title: "notif", priority: "NORMAL" },
  });

  await prisma.notificationOutbox.create({
    data: { eventKey: "evt-2", recipientUserId: employee.id, type: "DEMANDE_SOUMISE", title: "outbox", priority: "NORMAL" },
  });

  await prisma.session.create({
    data: { userId: employee.id, token: "token-test", expiresAt: new Date(Date.now() + 3600000) },
  });

  await prisma.adminAuditLog.create({
    data: { actorId: tech1.id, action: "SEED_TEST", targetType: "Database", targetId: "seed" },
  });

  console.log("Seed completed");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
