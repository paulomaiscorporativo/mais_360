-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AutomationTrigger" ADD VALUE 'FLIGHT_DEPARTURE_BEFORE';
ALTER TYPE "AutomationTrigger" ADD VALUE 'PASSPORT_EXPIRING';
ALTER TYPE "AutomationTrigger" ADD VALUE 'DOCUMENTS_PENDING';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TemplatePurpose" ADD VALUE 'FLIGHT_REMINDER';
ALTER TYPE "TemplatePurpose" ADD VALUE 'TRAVEL_DOCUMENTS';

-- AlterTable
ALTER TABLE "MessageAutomation" ADD COLUMN     "activatedAt" TIMESTAMP(3),
ADD COLUMN     "maxSends" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "offsetHours" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "repeatEveryDays" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "MessageDelivery" ADD COLUMN     "automationId" TEXT;

-- CreateIndex
CREATE INDEX "MessageDelivery_automationId_status_idx" ON "MessageDelivery"("automationId", "status");

-- Réguas que já existiam nunca dispararam: passam a valer a partir de agora,
-- sem envio retroativo do que já passou (política anti-avalanche).
UPDATE "MessageAutomation" SET "activatedAt" = now() WHERE active = true;
