import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

const db = new PrismaClient();

async function main() {
  const pub = await db.pub.upsert({
    where: { slug: "theriser" },
    update: {},
    create: {
      slug: "theriser",
      name: "The Riser",
      contactEmail: "manager@theriser.local",
    },
  });

  const pinHash = await hash("123456", 10);

  await db.table.upsert({
    where: { id: "seed-table-1" },
    update: {},
    create: {
      id: "seed-table-1",
      pubId: pub.id,
      label: "Table 1",
      pinHash,
      active: true,
    },
  });

  console.log("✅  Seeded pub=theriser, table=Table 1, PIN = 123456");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
