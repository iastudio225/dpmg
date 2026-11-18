import type {
  AuthMeResponse,
  LoginRequest,
  DemandeResponse,
  DemandeCreateRequest,
  DemandeUpdateRequest,
  DemandeStatus,
  AvisBodyRequest,
  DemandeStatsResponse,
  NotificationResponse,
  UserResponse,
  UserRoleResponse,
  UserCreateRequest,
  UserUpdateRequest,
  UserStatus,
  UserRoleAssignmentRequest,
  UserRoleUpdateRequest,
  ResetPasswordRequest,
  ChangePasswordRequest,
  AuditLogResponse,
  AuditLogListQuery,
  StructureResponse,
  StructureType,
  StructureCreateRequest,
  StructureUpdateRequest,
  DepartmentResponse,
  DepartmentCreateRequest,
  DepartmentUpdateRequest,
  ConsolidationResponse,
  ConsolidationCreateRequest,
  ConsolidationAddDemandesRequest,
  ConsolidationAvisCompletenessResponse,
  ConsolidationObservationResponse,
  RapportGlobalResponse,
} from "@dpmg/shared";

const API_BASE = "/api";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function httpFallback(status: number): { code: string; message: string } {
  if (status === 401) return { code: "UNAUTHORIZED", message: "Authentification requise" };
  if (status === 403) return { code: "FORBIDDEN", message: "Accès non autorisé" };
  if (status === 404) return { code: "NOT_FOUND", message: "Ressource non trouvée" };
  if (status === 429) return { code: "RATE_LIMIT_EXCEEDED", message: "Trop de requêtes. Veuillez patienter" };
  if (status >= 500) return { code: "INTERNAL_ERROR", message: "Erreur interne du serveur" };
  return { code: "HTTP_ERROR", message: `Erreur ${status}` };
}

async function fetchApi<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    credentials: "include",
    cache: "no-store",
    ...options,
  });

  const raw = await response.text();
  let data: unknown = null;
  if (raw.trim().length > 0) {
    try {
      data = JSON.parse(raw);
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    const body = isRecord(data) ? data : null;
    const fallback = httpFallback(response.status);
    const code = typeof body?.["code"] === "string" ? body["code"] : fallback.code;
    const message = typeof body?.["message"] === "string" ? body["message"] : fallback.message;
    const details = isRecord(body?.["details"]) ? (body["details"] as Record<string, unknown>) : undefined;
    throw new ApiError(code, message, response.status, details);
  }

  if (data === null) {
    if (raw.trim().length === 0) {
      return undefined as T;
    }
    throw new ApiError(
      "INVALID_RESPONSE",
      "Réponse inattendue du serveur",
      response.status
    );
  }

  return data as T;
}

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const authApi = {
  login: (credentials: LoginRequest) =>
    fetchApi<AuthMeResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify(credentials),
    }),

  logout: () =>
    fetchApi<{ message: string }>("/auth/logout", {
      method: "POST",
    }),

  me: () => fetchApi<AuthMeResponse>("/auth/me"),

  changePassword: (currentPassword: string, newPassword: string) =>
    fetchApi<{ message: string; mustChangePassword: boolean }>("/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword } satisfies ChangePasswordRequest),
    }),
};

