import { PrismaClient, UserStatus, RoleType, StructureType, DemandeStatus, DemandeCategory } from "@prisma/client";
import { hashPassword } from "../services/auth.service";

const prisma = new PrismaClient();

const DEMO_USERS = [
  {
    email: "admin@dpmg.local",
    firstName: "Admin",
    lastName: "DPMG",
    password: "DemoAdmin2024!",
    roles: [
      { role: RoleType.TECHNICAL_ADMIN, scope: "*" },
      { role: RoleType.DPMG_MANAGER, scope: "*" },
    ],
  },
  {
    email: "responsable.infra@dpmg.local",
    firstName: "Marie",
    lastName: "Dubois",
    password: "DemoInfra2024!",
    roles: [
      { role: RoleType.DEPARTMENT_MANAGER, scope: "INFRA" },
      { role: RoleType.HIERARCHICAL_MANAGER, scope: "INFRA" },
    ],
  },
  {
    email: "responsable.logistique@dpmg.local",
    firstName: "Pierre",
    lastName: "Martin",
    password: "DemoLogistique2024!",
    roles: [
      { role: RoleType.DEPARTMENT_MANAGER, scope: "LOGISTIQUE" },
      { role: RoleType.HIERARCHICAL_MANAGER, scope: "LOGISTIQUE" },
    ],
  },
  {
    email: "responsable.magasin@dpmg.local",
    firstName: "Sophie",
    lastName: "Bernard",
    password: "DemoMagasin2024!",
    roles: [
      { role: RoleType.DEPARTMENT_MANAGER, scope: "MAGASIN" },
      { role: RoleType.HIERARCHICAL_MANAGER, scope: "MAGASIN" },
    ],
  },
  {
    email: "employe.infra@dpmg.local",
    firstName: "Lucas",
    lastName: "Petit",
    password: "DemoEmploye2024!",
    roles: [
      { role: RoleType.EMPLOYEE, scope: "INFRA" },
    ],
  },
  {
    email: "directeur@dpmg.local",
    firstName: "Directeur",
    lastName: "DPMG",
    password: "DemoDirecteur2024!",
    roles: [
      { role: RoleType.HIERARCHICAL_MANAGER, scope: "*" },
    ],
  },
  {
    email: "controleur.dfc@dpmg.local",
    firstName: "Julie",
    lastName: "Moreau",
    password: "DemoDFC2024!",
    roles: [
      { role: RoleType.DFC_CONTROLLER, scope: "*" },
    ],
  },
];

const DEMO_STRUCTURES = [
  { code: "DPMG", name: "Direction de la Performance et de la Maîtrise des Gestions", type: StructureType.DIRECTION },
  { code: "INFRA", name: "Département Infrastructures et moyens généraux", type: StructureType.OTHER },
  { code: "LOGISTIQUE", name: "Département Logistique, gestion sécuritaire et assurances", type: StructureType.OTHER },
  { code: "MAGASIN", name: "Département Magasin central", type: StructureType.OTHER },
];

const DEMO_DEPARTMENTS = [
  { name: "Infrastructures et moyens généraux", code: "INFRA", description: "Gestion des infrastructures, bâtiments et moyens généraux" },
  { name: "Logistique, gestion sécuritaire et assurances", code: "LOGISTIQUE", description: "Logistique, sécurité, gestion des assurances et risques" },
  { name: "Magasin central", code: "MAGASIN", description: "Gestion du magasin central et des stocks" },
];

// Données de démonstration : titres préfixés [DEMO] et références fixes pour rester identifiables et idempotents.
const DEMO_DEMANDES: Array<{
  reference: string;
  title: string;
  description: string;
  category: DemandeCategory;
  departmentCode: string;
  authorEmail: string;
  status: DemandeStatus;
}> = [
  {
    reference: "DEM-2026-DEMO1",
    title: "[DEMO] Achat de 5 postes de travail",
    description: "[DEMO] Besoin de 5 postes de travail pour les nouveaux agents du service infrastructures.",
    category: DemandeCategory.INFRASTRUCTURE,
    departmentCode: "INFRA",
    authorEmail: "employe.infra@dpmg.local",
    status: DemandeStatus.BROUILLON,
  },
  {
    reference: "DEM-2026-DEMO2",
    title: "[DEMO] Réfection de la toiture du bâtiment A",
    description: "[DEMO] Réfection de la toiture du bâtiment A suite aux infiltrations constatées.",
    category: DemandeCategory.INFRASTRUCTURE,
    departmentCode: "INFRA",
    authorEmail: "employe.infra@dpmg.local",
    status: DemandeStatus.EN_ATTENTE_VALIDATION,
  },
  {
    reference: "DEM-2026-DEMO3",
    title: "[DEMO] Réapprovisionnement en fournitures de bureau",
    description: "[DEMO] Réapprovisionnement trimestriel en fournitures de bureau pour le département logistique.",
    category: DemandeCategory.LOGISTIQUE,
    departmentCode: "LOGISTIQUE",
    authorEmail: "responsable.logistique@dpmg.local",
    status: DemandeStatus.EN_ATTENTE_VALIDATION,
  },
];

async function upsertStructure(data: typeof DEMO_STRUCTURES[0], parentId?: string) {
  return prisma.structure.upsert({
    where: { code: data.code },
    update: { name: data.name, type: data.type, parentId, status: true },
    create: { ...data, parentId, status: true },
  });
}

