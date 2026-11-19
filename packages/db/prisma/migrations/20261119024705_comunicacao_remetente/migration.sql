-- DropIndex
DROP INDEX "MessageDelivery_tenantId_channel_sentAt_idx";

-- AlterTable
ALTER TABLE "MessageDelivery" ADD COLUMN     "senderKey" TEXT NOT NULL DEFAULT '';

-- CreateIndex
CREATE INDEX "MessageDelivery_channel_senderKey_sentAt_idx" ON "MessageDelivery"("channel", "senderKey", "sentAt");
