-- Additif : colonne de statut des départements (désactivation sans suppression physique).
-- Valeur par défaut true : les départements existants restent actifs.
ALTER TABLE "Department" ADD COLUMN "status" BOOLEAN NOT NULL DEFAULT true;
