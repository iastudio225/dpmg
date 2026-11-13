import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function main() {
  const u = await prisma.user.findUnique({ where: { email: "eyemon.poupouya@laposte.ci" }, include: { structureRoles: true } });
  if (!u) { console.log("NOT_FOUND"); return; }
  console.log("id=" + u.id);
  console.log("email=" + u.email);
  console.log("firstName=" + u.firstName);
  console.log("lastName=" + u.lastName);
  console.log("status=" + u.status);
  console.log("mustChangePassword=" + u.mustChangePassword);
  for (const r of u.structureRoles) {
    console.log("role=" + r.role + " structureId=" + r.structureId + " scope=" + r.scope);
  }
}
main().finally(() => prisma.$disconnect());
