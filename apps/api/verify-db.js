const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const result = await prisma.$queryRaw`
    SELECT current_database() AS database, current_user AS username
  `;
  console.log(result);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
