-- Lot 9.7 : types de decision pour l'execution et la cloture.

ALTER TYPE "DemandeDecisionType" ADD VALUE 'DEMANDE_EXECUTION';
ALTER TYPE "DemandeDecisionType" ADD VALUE 'DEMANDE_EXECUTEE';
ALTER TYPE "DemandeDecisionType" ADD VALUE 'DEMANDE_CLOTUREE';
