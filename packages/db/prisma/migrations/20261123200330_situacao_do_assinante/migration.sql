-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "statusChangedAt" TIMESTAMP(3),
ADD COLUMN     "statusReason" TEXT NOT NULL DEFAULT '';
