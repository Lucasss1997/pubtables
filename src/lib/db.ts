// src/app/api/admin/overview/route.ts
export const dynamic = "force-dynamic";

import { db } from "@/lib/db";
import { j } from "@/lib/resp";
import { requireAdmin } from "@/lib/admin";

// Then use db (Prisma) instead of pool
// Example: await db.user.findMany() instead of pool.query()