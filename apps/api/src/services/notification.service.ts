import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import { NotificationType, NotificationPriority, RoleType, UserStatus } from "@prisma/client";
import { resolveValidatorForDemande } from "./validation.service";
import { resolveReferenceStructureId } from "./demande.service";

type Tx = Prisma.TransactionClient;

export type NotificationEventType =
  | "DEMANDE_SOUMISE"
  | "DEMANDE_VALIDEE"
  | "DEMANDE_REFUSEE"
  | "DEMANDE_RETOURNEE"
  | "AVIS_DEPARTEMENTAL"
  | "DECISION_DPMG_APPROBATION"
  | "DECISION_DPMG_REFUS"
  | "DECISION_DPMG_RETOUR"
  | "DEMANDE_EN_ATTENTE_FINANCEMENT"
  | "CONTROLE_DFC_DISPONIBLE"
  | "CONTROLE_DFC_INDISPONIBLE"
  | "DEMANDE_EN_ATTENTE_PROLONGEE"
  | "DEMANDE_EXECUTION"
  | "DEMANDE_EXECUTEE"
  | "DEMANDE_CLOTUREE";

export interface DemandeForNotification {
  id: string;
  authorId: string;
  departmentId: string;
  department: { code: string; structureId: string | null };
  isUrgent: boolean;
}

function notificationTitle(type: string): string {
  switch (type) {
    case "DEMANDE_SOUMISE":
      return "Nouvelle demande à valider";
    case "DEMANDE_VALIDEE":
      return "Demande validée";
    case "DEMANDE_REFUSEE":
      return "Demande refusée";
    case "DEMANDE_RETOURNEE":
      return "Demande retournée pour correction";
    case "AVIS_DEPARTEMENTAL":
      return "Avis départemental à émettre";
    case "DECISION_DPMG_APPROBATION":
      return "Demande approuvée par la DPMG";
    case "DECISION_DPMG_REFUS":
      return "Demande refusée par la DPMG";
    case "DECISION_DPMG_RETOUR":
      return "Demande retournée par la DPMG";
    case "DEMANDE_EN_ATTENTE_FINANCEMENT":
      return "Demande en attente de financement";
    case "CONTROLE_DFC_DISPONIBLE":
      return "Financement disponible";
    case "CONTROLE_DFC_INDISPONIBLE":
      return "Financement indisponible";
    case "DEMANDE_EN_ATTENTE_PROLONGEE":
      return "Demande en attente prolongée";
    case "DEMANDE_EXECUTION":
      return "Demande prise en charge";
    case "DEMANDE_EXECUTEE":
      return "Demande déclarée satisfaite";
    case "DEMANDE_CLOTUREE":
      return "Demande clôturée";
    default:
      return "Notification";
  }
}

/**
 * Vérifie qu'un utilisateur est actif.
 */
async function isActiveUser(tx: Tx, userId: string): Promise<boolean> {
  const user = await tx.user.findUnique({ where: { id: userId }, select: { status: true } });
  return user?.status === UserStatus.ACTIVE;
}

/**
 * Résout le responsable hiérarchique désigné pour la soumission d'une demande.
 * Retourne [] si aucun responsable n'est résolu.
 */
export async function resolveHierarchicalRecipients(
  tx: Tx,
  demande: DemandeForNotification,
  authorStructureId: string
): Promise<string[]> {
  try {
    const validatorId = await resolveValidatorForDemande(demande.authorId, authorStructureId, { excludeAuthor: true });
    if (await isActiveUser(tx, validatorId)) {
      return [validatorId];
    }
    return [];
  } catch {
    return [];
  }
}

/**
 * Résout les utilisateurs DFC actifs et habilités sur un code département.
 * Pas de délégation DFC (règle métier).
 */
export async function resolveDfcRecipients(
  tx: Tx,
  departmentCode: string
): Promise<string[]> {
  const now = new Date();
  const roles = await tx.userStructureRole.findMany({
    where: {
      role: RoleType.DFC_CONTROLLER,
      startDate: { lte: now },
      OR: [{ endDate: null }, { endDate: { gte: now } }],
      user: { status: UserStatus.ACTIVE },
    },
    select: { userId: true, scope: true },
  });

  const result = new Set<string>();
  for (const r of roles) {
    if (r.scope === "*" || r.scope === departmentCode) {
      result.add(r.userId);
    }
  }
  return [...result];
}

/**
 * Résout les utilisateurs DPMG actifs et habilités sur un code département.
 * Respecte les délégations DPMG (le délégué remplace le délégant).
 */
export async function resolveDpmgRecipients(
  tx: Tx,
  departmentCode: string
): Promise<string[]> {
  const now = new Date();
  const roles = await tx.userStructureRole.findMany({
    where: {
      role: { in: [RoleType.DPMG_MANAGER, RoleType.DPMG_DELEGATE] },
      startDate: { lte: now },
      OR: [{ endDate: null }, { endDate: { gte: now } }],
      user: { status: UserStatus.ACTIVE },
    },
    select: { userId: true, role: true, scope: true, delegatedFromUserId: true },
  });

  // Charger les délégants DPMG actifs
  const delegatorIds = [
    ...new Set(
      roles
        .filter((r) => r.role === RoleType.DPMG_DELEGATE && r.delegatedFromUserId !== null)
        .map((r) => r.delegatedFromUserId!)
    ),
  ];
  const delegatorRoles = delegatorIds.length
    ? await tx.userStructureRole.findMany({
        where: {
          userId: { in: delegatorIds },
          role: RoleType.DPMG_MANAGER,
          startDate: { lte: now },
          OR: [{ endDate: null }, { endDate: { gte: now } }],
          user: { status: UserStatus.ACTIVE },
        },
        select: { userId: true, scope: true },
      })
    : [];

  const result = new Set<string>();
  for (const r of roles) {
    // scope covers department
    const scopeCovers = r.scope === "*" || r.scope === departmentCode;
    if (!scopeCovers) continue;
    if (r.role === "DPMG_MANAGER") {
      result.add(r.userId);
    } else if (r.role === "DPMG_DELEGATE" && r.delegatedFromUserId !== null) {
      const delegatorCovers = delegatorRoles
        .filter((d) => d.userId === r.delegatedFromUserId)
        .some((d) => d.scope === "*" || d.scope === departmentCode);
      if (delegatorCovers) {
        result.add(r.userId);
      }
    }
  }
  return [...result];
}

/**
 * Résout les destinataires d'une notification selon son type et la demande.
 * @param authorStructureId structure de référence de l'auteur (pour la soumission)
 */
export async function resolveRecipients(
  tx: Tx,
  type: string,
  demande: DemandeForNotification,
  authorStructureId?: string
): Promise<string[]> {
  const recipients: string[] = [];

  switch (type) {
    case "DEMANDE_SOUMISE":
      if (authorStructureId) {
        const validator = await resolveHierarchicalRecipients(tx, demande, authorStructureId);
        recipients.push(...validator);
      }
      break;
    case "DEMANDE_VALIDEE":
    case "DEMANDE_REFUSEE":
    case "DEMANDE_RETOURNEE":
    case "DECISION_DPMG_APPROBATION":
    case "DECISION_DPMG_REFUS":
    case "DECISION_DPMG_RETOUR":
    case "CONTROLE_DFC_DISPONIBLE":
    case "CONTROLE_DFC_INDISPONIBLE":
      if (await isActiveUser(tx, demande.authorId)) {
        recipients.push(demande.authorId);
      }
      if (type === "CONTROLE_DFC_DISPONIBLE" || type === "CONTROLE_DFC_INDISPONIBLE") {
        const dpmg = await resolveDpmgRecipients(tx, demande.department.code);
        recipients.push(...dpmg);
      }
      break;
    case "AVIS_DEPARTEMENTAL":
      {
        const dpmg = await resolveDpmgRecipients(tx, demande.department.code);
        recipients.push(...dpmg);
      }
      break;
    case "DEMANDE_EN_ATTENTE_FINANCEMENT":
      {
        const dfc = await resolveDfcRecipients(tx, demande.department.code);
        recipients.push(...dfc);
      }
      break;
    case "DEMANDE_EN_ATTENTE_PROLONGEE":
    case "DEMANDE_EXECUTION":
      break;
    case "DEMANDE_EXECUTEE":
      {
        const dpmg = await resolveDpmgRecipients(tx, demande.department.code);
        recipients.push(...dpmg);
      }
      break;
    case "DEMANDE_CLOTUREE":
      if (await isActiveUser(tx, demande.authorId)) {
        recipients.push(demande.authorId);
      }
      break;
    default:
      break;
  }

  // Déduplication
  return [...new Set(recipients)];
}

/**
 * Construit une clé d'événement stable pour l'idempotence.
 * Format : <eventSourceId>:<type>:<recipientUserId>
 */
export function buildEventKey(
  type: string,
  eventSourceId: string,
  recipientUserId: string
): string {
  return `${eventSourceId}:${type}:${recipientUserId}`;
}

/**
 * Crée des entrées NotificationOutbox dans la transaction fournie.
 * Retourne le nombre d'entrées créées (les doublons sont ignorés).
 */
export async function createNotificationOutboxEntries(
  tx: Tx,
  params: {
    type: string;
    demande: DemandeForNotification;
    authorStructureId?: string;
    eventSourceId?: string;
    priority?: NotificationPriority;
  }
): Promise<number> {
  const recipients = await resolveRecipients(tx, params.type, params.demande, params.authorStructureId);
  const eventSourceId = params.eventSourceId ?? params.demande.id;
  const priority =
    params.priority ??
    (params.demande.isUrgent ? NotificationPriority.HIGH : NotificationPriority.NORMAL);

  let created = 0;
  for (const userId of recipients) {
    const eventKey = buildEventKey(params.type, eventSourceId, userId);
    const inserted = await tx.$executeRaw`
      INSERT INTO "NotificationOutbox" (id, "eventKey", "recipientUserId", "demandeId", type, title, message, priority, status, attempts, "availableAt", "createdAt")
      VALUES (gen_random_uuid()::text, ${eventKey}, ${userId}, ${params.demande.id}, ${params.type}::"NotificationType", ${notificationTitle(params.type)}, NULL, ${priority}::"NotificationPriority", 'PENDING'::"NotificationOutboxStatus", 0, now(), now())
      ON CONFLICT ("eventKey") DO NOTHING
    `;
    if (Number(inserted) > 0) created++;
  }
  return created;
}
