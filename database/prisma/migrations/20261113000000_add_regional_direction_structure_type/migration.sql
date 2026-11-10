-- AlterEnum
ALTER TYPE "StructureType" ADD VALUE 'REGIONAL_DIRECTION';

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Structure_parentId_idx" ON "Structure"("parentId");
