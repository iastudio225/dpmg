import { z } from "zod";

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.string().url().optional(),
  FRONTEND_URL: z.string().url().default("http://localhost:5173"),
  SESSION_SECRET: z.string().min(32).optional(),
  SESSION_MAX_AGE: z.coerce.number().int().positive().default(86400000),
  LOGIN_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(900000),
  LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(5),
  /** Répertoire de stockage des justificatifs d'exécution (défaut : <cwd>/uploads). */
  UPLOAD_DIR: z.string().optional(),
  /** Taille maximale d'un justificatif téléversé, en Mo. */
  PROOF_MAX_SIZE_MB: z.coerce.number().int().positive().default(10),
});

export type Env = z.infer<typeof envSchema>;

export const healthCheckResponseSchema = z.object({
  status: z.literal("ok"),
  timestamp: z.string().datetime(),
  uptime: z.number().int().nonnegative(),
});

export type HealthCheckResponse = z.infer<typeof healthCheckResponseSchema>;

export const userStatusSchema = z.enum(["ACTIVE", "SUSPENDED", "DISABLED"]);
export type UserStatus = z.infer<typeof userStatusSchema>;

export const userStatusChangeSchema = z.object({
  status: userStatusSchema,
});
export type UserStatusChangeRequest = z.infer<typeof userStatusChangeSchema>;

export const structureTypeSchema = z.enum(["DIRECTION", "REGIONAL_DIRECTION", "AGENCY", "POINT_OF_SALE", "OTHER"]);
export type StructureType = z.infer<typeof structureTypeSchema>;

export const structureTypeLabelFr: Record<StructureType, string> = {
  DIRECTION: "Direction",
  REGIONAL_DIRECTION: "Direction Régionale",
  AGENCY: "Agence",
  POINT_OF_SALE: "Point de vente",
  OTHER: "Autre",
};

export const structureResponseSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  type: structureTypeSchema,
  parentId: z.string().nullable(),
  parentName: z.string().nullable(),
  status: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type StructureResponse = z.infer<typeof structureResponseSchema>;

export const structureCreateSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2, { message: "Le code doit contenir au moins 2 caractères" })
    .max(30)
    .regex(/^[A-Za-z0-9_-]+$/, { message: "Code invalide (lettres, chiffres, - et _ uniquement)" }),
  name: z.string().trim().min(1, { message: "Le nom est requis" }).max(100),
  type: structureTypeSchema,
  parentId: z.string().min(1).optional().nullable(),
});
export type StructureCreateRequest = z.infer<typeof structureCreateSchema>;

export const structureUpdateSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(2)
      .max(30)
      .regex(/^[A-Za-z0-9_-]+$/, { message: "Code invalide (lettres, chiffres, - et _ uniquement)" })
      .optional(),
    name: z.string().trim().min(1).max(100).optional(),
    type: structureTypeSchema.optional(),
    parentId: z.string().min(1).optional().nullable(),
  })
  .refine((value) => Object.values(value).some((v) => v !== undefined), {
    message: "Aucune modification fournie",
  });
export type StructureUpdateRequest = z.infer<typeof structureUpdateSchema>;

export const structureStatusChangeSchema = z.object({
  status: z.boolean(),
});
export type StructureStatusChangeRequest = z.infer<typeof structureStatusChangeSchema>;

export const structureListQuerySchema = z.object({
  search: z.string().trim().min(1).max(100).optional(),
  type: structureTypeSchema.optional(),
  status: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(50),
});
export type StructureListQuery = z.infer<typeof structureListQuerySchema>;

/** Code : mêmes règles que les structures (2-30, lettres/chiffres/-/_). */
const departmentCodeSchema = z
  .string()
  .trim()
  .min(2, { message: "Le code doit contenir au moins 2 caractères" })
  .max(30)
  .regex(/^[A-Za-z0-9_-]+$/, { message: "Code invalide (lettres, chiffres, - et _ uniquement)" });

export const departmentResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  code: z.string(),
  description: z.string().nullable(),
  status: z.boolean(),
  structureId: z.string().nullable(),
  structureName: z.string().nullable(),
  structureCode: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type DepartmentResponse = z.infer<typeof departmentResponseSchema>;

export const departmentCreateSchema = z.object({
  name: z.string().trim().min(1, { message: "Le nom est requis" }).max(100),
  code: departmentCodeSchema,
  description: z.string().trim().max(500).optional().nullable(),
  structureId: z.string().min(1, { message: "La structure de rattachement est requise" }),
});
export type DepartmentCreateRequest = z.infer<typeof departmentCreateSchema>;

