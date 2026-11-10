import { PrismaClient, UserStatus, RoleType, StructureType } from "@prisma/client";
import { hashPassword } from "../services/auth.service";
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const prisma = new PrismaClient();

async function prompt(message: string, hidden = false): Promise<string> {
  const rl = readline.createInterface({ input, output });
  if (hidden) {
    const result = await rl.question(message);
    rl.close();
    return result;
  }
  const result = await rl.question(message);
  rl.close();
  return result;
}

async function main() {
  console.log("🔐 DPMG - Création du premier administrateur");
  console.log("==============================================\n");

  const existingAdmin = await prisma.user.findFirst({
    where: { structureRoles: { some: { role: RoleType.TECHNICAL_ADMIN } } },
  });

  if (existingAdmin) {
    console.log("❌ Un administrateur technique existe déjà.");
    console.log("   Pour créer un autre admin, utilisez l'interface d'administration après connexion.");
    process.exit(1);
  }

  const email = await prompt("📧 Email de l'administrateur: ");
  if (!email || !email.includes("@")) {
    console.log("❌ Email invalide");
    process.exit(1);
  }

  const existingUser = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (existingUser) {
    console.log("❌ Un utilisateur avec cet email existe déjà");
    process.exit(1);
  }

  const firstName = await prompt("👤 Prénom: ");
  const lastName = await prompt("👤 Nom: ");

  console.log("\n🔒 Mot de passe (minimum 12 caractères, sera masqué):");
  let password = "";
  while (password.length < 12) {
    password = await prompt("   Mot de passe: ", true);
    if (password.length < 12) {
      console.log("   ⚠️  Le mot de passe doit contenir au moins 12 caractères");
    }
  }

  const confirmPassword = await prompt("   Confirmer le mot de passe: ", true);
  if (password !== confirmPassword) {
    console.log("❌ Les mots de passe ne correspondent pas");
    process.exit(1);
  }

  console.log("\n🏢 Création de la structure racine (Direction DPMG)...");
  const structure = await prisma.structure.create({
    data: {
      code: "DPMG",
      name: "Direction de la Performance et de la Maîtrise des Gestions",
      type: StructureType.DIRECTION,
      status: true,
    },
  });

  console.log("🏢 Création des départements...");

  const dept1 = await prisma.department.create({
    data: {
      name: "Infrastructures et moyens généraux",
      code: "INFRA",
      description: "Gestion des infrastructures, bâtiments et moyens généraux",
    },
  });

  const dept2 = await prisma.department.create({
    data: {
      name: "Logistique, gestion sécuritaire et assurances",
      code: "LOGISTIQUE",
      description: "Logistique, sécurité, gestion des assurances et risques",
    },
  });

  const dept3 = await prisma.department.create({
    data: {
      name: "Magasin central",
      code: "MAGASIN",
      description: "Gestion du magasin central et des stocks",
    },
  });

  const infraStructure = await prisma.structure.create({
    data: {
      code: "INFRA",
      name: "Département Infrastructures et moyens généraux",
      type: StructureType.OTHER,
      status: true,
      parentId: structure.id,
      department: { connect: { id: dept1.id } },
    },
  });

  const logStructure = await prisma.structure.create({
    data: {
      code: "LOGISTIQUE",
      name: "Département Logistique, gestion sécuritaire et assurances",
      type: StructureType.OTHER,
      status: true,
      parentId: structure.id,
      department: { connect: { id: dept2.id } },
    },
  });

  const magasinStructure = await prisma.structure.create({
    data: {
      code: "MAGASIN",
      name: "Département Magasin central",
      type: StructureType.OTHER,
      status: true,
      parentId: structure.id,
      department: { connect: { id: dept3.id } },
    },
  });

  console.log("👤 Création de l'utilisateur administrateur...");
  const passwordHash = await hashPassword(password);

  const admin = await prisma.user.create({
    data: {
      email: email.toLowerCase(),
      firstName,
      lastName,
      passwordHash,
      status: UserStatus.ACTIVE,
      structureRoles: {
        create: [
          {
            role: RoleType.TECHNICAL_ADMIN,
            structureId: structure.id,
            scope: "*",
            startDate: new Date(),
          },
          {
            role: RoleType.DPMG_MANAGER,
            structureId: structure.id,
            scope: "*",
            startDate: new Date(),
          },
          {
            role: RoleType.DEPARTMENT_MANAGER,
            structureId: infraStructure.id,
            scope: "INFRA",
            startDate: new Date(),
          },
          {
            role: RoleType.DEPARTMENT_MANAGER,
            structureId: logStructure.id,
            scope: "LOGISTIQUE",
            startDate: new Date(),
          },
          {
            role: RoleType.DEPARTMENT_MANAGER,
            structureId: magasinStructure.id,
            scope: "MAGASIN",
            startDate: new Date(),
          },
        ],
      },
    },
  });

  console.log("\n✅ Administrateur créé avec succès !");
  console.log("==============================================");
  console.log(`📧 Email: ${admin.email}`);
  console.log(`👤 Nom: ${admin.firstName} ${admin.lastName}`);
  console.log(`🆔 ID: ${admin.id}`);
  console.log(`🏢 Structure racine: ${structure.name} (${structure.code})`);
  console.log(`🏢 Départements créés: ${dept1.name}, ${dept2.name}, ${dept3.name}`);
  console.log("\n🔐 Rôles attribués:");
  console.log("   - TECHNICAL_ADMIN (périmètre: *)");
  console.log("   - DPMG_MANAGER (périmètre: *)");
  console.log("   - DEPARTMENT_MANAGER (Infrastructures)");
  console.log("   - DEPARTMENT_MANAGER (Logistique)");
  console.log("   - DEPARTMENT_MANAGER (Magasin central)");
  console.log("\n🚀 Vous pouvez maintenant vous connecter sur http://localhost:5173");
}

main()
  .catch((e) => {
    console.error("❌ Erreur:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });