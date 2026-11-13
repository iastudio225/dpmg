import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../services/auth.service";
const prisma = new PrismaClient();
async function main() {
  const email = process.argv[2];
  const pw = process.argv[3] || "TempPassword123!";
  const mcp = process.argv[4] === "true";
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) { console.log("not found"); return; }
  const hash = await hashPassword(pw);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: hash, mustChangePassword: mcp } });
  console.log("reset", email, "mustChangePassword=", mcp);
}
main().finally(()=>prisma.$disconnect());
