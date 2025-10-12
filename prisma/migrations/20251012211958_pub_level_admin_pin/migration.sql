-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('OWNER', 'MANAGER', 'STAFF');

-- AlterTable
ALTER TABLE "Pub" ADD COLUMN     "adminPinHash" TEXT;

-- CreateTable
CREATE TABLE "Admin" (
    "id" TEXT NOT NULL,
    "pubId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "role" "AdminRole" NOT NULL DEFAULT 'STAFF',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Admin_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Admin_email_key" ON "Admin"("email");

-- CreateIndex
CREATE INDEX "Admin_pubId_idx" ON "Admin"("pubId");

-- AddForeignKey
ALTER TABLE "Admin" ADD CONSTRAINT "Admin_pubId_fkey" FOREIGN KEY ("pubId") REFERENCES "Pub"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
