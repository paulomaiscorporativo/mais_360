-- CreateEnum
CREATE TYPE "DocumentKind" AS ENUM ('VOUCHER', 'BADGE', 'LABEL', 'CERTIFICATE', 'CONTRACT', 'ROOMING_LIST', 'OTHER');

-- CreateEnum
CREATE TYPE "RenderPurpose" AS ENUM ('PRINT', 'EMAIL', 'DOWNLOAD', 'PREVIEW');

-- CreateEnum
CREATE TYPE "RenderFormat" AS ENUM ('PDF', 'THERMAL_HTML');

-- CreateTable
CREATE TABLE "DocumentTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" TEXT,
    "kind" "DocumentKind" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "definition" JSONB NOT NULL,
    "backgroundFileId" TEXT,
    "visibleToPerson" BOOLEAN NOT NULL DEFAULT false,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "archivedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentRender" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" TEXT,
    "templateId" TEXT,
    "templateVersion" INTEGER NOT NULL DEFAULT 1,
    "purpose" "RenderPurpose" NOT NULL,
    "format" "RenderFormat" NOT NULL DEFAULT 'PDF',
    "pages" INTEGER NOT NULL DEFAULT 0,
    "recordCount" INTEGER NOT NULL DEFAULT 1,
    "registrationIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "actorType" "ActorType" NOT NULL DEFAULT 'USER',
    "actorLabel" TEXT NOT NULL DEFAULT '',
    "userId" TEXT,
    "kioskId" TEXT,
    "fileId" TEXT,
    "warnings" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentRender_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocumentTemplate_tenantId_projectId_kind_idx" ON "DocumentTemplate"("tenantId", "projectId", "kind");

-- CreateIndex
CREATE INDEX "DocumentRender_tenantId_projectId_createdAt_idx" ON "DocumentRender"("tenantId", "projectId", "createdAt");

-- CreateIndex
CREATE INDEX "DocumentRender_templateId_idx" ON "DocumentRender"("templateId");

-- AddForeignKey
ALTER TABLE "DocumentRender" ADD CONSTRAINT "DocumentRender_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "DocumentTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
