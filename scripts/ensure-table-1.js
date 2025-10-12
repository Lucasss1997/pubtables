// scripts/ensure-table-1.js
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const prisma = new PrismaClient();

async function main() {
  const slug = "theriser";
  const pin  = "123456";

  // Ensure the pub exists
  const pub = await prisma.pub.upsert({
    where: { slug },
    update: {},
    create: { slug, name: "The Riser" },
  });

  // Ensure a "Table 1" row exists (may already be id 'seed-table-1')
  let t1 = await prisma.table.findFirst({
    where: { pubId: pub.id, label: "Table 1" },
  });

  if (!t1) {
    const pinHash = await bcrypt.hash(pin, 10);
    t1 = await prisma.table.create({
      data: { pubId: pub.id, label: "Table 1", pinHash, active: true },
    });
    console.log("✅ Created Table 1:", t1.id);
  } else {
    console.log("ℹ️ Table 1 already exists:", t1.id);
  }

  // Ensure the PIN is set on ALL active tables for this pub
  const hash = await bcrypt.hash(pin, 10);
  const res = await prisma.table.updateMany({
    where: { pubId: pub.id, active: true },
    data: { pinHash: hash },
  });
  console.log(`🔐 Updated PIN for ${res.count} tables in pub "${slug}"`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
