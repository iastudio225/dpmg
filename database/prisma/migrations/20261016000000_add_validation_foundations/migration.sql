-- CreateEnum
CREATE TYPE "DemandeDecisionType" AS ENUM ('SOUMISSION', 'APPROBATION', 'REFUS', 'RETOUR', 'AVIS_DEPARTEMENTAL');

-- CreateTable
CREATE TABLE "DemandeDecision" (
    "id" TEXT NOT NULL,
    "demandeId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "type" "DemandeDecisionType" NOT NULL,
    "motif" TEXT,
    "commentaire" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DemandeDecision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DemandeDecision_demandeId_idx" ON "DemandeDecision"("demandeId");
CREATE INDEX "DemandeDecision_actorId_idx" ON "DemandeDecision"("actorId");
CREATE INDEX "DemandeDecision_type_idx" ON "DemandeDecision"("type");

-- AddForeignKey
ALTER TABLE "DemandeDecision" ADD CONSTRAINT "DemandeDecision_demandeId_fkey" FOREIGN KEY ("demandeId") REFERENCES "Demande"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemandeDecision" ADD CONSTRAINT "DemandeDecision_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddColumn
ALTER TABLE "Demande" ADD COLUMN "isUrgent" BOOLEAN NOT NULL DEFAULT false;

-- AddColumn
ALTER TABLE "UserStructureRole" ADD COLUMN "delegatedFromUserId" TEXT;

-- CreateIndex
CREATE INDEX "UserStructureRole_delegatedFromUserId_idx" ON "UserStructureRole"("delegatedFromUserId");

-- AddForeignKey
ALTER TABLE "UserStructureRole" ADD CONSTRAINT "UserStructureRole_delegatedFromUserId_fkey" FOREIGN KEY ("delegatedFromUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddValue
ALTER TYPE "DemandeStatus" ADD VALUE 'EN_ATTENTE_VALIDATION';
ALTER TYPE "DemandeStatus" ADD VALUE 'EN_ATTENTE_ANALYSE';
ALTER TYPE "DemandeStatus" ADD VALUE 'EN_ATTENTE_DECISION';
ALTER TYPE "DemandeStatus" ADD VALUE 'RETOURNEE';
ALTER TYPE "DemandeStatus" ADD VALUE 'REFUSEE';