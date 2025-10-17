import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

/**
 * Returns true when either:
 * - hostAuth not configured for pub (your previous ALLOW_IF_NO_AUTH behavior), or
 * - provided pin matches plain pin or hashed pin
 */
export async function verifyHostPin(pubId: string, pin: string): Promise<boolean> {
  try {
    const auth = await (prisma as any).hostAuth?.findFirst?.({
      where: { pubId },
      select: { pin: true, pinHash: true },
    });

    if (!auth) return true;
    if (!/^\d{6}$/.test(pin || "")) return false;

    if (auth.pinHash) return bcrypt.compare(pin, auth.pinHash);
    if (auth.pin) return auth.pin === pin;
    return true;
  } catch {
    // Keep previous permissive fallback
    return true;
  }
}
