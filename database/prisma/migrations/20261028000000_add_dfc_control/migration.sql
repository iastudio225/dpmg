-- Lot 6.2 : controle de financement DFC.
--
-- Ajout du statut EN_ATTENTE_EXECUTION : etape atteinte lorsqu'un controle DFC
-- conclut a la disponibilite des fonds. Distinct de EN_ATTENTE_FINANCEMENT
-- (fonds non encore confirmes) et de EN_ATTENTE_DECISION (decision DPMG non prise).
--
-- Ajout de deux types de decision DFC pour tracer explicitement les deux
-- resultats possibles du controle, sans ambiguite sur l'effet sur le statut.
--
-- Strategie additive (identique aux migrations precedentes) : PostgreSQL 17 n'accepte
-- pas "ALTER TYPE ... DROP VALUE" dans une transaction ; seules des ajouts.

-- AddEnumValue
ALTER TYPE "DemandeStatus" ADD VALUE 'EN_ATTENTE_EXECUTION';

-- AddEnumValue
ALTER TYPE "DemandeDecisionType" ADD VALUE 'DECISION_DFC_DISPONIBLE';

-- AddEnumValue
ALTER TYPE "DemandeDecisionType" ADD VALUE 'DECISION_DFC_INDISPONIBLE';