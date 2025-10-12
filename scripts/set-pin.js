// scripts/set-pin.js
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const prisma = new PrismaClient();

async function main() {
  const slug = process.argv[2] || "theriser";
  const pin  = process.argv[3] || "123456";

  const pub = await prisma.pub.findUnique({ where: { slug } });
  if (!pub) throw new Error(`Pub not found: ${slug}`);

  const hash = await bcrypt.hash(pin, 10);

  const res = await prisma.table.updateMany({
    where: { pubId: pub.id, active: true },
    data: { pinHash: hash },
  });

  console.log(`✅ Updated ${res.count} tables for pub "${slug}" with PIN ${pin}`);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
