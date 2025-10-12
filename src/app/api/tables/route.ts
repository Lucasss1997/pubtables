import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const slug = searchParams.get("slug") || "";

  if (!slug) return NextResponse.json({ tables: [] });

  const pub = await prisma.pub.findUnique({ where: { slug } });
  if (!pub) return NextResponse.json({ tables: [] });

  const rows = await prisma.table.findMany({
    where: { pubId: pub.id, active: true },
    orderBy: { label: "asc" },
    select: { id: true, label: true },
  });

  return NextResponse.json({ tables: rows });
}