export const departmentUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    code: departmentCodeSchema.optional(),
    description: z.string().trim().max(500).optional().nullable(),
    structureId: z.string().min(1).optional(),
  })
  .refine((value) => Object.values(value).some((v) => v !== undefined), {
    message: "Aucune modification fournie",
  });
export type DepartmentUpdateRequest = z.infer<typeof departmentUpdateSchema>;

export const departmentStatusChangeSchema = z.object({
  status: z.boolean(),
});
export type DepartmentStatusChangeRequest = z.infer<typeof departmentStatusChangeSchema>;

export const departmentListQuerySchema = z.object({
  search: z.string().trim().min(1).max(100).optional(),
  structureId: z.string().min(1).optional(),
  status: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(50),
});
export type DepartmentListQuery = z.infer<typeof departmentListQuerySchema>;

export const roleTypeSchema = z.enum([
  "EMPLOYEE",
  "HIERARCHICAL_MANAGER",
  "DELEGATED_REPRESENTATIVE",
  "DEPARTMENT_MANAGER",
  "DEPARTMENT_DELEGATE",
  "DPMG_MANAGER",
  "DPMG_DELEGATE",
  "DFC_CONTROLLER",
  "CPMP_USER",
  "DG_USER",
  "EXECUTION_AGENT",
  "TECHNICAL_ADMIN",
  "SUPER_ADMIN",
]);
export type RoleType = z.infer<typeof roleTypeSchema>;

export const roleTypeLabelFr: Record<RoleType, string> = {
  EMPLOYEE: "Agent",
  HIERARCHICAL_MANAGER: "Directeur régional",
  DELEGATED_REPRESENTATIVE: "Représentant délégué",
  DEPARTMENT_MANAGER: "Responsable de département",
  DEPARTMENT_DELEGATE: "Délégué de département",
  DPMG_MANAGER: "Directeur DPMG",
  DPMG_DELEGATE: "Délégué DPMG",
  DFC_CONTROLLER: "Contrôleur financier (DFC)",
  CPMP_USER: "Agent CPMP",
  DG_USER: "Directeur général (DG)",
  EXECUTION_AGENT: "Agent d'exécution",
  TECHNICAL_ADMIN: "Administrateur technique",
  SUPER_ADMIN: "Super administrateur",
};

export const userRoleResponseSchema = z.object({
  /** Identifiant réel de la ligne UserStructureRole (requis pour PUT/DELETE /roles/:roleId). */
  id: z.string(),
  role: roleTypeSchema,
  structureId: z.string().nullable(),
  structureName: z.string().nullable(),
  structureCode: z.string().nullable(),
  structureType: structureTypeSchema.nullable(),
  scope: z.string().nullable(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime().nullable(),
  delegationNote: z.string().nullable(),
});

export type UserRoleResponse = z.infer<typeof userRoleResponseSchema>;

export const loginRequestSchema = z.object({
  email: z.string().email({ message: "Adresse e-mail invalide" }),
  password: z.string().min(1, { message: "Mot de passe requis" }),
});

export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const userResponseSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  firstName: z.string(),
  lastName: z.string(),
  phone: z.string().nullable(),
  status: userStatusSchema,
  mustChangePassword: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  roles: z.array(userRoleResponseSchema).optional(),
});

export type UserResponse = z.infer<typeof userResponseSchema>;

export const authMeResponseSchema = z.object({
  user: userResponseSchema,
  roles: z.array(userRoleResponseSchema),
});

export type AuthMeResponse = z.infer<typeof authMeResponseSchema>;

export const authErrorResponseSchema = z.object({
  code: z.string(),
  message: z.string(),
});

export type AuthErrorResponse = z.infer<typeof authErrorResponseSchema>;

/**
 * Réinitialisation administrative du mot de passe : le mot de passe temporaire
 * est fourni par l'administrateur et n'est jamais persisté en clair.
 */
export const resetPasswordSchema = z.object({
  password: z.string().min(12, { message: "Le mot de passe doit contenir au moins 12 caractères" }),
});
export type ResetPasswordRequest = z.infer<typeof resetPasswordSchema>;

/**
 * Changement de mot de passe courant (utilisateur authentifié, y compris pendant
 * la phase de mot de passe temporaire).
 */
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, { message: "Mot de passe actuel requis" }),
  newPassword: z.string().min(12, { message: "Le nouveau mot de passe doit contenir au moins 12 caractères" }),
});
export type ChangePasswordRequest = z.infer<typeof changePasswordSchema>;

