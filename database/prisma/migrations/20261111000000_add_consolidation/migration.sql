-- CreateEnum
CREATE TYPE "ConsolidationStatus" AS ENUM ('BROUILLON', 'TRANSMISE');

-- CreateTable
CREATE TABLE "Consolidation" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" "ConsolidationStatus" NOT NULL DEFAULT 'BROUILLON',
    "createdById" TEXT NOT NULL,
    "transmittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Consolidation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Consolidation_reference_key" ON "Consolidation"("reference");
CREATE INDEX "Consolidation_periodStart_periodEnd_idx" ON "Consolidation"("periodStart", "periodEnd");
CREATE INDEX "Consolidation_status_idx" ON "Consolidation"("status");
CREATE INDEX "Consolidation_createdById_idx" ON "Consolidation"("createdById");

-- AlterTable (Demande)
ALTER TABLE "Demande" ADD COLUMN "consolidationId" TEXT;

CREATE INDEX "Demande_consolidationId_idx" ON "Demande"("consolidationId");

-- AddForeignKey
ALTER TABLE "Consolidation" ADD CONSTRAINT "Consolidation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Demande" ADD CONSTRAINT "Demande_consolidationId_fkey" FOREIGN KEY ("consolidationId") REFERENCES "Consolidation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
