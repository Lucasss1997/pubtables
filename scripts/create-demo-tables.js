const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const prisma = new PrismaClient();

async function main() {
  const slug = "theriser";
  const pin  = "123456";

  const pub = await prisma.pub.findUnique({ where: { slug } });
  if (!pub) throw new Error(`Pub not found: ${slug}`);

  const old = await prisma.table.findFirst({ where: { id: "seed-table-1", pubId: pub.id } });
  if (!old) {
    console.log("No seed-table-1 found; nothing to migrate.");
    return;
  }

  // create replacement "Table 1"
  const hash = await bcrypt.hash(pin, 10);
  const t1 = await prisma.table.create({
    data: { pubId: pub.id, label: "Table 1", pinHash: hash, active: true },
  });

  // move references
  const s = await prisma.session.updateMany({ where: { pubId: pub.id, tableId: old.id }, data: { tableId: t1.id } });
  const b = await prisma.booking.updateMany({ where: { pubId: pub.id, tableId: old.id }, data: { tableId: t1.id } });
  console.log(`Moved ${s.count} sessions and ${b.count} bookings -> ${t1.id}`);

  // delete old seed row
  await prisma.table.delete({ where: { id: old.id } });
  console.log("Deleted seed-table-1");
}

main().catch(e => { console.error(e); process.exit(1); })
      .finally(async () => { await prisma.$disconnect(); });