export const userUpdateSchema = z
  .object({
    firstName: z.string().trim().min(1).max(100).optional(),
    lastName: z.string().trim().min(1).max(100).optional(),
    phone: z.string().trim().max(20).optional().nullable(),
    email: z.string().email({ message: "Adresse e-mail invalide" }).optional(),
  })
  .refine((value) => Object.values(value).some((v) => v !== undefined), {
    message: "Aucune modification fournie",
  });
export type UserUpdateRequest = z.infer<typeof userUpdateSchema>;

export const userRoleAssignmentSchema = z.object({
  role: roleTypeSchema,
  // structureId est obligatoire pour tous les rôles sauf TECHNICAL_ADMIN (administrateur global sans rattachement).
  structureId: z.string().min(1).optional().nullable(),
  scope: z.string().nullable().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  delegationNote: z.string().trim().max(500).optional().nullable(),
  delegatedFromUserId: z.string().min(1).optional().nullable(),
})
  .refine(
    (value) => {
      // TECHNICAL_ADMIN et SUPER_ADMIN peuvent être créés sans structure (périmètre global "*").
      if (value.role === "TECHNICAL_ADMIN" || value.role === "SUPER_ADMIN") {
        return true;
      }
      // Pour tout autre rôle, un identifiant de structure est requis.
      return Boolean(value.structureId && value.structureId.trim().length > 0);
    },
    {
      message: "L'identifiant de la structure est requis pour ce rôle",
      path: ["structureId"],
    }
  );
export type UserRoleAssignmentRequest = z.infer<typeof userRoleAssignmentSchema>;

export const userCreateSchema = z.object({
  email: z.string().email({ message: "Adresse e-mail invalide" }),
  firstName: z.string().trim().min(1, { message: "Le prénom est requis" }).max(100),
  lastName: z.string().trim().min(1, { message: "Le nom est requis" }).max(100),
  phone: z.string().trim().max(20).optional().nullable(),
  status: userStatusSchema.optional(),
  password: z.string().min(12, { message: "Le mot de passe doit contenir au moins 12 caractères" }),
  roles: z.array(userRoleAssignmentSchema).optional(),
});
export type UserCreateRequest = z.infer<typeof userCreateSchema>;

export const userRoleUpdateSchema = z
  .object({
    scope: z.string().nullable().optional(),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
    delegationNote: z.string().trim().max(500).optional().nullable(),
  })
  .refine(
    (value) =>
      value.scope !== undefined ||
      value.startDate !== undefined ||
      value.endDate !== undefined ||
      value.delegationNote !== undefined,
    { message: "Aucune modification fournie" }
  );
export type UserRoleUpdateRequest = z.infer<typeof userRoleUpdateSchema>;

export const userListQuerySchema = z.object({
  search: z.string().trim().min(1).max(100).optional(),
  status: userStatusSchema.optional(),
  role: roleTypeSchema.optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(20),
});
export type UserListQuery = z.infer<typeof userListQuerySchema>;

export const auditLogListQuerySchema = z.object({
  actorId: z.string().min(1).optional(),
  action: z.string().min(1).max(100).optional(),
  targetType: z.string().min(1).max(50).optional(),
  targetId: z.string().min(1).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(20),
});
export type AuditLogListQuery = z.infer<typeof auditLogListQuerySchema>;

export const auditLogResponseSchema = z.object({
  id: z.string(),
  actorId: z.string(),
  action: z.string(),
  targetType: z.string(),
  targetId: z.string(),
  details: z.record(z.string(), z.unknown()).nullable(),
  createdAt: z.string().datetime(),
});
export type AuditLogResponse = z.infer<typeof auditLogResponseSchema>;

export const demandeStatusSchema = z.enum([
  "BROUILLON",
  "EN_ATTENTE_VALIDATION",
  "EN_ATTENTE_ANALYSE",
  "EN_ATTENTE_DECISION",
  "EN_ATTENTE_FINANCEMENT",
  "EN_ATTENTE_EXECUTION",
  "EN_ATTENTE_CONFIRMATION_SATISFACTION",
  "CLOTUREE",
  "RETOURNEE",
  "REFUSEE",
]);
export type DemandeStatus = z.infer<typeof demandeStatusSchema>;

