// app/api/bookings/create-test/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const booking = await prisma.booking.create({
      data: {
        pubId: "pub1", // Change if your pub has different ID
        tableId: "table1", // Change to real table ID
        startAt: new Date(),
        endAt: new Date(Date.now() + 60 * 60 * 1000), // +1 hour
        partyName: "Test User",
        qrCode: "http://localhost:3000/p/table1/host?session=test123",
        depositPaid: true,
        status: "CONFIRMED",
      },
    });

    return NextResponse.json({ success: true, booking });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}