import { PrismaClient, UserStatus, RoleType } from "@prisma/client";
import { hashPassword } from "../services/auth.service";
import crypto from "node:crypto";

const prisma = new PrismaClient();

function generatePassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*";
  const bytes = crypto.randomBytes(32);
  let password = "";
  for (let i = 0; i < 24; i++) {
    password += chars[bytes[i]! % chars.length];
  }
  return password;
}

async function main() {
  const db = await prisma.$queryRaw<Array<{ current_database: string }>>`
    SELECT current_database()
  `;

  if (db[0]?.current_database !== "dpmg_admin_test") {
    throw new Error("SECURITE : cette opération est autorisée uniquement sur dpmg_admin_test.");
  }

  const email = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  const firstName = (process.env.ADMIN_FIRSTNAME ?? "Super").trim();
  const lastName = (process.env.ADMIN_LASTNAME ?? "Administrateur").trim();

  if (!email || !email.includes("@")) {
    throw new Error("ADMIN_EMAIL doit contenir une adresse valide.");
  }

  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    throw new Error("Ce compte existe déjà. Aucun changement effectué.");
  }

  const password = generatePassword();
  const passwordHash = await hashPassword(password);

  const user = await prisma.user.create({
    data: {
      email,
      firstName,
      lastName,
      passwordHash,
      status: UserStatus.ACTIVE,
      mustChangePassword: true,
      structureRoles: {
        create: [
          {
            role: RoleType.SUPER_ADMIN,
            structureId: null,
            scope: "*",
          },
          {
            role: RoleType.TECHNICAL_ADMIN,
            structureId: null,
            scope: "*",
          },
        ],
      },
    },
  });

  console.log("SUPER_ADMIN_CREATED");
  console.log("EMAIL=" + user.email);
  console.log("TEMP_PASSWORD=" + password);
}

main()
  .catch((error) => {
    console.error("CREATION_FAILED:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
