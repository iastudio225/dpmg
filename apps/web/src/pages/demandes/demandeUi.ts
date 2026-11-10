import type { DemandeCategory, DemandeStatus } from "@dpmg/shared";

export const STATUS_LABELS: Record<DemandeStatus, string> = {
  BROUILLON: "Brouillon",
  EN_ATTENTE_VALIDATION: "En attente de validation",
  EN_ATTENTE_ANALYSE: "En attente d'analyse",
  EN_ATTENTE_DECISION: "En attente de décision",
  EN_ATTENTE_FINANCEMENT: "En attente de financement",
  EN_ATTENTE_EXECUTION: "En attente d'exécution",
  EN_ATTENTE_CONFIRMATION_SATISFACTION: "En attente de confirmation de satisfaction",
  CLOTUREE: "Clôturée",
  RETOURNEE: "Retournée",
  REFUSEE: "Refusée",
};

export const CATEGORY_LABELS: Record<DemandeCategory, string> = {
  INFRASTRUCTURE: "Infrastructures et moyens généraux",
  LOGISTIQUE: "Logistique, gestion sécuritaire et assurances",
  MAGASIN: "Magasin central",
};

export const CATEGORY_OPTIONS: { value: DemandeCategory; label: string }[] = (
  Object.keys(CATEGORY_LABELS) as DemandeCategory[]
).map((value) => ({ value, label: CATEGORY_LABELS[value] }));

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function firstFieldErrors(flattened: Record<string, string[] | undefined>): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const key of Object.keys(flattened)) {
    const first = flattened[key]?.[0];
    if (first !== undefined) {
      errors[key] = first;
    }
  }
  return errors;
}

export function firstFieldErrorsFromDetails(details: Record<string, unknown>): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const key of Object.keys(details)) {
    const value = details[key];
    if (Array.isArray(value)) {
      const first = value[0];
      if (typeof first === "string") {
        errors[key] = first;
      }
    }
  }
  return errors;
}