export const demandeDecisionTypeSchema = z.enum([
  "SOUMISSION",
  "APPROBATION",
  "REFUS",
  "RETOUR",
  "AVIS_DEPARTEMENTAL",
  "DECISION_DPMG_APPROBATION",
  "DECISION_DPMG_REFUS",
  "DECISION_DPMG_RETOUR",
  "DECISION_DFC_DISPONIBLE",
  "DECISION_DFC_INDISPONIBLE",
  "DEMANDE_EXECUTION",
  "DEMANDE_EXECUTEE",
  "DEMANDE_CLOTUREE",
  "OBSERVATION_DG",
  "OBSERVATION_CPMP",
]);
export type DemandeDecisionType = z.infer<typeof demandeDecisionTypeSchema>;

export const demandeCategorySchema = z.enum(["INFRASTRUCTURE", "LOGISTIQUE", "MAGASIN"]);
export type DemandeCategory = z.infer<typeof demandeCategorySchema>;

export const DEMANDE_CATEGORY_DEPARTMENT_CODE: Record<DemandeCategory, string> = {
  INFRASTRUCTURE: "INFRA",
  LOGISTIQUE: "LOGIS",
  MAGASIN: "MAGASIN",
};

export const demandeCreateSchema = z.object({
  title: z.string().trim().min(3, { message: "Titre trop court (3 caractères minimum)" }).max(200),
  description: z.string().trim().min(1, { message: "Description requise" }).max(5000),
  category: demandeCategorySchema,
  departmentId: z.string().min(1).optional(),
});

export type DemandeCreateRequest = z.infer<typeof demandeCreateSchema>;

export const demandeUpdateSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(3, { message: "Titre trop court (3 caractères minimum)" })
      .max(200)
      .optional(),
    description: z.string().trim().min(1, { message: "Description requise" }).max(5000).optional(),
    category: demandeCategorySchema.optional(),
    departmentId: z.string().min(1).optional(),
  })
  .refine((value) => Object.values(value).some((v) => v !== undefined), {
    message: "Aucune modification fournie",
  });

export type DemandeUpdateRequest = z.infer<typeof demandeUpdateSchema>;

export const demandeListQuerySchema = z.object({
  status: demandeStatusSchema.optional(),
  departmentId: z.string().min(1).optional(),
});

export type DemandeListQuery = z.infer<typeof demandeListQuerySchema>;

export const demandeResponseSchema = z.object({
  id: z.string(),
  reference: z.string(),
  title: z.string(),
  description: z.string(),
  status: demandeStatusSchema,
  category: demandeCategorySchema,
  departmentId: z.string(),
  departmentCode: z.string(),
  departmentName: z.string(),
  authorId: z.string(),
  authorFirstName: z.string(),
  authorLastName: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  submittedAt: z.string().datetime().nullable(),
  satisfactionProofUrl: z.string().nullable(),
  satisfactionObservations: z.string().nullable(),
  closureReturnReason: z.string().nullable(),
  departmentAvisMotif: z.string().nullable(),
  departmentAvisCommentaire: z.string().nullable(),
  executionStartedAt: z.string().datetime().nullable(),
});

export type DemandeResponse = z.infer<typeof demandeResponseSchema>;

export const consolidationStatusSchema = z.enum(["BROUILLON", "TRANSMISE"]);
export type ConsolidationStatus = z.infer<typeof consolidationStatusSchema>;

export const consolidationCreateSchema = z
  .object({
    reference: z.string().trim().min(1).max(50).optional(),
    periodStart: z.string().datetime(),
    periodEnd: z.string().datetime(),
  })
  .refine((value) => new Date(value.periodStart) <= new Date(value.periodEnd), {
    message: "La date de début doit être antérieure ou égale à la date de fin",
  });
export type ConsolidationCreateRequest = z.infer<typeof consolidationCreateSchema>;

export const consolidationAddDemandesSchema = z.object({
  demandeIds: z.array(z.string().min(1)).min(1, { message: "Au moins une demande est requise" }),
});
export type ConsolidationAddDemandesRequest = z.infer<typeof consolidationAddDemandesSchema>;

export const consolidationResponseSchema = z.object({
  id: z.string(),
  reference: z.string(),
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
  status: consolidationStatusSchema,
  createdById: z.string(),
  transmittedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  demandes: z.array(demandeResponseSchema),
});
export type ConsolidationResponse = z.infer<typeof consolidationResponseSchema>;

