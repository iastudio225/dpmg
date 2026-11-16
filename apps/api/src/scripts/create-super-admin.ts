import { PrismaClient, UserStatus, RoleType } from "@prisma/client";
import { hashPassword } from "../services/auth.service";
import crypto from "node:crypto";

const prisma = new PrismaClient();

function generatePassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*";
  const bytes = crypto.randomBytes(24);
  let out = "";
  for (let i = 0; i < 20; i++) out += chars[(bytes[i] ?? 0) % chars.length];
  return out;
}

async function main() {
  const email = (process.env["ADMIN_EMAIL"] ?? "").trim().toLowerCase();
  if (!email.includes("@")) {
    throw new Error("ADMIN_EMAIL requis (email valide)");
  }
  const firstName = process.env["ADMIN_FIRSTNAME"]?.trim() || "Super";
  const lastName = process.env["ADMIN_LASTNAME"]?.trim() || "Administrateur";

  const db = await prisma.$queryRawUnsafe<Array<{ current_database: string }>>("SELECT current_database()");
  if (!db[0] || db[0].current_database !== "dpmg") {
    throw new Error(`Refus : base courante ${db[0]?.current_database ?? "inconnue"}, attendu "dpmg"`);
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    const roles = await prisma.userStructureRole.findMany({ where: { userId: existing.id } });
    const hasSuper = roles.some((r) => r.role === RoleType.SUPER_ADMIN);
    const hasTech = roles.some((r) => r.role === RoleType.TECHNICAL_ADMIN);
    const toCreate: Array<{ role: RoleType }> = [];
    if (!hasSuper) toCreate.push({ role: RoleType.SUPER_ADMIN });
    if (!hasTech) toCreate.push({ role: RoleType.TECHNICAL_ADMIN });
    if (toCreate.length > 0) {
      await prisma.userStructureRole.createMany({
        data: toCreate.map((r) => ({
          userId: existing.id,
          role: r.role,
          structureId: null,
          scope: "*",
          startDate: new Date(),
        })),
      });
    }
    console.log("ACCOUNT_EXISTS");
    console.log("id=" + existing.id);
    console.log("email=" + existing.email);
    console.log("rolesAdded=" + toCreate.map((r) => r.role).join(","));
    return;
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
          { role: RoleType.SUPER_ADMIN, structureId: null, scope: "*", startDate: new Date() },
          { role: RoleType.TECHNICAL_ADMIN, structureId: null, scope: "*", startDate: new Date() },
        ],
      },
    },
  });

  console.log("ACCOUNT_CREATED");
  console.log("id=" + user.id);
  console.log("email=" + user.email);
  console.log("TEMP_PASSWORD=" + password);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
