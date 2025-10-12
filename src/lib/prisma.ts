import { PrismaClient } from "@prisma/client";

type GlobalWithPrisma = typeof globalThis & { prisma?: PrismaClient };
const g = globalThis as GlobalWithPrisma;

export const prisma: PrismaClient = g.prisma || new PrismaClient();

if (process.env.NODE_ENV !== "production") g.prisma = prisma;

export default prisma;