export const demandesApi = {
  list: (params?: { status?: DemandeStatus }) => {
    const query = params?.status ? `?status=${encodeURIComponent(params.status)}` : "";
    return fetchApi<DemandeResponse[]>(`/demandes${query}`);
  },

  get: (id: string) => fetchApi<DemandeResponse>(`/demandes/${encodeURIComponent(id)}`),

  create: (payload: DemandeCreateRequest) =>
    fetchApi<DemandeResponse>("/demandes", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  update: (id: string, payload: DemandeUpdateRequest) =>
    fetchApi<DemandeResponse>(`/demandes/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  submit: (id: string) =>
    fetchApi<DemandeResponse>(`/demandes/${encodeURIComponent(id)}/submit`, {
      method: "PATCH",
    }),

  approve: (id: string) =>
    fetchApi<DemandeResponse>(`/demandes/${encodeURIComponent(id)}/approve`, {
      method: "POST",
    }),

  refuse: (id: string, motif: string) =>
    fetchApi<DemandeResponse>(`/demandes/${encodeURIComponent(id)}/refuse`, {
      method: "POST",
      body: JSON.stringify({ motif }),
    }),

  return: (id: string, motif?: string, commentaire?: string) =>
    fetchApi<DemandeResponse>(`/demandes/${encodeURIComponent(id)}/return`, {
      method: "POST",
      body: JSON.stringify({ motif, commentaire }),
    }),

  avis: (id: string, body: AvisBodyRequest) =>
    fetchApi<DemandeResponse>(`/demandes/${encodeURIComponent(id)}/avis`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  dpmgApprove: (id: string, commentaire?: string) =>
    fetchApi<DemandeResponse>(`/demandes/${encodeURIComponent(id)}/dpmg/approve`, {
      method: "POST",
      body: JSON.stringify(commentaire && commentaire.trim() !== "" ? { commentaire: commentaire.trim() } : {}),
    }),

  dpmgRefuse: (id: string, motif: string, commentaire?: string) =>
    fetchApi<DemandeResponse>(`/demandes/${encodeURIComponent(id)}/dpmg/refuse`, {
      method: "POST",
      body: JSON.stringify({
        motif,
        ...(commentaire && commentaire.trim() !== "" ? { commentaire: commentaire.trim() } : {}),
      }),
    }),

  dpmgReturn: (id: string, motif: string, commentaire?: string) =>
    fetchApi<DemandeResponse>(`/demandes/${encodeURIComponent(id)}/dpmg/return`, {
      method: "POST",
      body: JSON.stringify({
        motif,
        ...(commentaire && commentaire.trim() !== "" ? { commentaire: commentaire.trim() } : {}),
      }),
    }),

  dfcControl: (id: string, result: "DISPONIBLE" | "INDISPONIBLE", motif?: string) =>
    fetchApi<DemandeResponse>(`/demandes/${encodeURIComponent(id)}/dfc/control`, {
      method: "POST",
      body: JSON.stringify({
        result,
        ...(motif && motif.trim() !== "" ? { motif: motif.trim() } : {}),
      }),
    }),

  stats: () => fetchApi<DemandeStatsResponse>("/demandes/stats"),

  startExecution: (id: string) =>
    fetchApi<DemandeResponse>(`/demandes/${encodeURIComponent(id)}/execution/start`, {
      method: "POST",
    }),

  declareSatisfaction: (id: string, proofUrl: string, observations?: string) =>
    fetchApi<DemandeResponse>(`/demandes/${encodeURIComponent(id)}/satisfaction`, {
      method: "POST",
      body: JSON.stringify({
        proofUrl,
        ...(observations && observations.trim() !== "" ? { observations: observations.trim() } : {}),
      }),
    }),

  confirmSatisfaction: (id: string) =>
    fetchApi<DemandeResponse>(`/demandes/${encodeURIComponent(id)}/satisfaction/confirm`, {
      method: "POST",
    }),

  /**
   * Déclare la satisfaction avec un fichier justificatif téléversé.
   * Le fichier est envoyé en corps brut ; son nom passe par `X-File-Name`.
   */
  uploadSatisfactionProof: (id: string, file: File, observations?: string) => {
    const query =
      observations && observations.trim() !== ""
        ? `?observations=${encodeURIComponent(observations.trim())}`
        : "";
    return fetchApi<DemandeResponse>(
      `/demandes/${encodeURIComponent(id)}/satisfaction/file${query}`,
      {
        method: "POST",
        headers: {
          "Content-Type": file.type || "application/octet-stream",
          "X-File-Name": encodeURIComponent(file.name),
          "X-File-Type": file.type || "application/octet-stream",
        },
        body: file,
      }
    );
  },

  closeDemande: (id: string) =>
    fetchApi<DemandeResponse>(`/demandes/${encodeURIComponent(id)}/close`, {
      method: "POST",
    }),

  returnForExecution: (id: string, motif: string) =>
    fetchApi<DemandeResponse>(`/demandes/${encodeURIComponent(id)}/execution/return`, {
      method: "POST",
      body: JSON.stringify({ motif }),
    }),

  listObservations: (id: string) =>
    fetchApi<DemandeObservationResponse[]>(`/demandes/${encodeURIComponent(id)}/observations`),

  addObservation: (id: string, commentaire: string) =>
    fetchApi<DemandeObservationResponse>(`/demandes/${encodeURIComponent(id)}/observations`, {
      method: "POST",
      body: JSON.stringify({ commentaire }),
    }),
};

export interface DemandeObservationResponse {
  id: string;
  demandeId: string;
  authorId: string;
  type: "OBSERVATION_DG" | "OBSERVATION_CPMP";
  commentaire: string | null;
  createdAt: string;
}

export const usersApi = {
  list: (params?: { search?: string; status?: UserStatus; role?: string; page?: number; limit?: number }) => {
    const query = new URLSearchParams();
    if (params?.search) query.set("search", params.search);
    if (params?.status) query.set("status", params.status);
    if (params?.role) query.set("role", params.role);
    if (params?.page) query.set("page", String(params.page));
    if (params?.limit) query.set("limit", String(params.limit));
    const qs = query.toString();
    return fetchApi<UserResponse[]>(`/users${qs ? `?${qs}` : ""}`);
  },

  get: (id: string) =>
    fetchApi<{ user: UserResponse; roles: UserRoleResponse[] }>(`/users/${encodeURIComponent(id)}`),

  create: (payload: UserCreateRequest) =>
    fetchApi<UserResponse>("/users", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  update: (id: string, payload: UserUpdateRequest) =>
    fetchApi<UserResponse>(`/users/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),

  changeStatus: (id: string, status: UserStatus) =>
    fetchApi<UserResponse>(`/users/${encodeURIComponent(id)}/status`, {
      method: "PUT",
      body: JSON.stringify({ status }),
    }),

  resetPassword: (id: string, password: string) =>
    fetchApi<{ temporaryPassword: string; success: boolean }>(`/users/${encodeURIComponent(id)}/reset-password`, {
      method: "POST",
      body: JSON.stringify({ password } satisfies ResetPasswordRequest),
    }),

  invalidateSessions: (id: string) =>
    fetchApi<{ invalidated: number }>(`/users/${encodeURIComponent(id)}/sessions`, {
      method: "DELETE",
    }),

  assignRole: (id: string, payload: UserRoleAssignmentRequest) =>
    fetchApi<unknown>(`/users/${encodeURIComponent(id)}/roles`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  updateRole: (id: string, roleId: string, payload: UserRoleUpdateRequest) =>
    fetchApi<{ success: boolean }>(`/users/${encodeURIComponent(id)}/roles/${encodeURIComponent(roleId)}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),

  removeRole: (id: string, roleId: string) =>
    fetchApi<{ success: boolean }>(`/users/${encodeURIComponent(id)}/roles/${encodeURIComponent(roleId)}`, {
      method: "DELETE",
    }),

  auditLogs: (params?: AuditLogListQuery) => {
    const query = new URLSearchParams();
    if (params?.actorId) query.set("actorId", params.actorId);
    if (params?.action) query.set("action", params.action);
    if (params?.targetType) query.set("targetType", params.targetType);
    if (params?.targetId) query.set("targetId", params.targetId);
    if (params?.from) query.set("from", params.from);
    if (params?.to) query.set("to", params.to);
    if (params?.page) query.set("page", String(params.page));
    if (params?.limit) query.set("limit", String(params.limit));
    const qs = query.toString();
    return fetchApi<AuditLogResponse[]>(`/users/audit-logs${qs ? `?${qs}` : ""}`);
  },
};

export const structuresApi = {
  list: (params?: { search?: string; type?: StructureType; status?: boolean; page?: number; limit?: number }) => {
    const query = new URLSearchParams();
    if (params?.search) query.set("search", params.search);
    if (params?.type) query.set("type", params.type);
    if (params?.status !== undefined) query.set("status", String(params.status));
    if (params?.page) query.set("page", String(params.page));
    if (params?.limit) query.set("limit", String(params.limit));
    const qs = query.toString();
    return fetchApi<StructureResponse[]>(`/structures${qs ? `?${qs}` : ""}`);
  },

  get: (id: string) =>
    fetchApi<StructureResponse>(`/structures/${encodeURIComponent(id)}`),

  create: (payload: StructureCreateRequest) =>
    fetchApi<StructureResponse>("/structures", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  update: (id: string, payload: StructureUpdateRequest) =>
    fetchApi<StructureResponse>(`/structures/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),

  changeStatus: (id: string, status: boolean) =>
    fetchApi<StructureResponse>(`/structures/${encodeURIComponent(id)}/status`, {
      method: "PUT",
      body: JSON.stringify({ status }),
    }),
};

export const departmentsApi = {
  list: (params?: { search?: string; structureId?: string; status?: boolean; page?: number; limit?: number }) => {
    const query = new URLSearchParams();
    if (params?.search) query.set("search", params.search);
    if (params?.structureId) query.set("structureId", params.structureId);
    if (params?.status !== undefined) query.set("status", String(params.status));
    if (params?.page) query.set("page", String(params.page));
    if (params?.limit) query.set("limit", String(params.limit));
    const qs = query.toString();
    return fetchApi<DepartmentResponse[]>(`/departments${qs ? `?${qs}` : ""}`);
  },

  get: (id: string) =>
    fetchApi<DepartmentResponse>(`/departments/${encodeURIComponent(id)}`),

  create: (payload: DepartmentCreateRequest) =>
    fetchApi<DepartmentResponse>("/departments", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  update: (id: string, payload: DepartmentUpdateRequest) =>
    fetchApi<DepartmentResponse>(`/departments/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),

  changeStatus: (id: string, status: boolean) =>
    fetchApi<DepartmentResponse>(`/departments/${encodeURIComponent(id)}/status`, {
      method: "PUT",
      body: JSON.stringify({ status }),
    }),
};

export const notificationsApi = {
  list: (params?: { limit?: number; cursor?: string; isRead?: boolean }) => {
    const query = new URLSearchParams();
    if (params?.limit) query.set("limit", String(params.limit));
    if (params?.cursor) query.set("cursor", params.cursor);
    if (params?.isRead !== undefined) query.set("isRead", String(params.isRead));
    const qs = query.toString();
    return fetchApi<{ items: NotificationResponse[]; nextCursor: string | null }>(
      `/notifications${qs ? `?${qs}` : ""}`
    );
  },

  unreadCount: () => fetchApi<{ count: number }>("/notifications/unread-count"),

  markRead: (id: string) =>
    fetchApi<NotificationResponse>(`/notifications/${encodeURIComponent(id)}/read`, {
      method: "PATCH",
    }),

  markAllRead: () =>
    fetchApi<{ updated: number }>("/notifications/read-all", {
      method: "PATCH",
    }),

  markReadByDemande: (demandeId: string) =>
    fetchApi<{ updated: number }>(`/notifications/by-demande/${encodeURIComponent(demandeId)}/read`, {
      method: "PATCH",
    }),
};

export const healthApi = {
  check: () => fetchApi<{ status: string; timestamp: string; uptime: number }>("/health"),
};
export const databaseAdminApi = {
  backup: () =>
    fetchApi<{ success: boolean; backupReference: string; createdAt: string; sizeBytes: number }>(
      "/admin/database/backup",
      { method: "POST" }
    ),
  resetOperational: (currentPassword: string, confirmationText: string) =>
    fetchApi<{ success: boolean; backupReference: string; deletedCounts: Record<string, number> }>(
      "/admin/database/reset-operational",
      { method: "POST", body: JSON.stringify({ currentPassword, confirmationText }) }
    ),
  resetFull: (currentPassword: string, confirmationText: string) =>
    fetchApi<{ success: boolean; backupReference: string; deletedCounts: Record<string, number> }>(
      "/admin/database/reset-full",
      { method: "POST", body: JSON.stringify({ currentPassword, confirmationText }) }
    ),
};

export const prestatairesApi = {
  list: (params?: { search?: string; isActive?: boolean; page?: number; limit?: number }) => {
    const query = new URLSearchParams();
    if (params?.search) query.set("search", params.search);
    if (params?.isActive !== undefined) query.set("isActive", String(params.isActive));
    if (params?.page) query.set("page", String(params.page));
    if (params?.limit) query.set("limit", String(params.limit));
    const qs = query.toString();
    return fetchApi<any>(`/prestataires${qs ? `?${qs}` : ""}`);
  },
  get: (id: string) => fetchApi<any>(`/prestataires/${encodeURIComponent(id)}`),
  create: (payload: any) => fetchApi<any>("/prestataires", { method: "POST", body: JSON.stringify(payload) }),
  update: (id: string, payload: any) => fetchApi<any>(`/prestataires/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(payload) }),
  activate: (id: string) => fetchApi<any>(`/prestataires/${encodeURIComponent(id)}/activate`, { method: "POST" }),
  deactivate: (id: string) => fetchApi<any>(`/prestataires/${encodeURIComponent(id)}/deactivate`, { method: "POST" }),
};

export const devisApi = {
  listByDemande: (demandeId: string, params?: { page?: number; limit?: number }) => {
    const query = new URLSearchParams();
    if (params?.page) query.set("page", String(params.page));
    if (params?.limit) query.set("limit", String(params.limit));
    const qs = query.toString();
    return fetchApi<any>(`/devis/demande/${encodeURIComponent(demandeId)}${qs ? `?${qs}` : ""}`);
  },
  get: (id: string) => fetchApi<any>(`/devis/${encodeURIComponent(id)}`),
  create: (payload: any) => fetchApi<any>("/devis", { method: "POST", body: JSON.stringify(payload) }),
  update: (id: string, payload: any) => fetchApi<any>(`/devis/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(payload) }),
  delete: (id: string) => fetchApi<any>(`/devis/${encodeURIComponent(id)}`, { method: "DELETE" }),
};

export const consolidationsApi = {
  list: () => fetchApi<ConsolidationResponse[]>("/consolidations"),
  get: (id: string) => fetchApi<ConsolidationResponse>(`/consolidations/${encodeURIComponent(id)}`),
  create: (payload: ConsolidationCreateRequest) =>
    fetchApi<ConsolidationResponse>("/consolidations", { method: "POST", body: JSON.stringify(payload) }),
  addDemandes: (id: string, payload: ConsolidationAddDemandesRequest) =>
    fetchApi<ConsolidationResponse>(`/consolidations/${encodeURIComponent(id)}/demandes`, { method: "POST", body: JSON.stringify(payload) }),
  removeDemande: (id: string, demandeId: string) =>
    fetchApi<ConsolidationResponse>(`/consolidations/${encodeURIComponent(id)}/demandes/${encodeURIComponent(demandeId)}`, { method: "DELETE" }),
  transmit: (id: string) =>
    fetchApi<ConsolidationResponse>(`/consolidations/${encodeURIComponent(id)}/transmit`, { method: "POST" }),
  getAvisCompleteness: (id: string) =>
    fetchApi<ConsolidationAvisCompletenessResponse>(`/consolidations/${encodeURIComponent(id)}/avis-completeness`),
  listObservations: (id: string) =>
    fetchApi<ConsolidationObservationResponse[]>(`/consolidations/${encodeURIComponent(id)}/observations`),
  addObservation: (id: string, commentaire: string) =>
    fetchApi<ConsolidationObservationResponse>(`/consolidations/${encodeURIComponent(id)}/observations`, { method: "POST", body: JSON.stringify({ commentaire }) }),
};

export const rapportsApi = {
  global: (params?: {
    from?: string;
    to?: string;
    departmentId?: string;
    structureId?: string;
    status?: DemandeStatus;
    urgent?: boolean;
  }) => {
    const query = new URLSearchParams();
    if (params?.from) query.set("from", params.from);
    if (params?.to) query.set("to", params.to);
    if (params?.departmentId) query.set("departmentId", params.departmentId);
    if (params?.structureId) query.set("structureId", params.structureId);
    if (params?.status) query.set("status", params.status);
    if (params?.urgent !== undefined) query.set("urgent", String(params.urgent));
    const qs = query.toString();
    return fetchApi<RapportGlobalResponse>(`/rapports/global${qs ? `?${qs}` : ""}`);
  },
};