export const consolidationObservationCreateSchema = z.object({
  commentaire: z.string().trim().min(1, { message: "L'observation est requise" }).max(2000),
});
export type ConsolidationObservationCreateRequest = z.infer<typeof consolidationObservationCreateSchema>;

export const consolidationObservationResponseSchema = z.object({
  id: z.string(),
  consolidationId: z.string(),
  actorId: z.string(),
  role: roleTypeSchema,
  commentaire: z.string(),
  createdAt: z.string().datetime(),
});
export type ConsolidationObservationResponse = z.infer<typeof consolidationObservationResponseSchema>;

export const consolidationAvisItemSchema = z.object({
  demandeId: z.string(),
  departmentCode: z.string(),
  departmentName: z.string(),
});
export type ConsolidationAvisItem = z.infer<typeof consolidationAvisItemSchema>;

export const consolidationAvisCompletenessSchema = z.object({
  complete: z.boolean(),
  totalDemandes: z.number().int().nonnegative(),
  demandesAvecAvis: z.number().int().nonnegative(),
  demandesSansAvis: z.number().int().nonnegative(),
  avisAttendus: z.array(consolidationAvisItemSchema),
  avisManquants: z.array(consolidationAvisItemSchema),
});
export type ConsolidationAvisCompletenessResponse = z.infer<typeof consolidationAvisCompletenessSchema>;

export const prestataireCreateSchema = z.object({
  nom: z.string().trim().min(1).max(200),
  raisonSociale: z.string().trim().max(200).optional().nullable(),
  telephone: z.string().trim().max(50).optional().nullable(),
  email: z.string().trim().email().optional().nullable(),
  adresse: z.string().trim().max(500).optional().nullable(),
  numeroIdent: z.string().trim().max(100).optional().nullable(),
  description: z.string().trim().max(2000).optional().nullable(),
});
export type PrestataireCreateRequest = z.infer<typeof prestataireCreateSchema>;

export const prestataireUpdateSchema = prestataireCreateSchema.partial().extend({
  isActive: z.boolean().optional(),
});
export type PrestataireUpdateRequest = z.infer<typeof prestataireUpdateSchema>;

export const devisCreateSchema = z.object({
  demandeId: z.string().min(1),
  prestataireId: z.string().min(1),
  reference: z.string().trim().max(100).optional().nullable(),
  dateDevis: z.string().datetime().optional().nullable(),
  dateValidite: z.string().datetime().optional().nullable(),
  montantHT: z.number().nonnegative().optional().nullable(),
  montantTVA: z.number().nonnegative().optional().nullable(),
  montantTTC: z.number().nonnegative().optional().nullable(),
  devise: z.string().trim().min(1).max(10).optional(),
  description: z.string().trim().max(2000).optional().nullable(),
  observations: z.string().trim().max(2000).optional().nullable(),
});
export type DevisCreateRequest = z.infer<typeof devisCreateSchema>;

export const devisUpdateSchema = devisCreateSchema.partial().omit({ demandeId: true });
export type DevisUpdateRequest = z.infer<typeof devisUpdateSchema>;

