-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "DemandeStatus" ADD VALUE 'EN_ATTENTE_CONFIRMATION_SATISFACTION';
ALTER TYPE "DemandeStatus" ADD VALUE 'CLOTUREE';

-- AlterTable
ALTER TABLE "Demande" ADD COLUMN     "closedAt" TIMESTAMP(3),
ADD COLUMN     "closedBy" TEXT,
ADD COLUMN     "closureReturnReason" TEXT,
ADD COLUMN     "executionStartedAt" TIMESTAMP(3),
ADD COLUMN     "executionStartedBy" TEXT,
ADD COLUMN     "satisfactionObservations" TEXT,
ADD COLUMN     "satisfactionProofUrl" TEXT,
ADD COLUMN     "satisfiedAt" TIMESTAMP(3),
ADD COLUMN     "satisfiedBy" TEXT;

-- AddForeignKey
ALTER TABLE "Demande" ADD CONSTRAINT "Demande_executionStartedBy_fkey" FOREIGN KEY ("executionStartedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Demande" ADD CONSTRAINT "Demande_satisfiedBy_fkey" FOREIGN KEY ("satisfiedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Demande" ADD CONSTRAINT "Demande_closedBy_fkey" FOREIGN KEY ("closedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
