import { resetOperational } from "../services/database-admin.service";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function main() {
  const tech = await prisma.user.findFirst({ where: { email: "tech1@test.local" } });
  if (!tech) throw new Error("no tech");
  const p1 = resetOperational(tech.id, "TestAdmin!2026", "REINITIALISER").then(r=>({ok:true,r})).catch(e=>({ok:false,e:e.message,code:e.code}));
  // small delay to ensure first acquires lock
  await new Promise(res=>setTimeout(res,50));
  const p2 = resetOperational(tech.id, "TestAdmin!2026", "REINITIALISER").then(r=>({ok:true,r})).catch(e=>({ok:false,e:e.message,code:e.code}));
  const [a,b] = await Promise.all([p1,p2]);
  console.log("result1", JSON.stringify(a));
  console.log("result2", JSON.stringify(b));
}
main().catch(e=>{console.error(e);process.exit(1);}).finally(()=>prisma.$disconnect());
