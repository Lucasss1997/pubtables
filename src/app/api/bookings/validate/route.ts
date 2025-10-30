// app/api/bookings/validate/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("session");

  if (!sessionId) {
  return NextResponse.json({ error: "Missing session ID" }, { status: 400 });
  }

  try {
    const booking = await prisma.booking.findFirst({
      where: {
        qrCode: {
          contains: sessionId,
        },
      },
      include: {
        table: true,
        session: true,
      },
    });

    if (!booking) {
      return NextResponse.json({ error: "Invalid booking" }, { status: 404 });
    }

    // Time window: 15 mins early, 30 mins late
    const now = new Date();
    const startWindow = new Date(booking.startAt);
    startWindow.setMinutes(startWindow.getMinutes() - 15);
    const endWindow = new Date(booking.endAt);
    endWindow.setMinutes(endWindow.getMinutes() + 30);

    if (now < startWindow || now > endWindow) {
      return NextResponse.json(
        { error: "Booking time expired or not started" },
        { status: 400 }
      );
    }

    if (!booking.depositPaid) {
      return NextResponse.json(
        { error: "Deposit not paid" },
        { status: 402 }
      );
    }

    return NextResponse.json({
      booking,
      table: booking.table,
      session: booking.session,
    });
  } catch (error) {
    console.error("Validate booking error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}