async function upsertDepartment(data: typeof DEMO_DEPARTMENTS[0], structureId: string) {
  return prisma.department.upsert({
    where: { code: data.code },
    update: { name: data.name, description: data.description, structureId },
    create: { ...data, structureId },
  });
}

async function upsertUser(data: typeof DEMO_USERS[0], structureMap: Map<string, string>) {
  const passwordHash = await hashPassword(data.password);

  const user = await prisma.user.upsert({
    where: { email: data.email },
    update: { firstName: data.firstName, lastName: data.lastName, passwordHash, status: UserStatus.ACTIVE },
    create: { email: data.email, firstName: data.firstName, lastName: data.lastName, passwordHash, status: UserStatus.ACTIVE },
  });

  for (const roleData of data.roles) {
    const structureCode = roleData.scope === "*" ? "DPMG" : roleData.scope;
    const structureId = structureMap.get(structureCode);
    if (!structureId) {
      console.warn(`  ⚠️ Structure ${structureCode} non trouvée pour le rôle ${roleData.role} de ${data.email}`);
      continue;
    }

    await prisma.userStructureRole.upsert({
      where: {
        userId_structureId_role: {
          userId: user.id,
          structureId,
          role: roleData.role,
        },
      },
      update: { scope: roleData.scope, startDate: new Date(), endDate: null },
      create: {
        userId: user.id,
        structureId,
        role: roleData.role,
        scope: roleData.scope,
        startDate: new Date(),
      },
    });
  }

  return user;
}

async function upsertDemande(
  data: (typeof DEMO_DEMANDES)[number],
  departmentId: string,
  authorId: string
) {
  return prisma.demande.upsert({
    where: { reference: data.reference },
    update: {
      title: data.title,
      description: data.description,
      category: data.category,
      departmentId,
      authorId,
    },
    create: {
      reference: data.reference,
      title: data.title,
      description: data.description,
      category: data.category,
      departmentId,
      authorId,
      status: data.status,
      submittedAt: data.status === DemandeStatus.EN_ATTENTE_VALIDATION ? new Date() : null,
    },
  });
}

async function main() {
  console.log("🌱 DPMG - Seed de données de démonstration");
  console.log("==========================================\n");

  console.log("🏢 Création/Mise à jour des structures...");
  const structureMap = new Map<string, string>();

  const dpmgStructure = await upsertStructure(DEMO_STRUCTURES[0]!);
  structureMap.set("DPMG", dpmgStructure.id);
  console.log(`  ✅ ${dpmgStructure.name} (${dpmgStructure.code})`);

  const infraStructure = await upsertStructure(DEMO_STRUCTURES[1]!, dpmgStructure.id);
  structureMap.set("INFRA", infraStructure.id);
  console.log(`  ✅ ${infraStructure.name} (${infraStructure.code})`);

  const logStructure = await upsertStructure(DEMO_STRUCTURES[2]!, dpmgStructure.id);
  structureMap.set("LOGISTIQUE", logStructure.id);
  console.log(`  ✅ ${logStructure.name} (${logStructure.code})`);

  const magasinStructure = await upsertStructure(DEMO_STRUCTURES[3]!, dpmgStructure.id);
  structureMap.set("MAGASIN", magasinStructure.id);
  console.log(`  ✅ ${magasinStructure.name} (${magasinStructure.code})`);

  // Sécurité: les clés sont garanties d'exister
  const infraId = structureMap.get("INFRA")!;
  const logId = structureMap.get("LOGISTIQUE")!;
  const magasinId = structureMap.get("MAGASIN")!;

  console.log("\n🏢 Création/Mise à jour des départements...");
  for (const dept of DEMO_DEPARTMENTS) {
    let structureId: string;
    if (dept.code === "INFRA") structureId = infraId;
    else if (dept.code === "LOGISTIQUE") structureId = logId;
    else if (dept.code === "MAGASIN") structureId = magasinId;
    else continue;

    await upsertDepartment(dept, structureId);
    console.log(`  ✅ ${dept.name} (${dept.code})`);
  }

  console.log("\n👤 Création/Mise à jour des utilisateurs de démonstration...");
  for (const userData of DEMO_USERS) {
    const user = await upsertUser(userData, structureMap);
    const roleNames = userData.roles.map(r => r.role).join(", ");
    console.log(`  ✅ ${user.email} (${user.firstName} ${user.lastName}) — Rôles: ${roleNames}`);
  }

  console.log("\n📋 Création/Mise à jour des demandes de démonstration...");
  for (const demandeData of DEMO_DEMANDES) {
    const department = await prisma.department.findUnique({ where: { code: demandeData.departmentCode } });
    const author = await prisma.user.findUnique({ where: { email: demandeData.authorEmail } });
    if (!department || !author) {
      console.warn(`  ⚠️ Demande ${demandeData.reference} ignorée (département ou auteur manquant)`);
      continue;
    }
    const demande = await upsertDemande(demandeData, department.id, author.id);
    console.log(`  ✅ ${demande.reference} — ${demande.title} (${demande.status})`);
  }

  console.log("\n✅ Seed de démonstration terminé avec succès !");
  console.log("==========================================");
  console.log("Comptes de démonstration créés (mot de passe affiché ci-dessus) :");
  for (const u of DEMO_USERS) {
    console.log(`  📧 ${u.email} / 🔑 ${u.password}`);
  }
  console.log("\n⚠️  Ces comptes sont destinés à la DEMO/DEV uniquement.");
  console.log("   Ne les utilisez JAMAIS en production.");
}

main()
  .catch((e) => {
    console.error("❌ Erreur:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });