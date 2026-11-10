-- At this point, all SOUMISE values have been converted to EN_ATTENTE_VALIDATION.
-- Recreate the enum type to remove SOUMISE and any leftover probe values, keeping only the 6 statuses.

CREATE TYPE "DemandeStatus_new" AS ENUM ('BROUILLON', 'EN_ATTENTE_VALIDATION', 'EN_ATTENTE_ANALYSE', 'EN_ATTENTE_DECISION', 'RETOURNEE', 'REFUSEE');

ALTER TABLE "Demande" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Demande" ALTER COLUMN "status" TYPE "DemandeStatus_new" USING ("status"::text::"DemandeStatus_new");
ALTER TABLE "Demande" ALTER COLUMN "status" SET DEFAULT 'BROUILLON'::"DemandeStatus_new";

DROP TYPE "DemandeStatus";
ALTER TYPE "DemandeStatus_new" RENAME TO "DemandeStatus";