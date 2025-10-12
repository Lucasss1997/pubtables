-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('ACTIVE', 'ARRIVED', 'NO_SHOW', 'CANCELLED');

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "arrivedAt" TIMESTAMP(3),
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "noShowAt" TIMESTAMP(3),
ADD COLUMN     "status" "BookingStatus" NOT NULL DEFAULT 'ACTIVE';

-- CreateIndex
CREATE INDEX "Booking_pubId_tableId_startAt_idx" ON "Booking"("pubId", "tableId", "startAt");

-- CreateIndex
CREATE INDEX "Booking_pubId_tableId_endAt_idx" ON "Booking"("pubId", "tableId", "endAt");
