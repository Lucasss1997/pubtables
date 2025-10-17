export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const { searchParams } = new URL(req.url);
    const slug = searchParams.get("slug") || undefined;
    if (!slug) return NextResponse.json({ error: "Missing slug" }, { status: 400 });

    const pub = await prisma.pub.findFirst({ where: { slug }, select: { id: true } });
    if (!pub) return NextResponse.json({ error: "Pub not found" }, { status: 404 });

    const existing = await prisma.booking.findFirst({
      where: { id: params.id, pubId: pub.id },
      select: { id: true },
    });
    if (!existing) return NextResponse.json({ error: "Booking not found" }, { status: 404 });

    await prisma.booking.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[/api/bookings/[id]] DELETE error:", err?.message);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
