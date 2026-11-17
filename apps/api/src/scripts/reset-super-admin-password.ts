import { PrismaClient, RoleType, UserStatus } from "@prisma/client";
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

  const db = await prisma.$queryRawUnsafe<Array<{ current_database: string }>>("SELECT current_database()");
  if (!db[0] || db[0].current_database !== "dpmg") {
    throw new Error(`Refus : base courante ${db[0]?.current_database ?? "inconnue"}, attendu "dpmg"`);
  }

  const user = await prisma.user.findUnique({
    where: { email },
    include: { structureRoles: true },
  });
  if (!user) throw new Error(`Utilisateur introuvable : ${email}`);

  const isSuperAdmin = user.structureRoles.some((r) => r.role === RoleType.SUPER_ADMIN);
  if (!isSuperAdmin) {
    throw new Error("Refus : ce compte n'a pas le rôle SUPER_ADMIN");
  }

  const password = generatePassword();
  const passwordHash = await hashPassword(password);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, mustChangePassword: true, status: UserStatus.ACTIVE },
    }),
    prisma.session.deleteMany({ where: { userId: user.id } }),
  ]);

  console.log("PASSWORD_RESET");
  console.log("id=" + user.id);
  console.log("email=" + user.email);
  console.log("TEMP_PASSWORD=" + password);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