export const prestataireResponseSchema = z.object({
  id: z.string(),
  nom: z.string(),
  raisonSociale: z.string().nullable(),
  telephone: z.string().nullable(),
  email: z.string().nullable(),
  adresse: z.string().nullable(),
  numeroIdent: z.string().nullable(),
  description: z.string().nullable(),
  isActive: z.boolean(),
  createdById: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type PrestataireResponse = z.infer<typeof prestataireResponseSchema>;

export const devisResponseSchema = z.object({
  id: z.string(),
  reference: z.string().nullable(),
  demandeId: z.string(),
  prestataireId: z.string(),
  dateDevis: z.string().datetime().nullable(),
  dateValidite: z.string().datetime().nullable(),
  montantHT: z.number().nullable(),
  montantTVA: z.number().nullable(),
  montantTTC: z.number().nullable(),
  devise: z.string(),
  description: z.string().nullable(),
  observations: z.string().nullable(),
  createdById: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type DevisResponse = z.infer<typeof devisResponseSchema>;

export const demandeRefuseSchema = z.object({
  motif: z.string().trim().min(1, { message: "Le motif du refus est requis" }),
});
export type DemandeRefuseRequest = z.infer<typeof demandeRefuseSchema>;

export const demandeReturnSchema = z.object({
  motif: z.string().trim().optional(),
  commentaire: z.string().trim().optional(),
})
.refine((value) => value.motif !== undefined || value.commentaire !== undefined, {
  message: "Le motif ou le commentaire de retour est requis",
})
.refine((value) => {
  if (value.motif !== undefined && value.motif.trim() === "") return false;
  if (value.commentaire !== undefined && value.commentaire.trim() === "") return false;
  return true;
}, {
  message: "Le motif ou le commentaire de retour ne peut être qu'un espace vide",
})
.refine((value) => {
  const hasMotif = value.motif !== undefined && value.motif.trim() !== "";
  const hasCommentaire = value.commentaire !== undefined && value.commentaire.trim() !== "";
  return hasMotif || hasCommentaire;
}, {
  message: "Au moins l'un des champs motif ou commentaire doit être rempli",
});
export type DemandeReturnRequest = z.infer<typeof demandeReturnSchema>;

export const avisBodySchema = z.object({
  motif: z.string().trim().optional(),
  commentaire: z.string().trim().optional(),
});
export type AvisBodyRequest = z.infer<typeof avisBodySchema>;

export const observationBodySchema = z.object({
  commentaire: z.string().trim().min(1, { message: "L'observation est requise" }).max(2000),
});
export type ObservationBodyRequest = z.infer<typeof observationBodySchema>;

/**
 * Décision DPMG — approbation.
 * Aucun champ métier obligatoire : l'approbation DPMG ne porte pas de motif requis
 * par le workflow. Elle ne vaut pas non plus disponibilité des fonds.
 */
export const dpmgApproveSchema = z.object({
  commentaire: z.string().trim().optional(),
});
export type DpmgApproveRequest = z.infer<typeof dpmgApproveSchema>;

/**
 * Décision DPMG — refus.
 * Le workflow impose un motif pour tout refus.
 */
export const dpmgRefuseSchema = z.object({
  motif: z.string().trim().min(1, { message: "Le motif du refus est requis" }),
  commentaire: z.string().trim().optional(),
});
export type DpmgRefuseRequest = z.infer<typeof dpmgRefuseSchema>;

/**
 * Décision DPMG — retour à l'auteur pour correction.
 * Le workflow impose un motif pour tout retour.
 */
export const dpmgReturnSchema = z.object({
  motif: z.string().trim().min(1, { message: "Le motif du retour est requis" }),
  commentaire: z.string().trim().optional(),
});
/**
 * Contrôle financier DFC.
 * Le motif est facultatif. Le résultat est explicite : DISPONIBLE fait passer
 * la demande à EN_ATTENTE_EXECUTION, INDISPONIBLE la laisse en
 * EN_ATTENTE_FINANCEMENT. Aucun montant n'est accepté dans ce lot.
 */
export const dfcControlSchema = z.object({
  result: z.enum(["DISPONIBLE", "INDISPONIBLE"]),
  motif: z.string().trim().optional(),
});
export const demandeStatsSchema = z.object({
  totalVisible: z.number().int().nonnegative(),
  brouillons: z.number().int().nonnegative(),
  enAttenteValidation: z.number().int().nonnegative(),
  enAttenteAnalyse: z.number().int().nonnegative(),
  enAttenteDecision: z.number().int().nonnegative(),
  enAttenteFinancement: z.number().int().nonnegative(),
  enAttenteExecution: z.number().int().nonnegative(),
  retournees: z.number().int().nonnegative(),
  refusees: z.number().int().nonnegative(),
  urgentes: z.number().int().nonnegative(),
});
export type DemandeStatsResponse = z.infer<typeof demandeStatsSchema>;

export const notificationListQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(50).default(20),
  cursor: z.string().optional(),
  isRead: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
});
export type NotificationListQuery = z.infer<typeof notificationListQuerySchema>;

export const notificationResponseSchema = z.object({
  id: z.string(),
  type: z.string(),
  title: z.string(),
  message: z.string().nullable(),
  priority: z.string(),
  isRead: z.boolean(),
  readAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  demandeId: z.string().nullable(),
});
export type NotificationResponse = z.infer<typeof notificationResponseSchema>;

export const declareSatisfactionSchema = z.object({
  proofUrl: z.string().trim().url({ message: "URL de justificatif invalide" }),
  observations: z.string().trim().optional(),
});
export type DeclareSatisfactionRequest = z.infer<typeof declareSatisfactionSchema>;

export const returnForExecutionSchema = z.object({
  motif: z.string().trim().min(1, { message: "Le motif du retour est requis" }),
});
export type ReturnForExecutionRequest = z.infer<typeof returnForExecutionSchema>;