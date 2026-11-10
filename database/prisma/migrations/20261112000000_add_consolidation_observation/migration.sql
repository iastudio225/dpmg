CREATE TABLE "ConsolidationObservation" (
    "id" TEXT NOT NULL,
    "consolidationId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "role" "RoleType" NOT NULL,
    "commentaire" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsolidationObservation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ConsolidationObservation_consolidationId_createdAt_idx" ON "ConsolidationObservation"("consolidationId", "createdAt");
CREATE INDEX "ConsolidationObservation_actorId_idx" ON "ConsolidationObservation"("actorId");
CREATE INDEX "ConsolidationObservation_role_idx" ON "ConsolidationObservation"("role");

ALTER TABLE "ConsolidationObservation" ADD CONSTRAINT "ConsolidationObservation_consolidationId_fkey" FOREIGN KEY ("consolidationId") REFERENCES "Consolidation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConsolidationObservation" ADD CONSTRAINT "ConsolidationObservation_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
