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
  const db = await prisma.$queryRawUnsafe<Array<{ current_database: string }>>("SELECT current_database()");
  if (!db[0] || db[0].current_database !== "dpmg") {
    throw new Error(`Refusing: current database is ${db[0]?.current_database ?? "unknown"}, expected dpmg`);
  }

  const email = "eyemon.poupouya@laposte.ci";
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    const roles = await prisma.userStructureRole.findMany({ where: { userId: existing.id } });
    console.log("ACCOUNT_EXISTS");
    console.log("id=" + existing.id);
    console.log("email=" + existing.email);
    console.log("status=" + existing.status);
    console.log("mustChangePassword=" + existing.mustChangePassword);
    console.log("roles=" + JSON.stringify(roles.map(r => ({ role: r.role, structureId: r.structureId, scope: r.scope }))));
    process.exit(0);
  }

  const password = generatePassword();
  const passwordHash = await hashPassword(password);

  const user = await prisma.user.create({
    data: {
      email,
      firstName: "Administrateur",
      lastName: "DPMG",
      passwordHash,
      status: UserStatus.ACTIVE,
      mustChangePassword: true,
      structureRoles: {
        create: [
          { role: RoleType.TECHNICAL_ADMIN, structureId: null, scope: "*" },
          { role: RoleType.DPMG_MANAGER, structureId: null, scope: "*" },
        ],
      },
    },
  });

  console.log("ACCOUNT_CREATED");
  console.log("id=" + user.id);
  console.log("email=" + user.email);
  console.log("status=" + user.status);
  console.log("mustChangePassword=" + user.mustChangePassword);
  console.log("TEMP_PASSWORD=" + password);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
