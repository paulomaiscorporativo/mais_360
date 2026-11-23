-- CreateEnum
CREATE TYPE "DomainStatus" AS ENUM ('PENDING', 'VERIFIED', 'FAILED');

-- AlterTable
ALTER TABLE "TenantDomain" ADD COLUMN     "lastCheckedAt" TIMESTAMP(3),
ADD COLUMN     "lastError" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "status" "DomainStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "verificationToken" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "verifiedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "TenantDomain_status_lastCheckedAt_idx" ON "TenantDomain"("status", "lastCheckedAt");

-- Domínios que já existiam estão em produção (QR codes impressos dependem
-- deles): entram como verificados. Recebem um token para que a reconferência
-- e uma eventual nova verificação funcionem como nos domínios novos.
UPDATE "TenantDomain"
SET "status" = 'VERIFIED',
    "verifiedAt" = "createdAt",
    "verificationToken" = md5(random()::text || "id" || clock_timestamp()::text);
