-- Lot 6.1 : décision DPMG.
--
-- Le statut EN_ATTENTE_FINANCEMENT matérialise l'attente du contrôle financier DFC
-- qui suit l'approbation DPMG. Il est distinct de EN_ATTENTE_DECISION (décision DPMG
-- non prise) : une approbation DPMG ne signifie pas que les fonds sont disponibles.
--
-- Les types de décision DPMG sont distincts de APPROBATION / REFUS / RETOUR, déjà
-- utilisés par le circuit de validation hiérarchique, afin que les événements
-- restent distinguables dans l'historique d'une demande.
--
-- Stratégie additive (identique aux migrations 20261016000000_add_validation_foundations) :
-- PostgreSQL 17 n'accepte pas "ALTER TYPE ... DROP VALUE" dans une transaction, et
-- les valeurs existantes ne doivent pas être supprimées. Seules des ajouts sont effectués.

-- AddEnumValue
ALTER TYPE "DemandeStatus" ADD VALUE 'EN_ATTENTE_FINANCEMENT';

-- AddEnumValue
ALTER TYPE "DemandeDecisionType" ADD VALUE 'DECISION_DPMG_APPROBATION';

-- AddEnumValue
ALTER TYPE "DemandeDecisionType" ADD VALUE 'DECISION_DPMG_REFUS';

-- AddEnumValue
ALTER TYPE "DemandeDecisionType" ADD VALUE 'DECISION_DPMG_RETOUR';
