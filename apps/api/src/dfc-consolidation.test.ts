import test from "node:test";
import assert from "node:assert/strict";
import { controlDfcDemande } from "./services/demande.service";

function makeDb(opts: {
  demandeConsolidationId?: string | null;
  consolidationStatus?: string;
  consolidationExists?: boolean;
  dfcActive?: boolean;
  dfcExpired?: boolean;
  dfcScope?: string;
  demandeExists?: boolean;
}) {
  const demandeExists = opts.demandeExists ?? true;
  const consolidationExists = opts.consolidationExists ?? true;
  const dfcActive = opts.dfcActive ?? true;
  const dfcExpired = opts.dfcExpired ?? false;
  const dfcScope = opts.dfcScope ?? "*";

  const demande = {
    id: "dem-1",
    authorId: "author-1",
    status: "EN_ATTENTE_FINANCEMENT",
    consolidationId: opts.demandeConsolidationId ?? null,
    department: { code: "INFRA" },
  };

  const consolidation = {
    id: "cons-1",
    status: opts.consolidationStatus ?? "TRANSMISE",
  };

  const db: any = {
    demande: {
      async findUnique({ where }: any) {
        if (!demandeExists) return null;
        return demande;
      },
      async update({ where, data }: any) {
        Object.assign(demande, data);
        return { ...demande, department: { code: "INFRA" }, author: { firstName: "A", lastName: "B" } };
      },
    },
    consolidation: {
      async findUnique({ where }: any) {
        if (!consolidationExists) return null;
        return consolidation;
      },
    },
    userStructureRole: {
      async findMany({ where }: any) {
        const hasTimeFilter = !!(where?.startDate || where?.OR);
        const roles: any[] = [];
        if (dfcActive) {
          roles.push({ role: "DFC_CONTROLLER", scope: dfcScope, startDate: new Date("2020-01-01"), endDate: null });
        }
        if (dfcExpired && !hasTimeFilter) {
          roles.push({ role: "DFC_CONTROLLER", scope: dfcScope, startDate: new Date("2020-01-01"), endDate: new Date("2020-01-02") });
        }
        // time filter excludes expired
        if (hasTimeFilter && dfcExpired) {
          return roles.filter((r) => r.endDate === null || r.endDate >= new Date());
        }
        return roles;
      },
    },
    user: {
      async findUnique() {
        return { status: "ACTIVE" };
      },
    },
    async $transaction(fn: any) {
      const tx: any = {
        $queryRaw: async () => [],
        $executeRaw: async () => 1,
        user: {
          async findUnique() {
            return { status: "ACTIVE" };
          },
        },
        userStructureRole: {
          async findMany() {
            return [];
          },
        },
        demande: {
          async findUnique() {
            return { ...demande, authorId: "author-1" };
          },
          async update({ where, data }: any) {
            Object.assign(demande, data);
            return {
              id: "dem-1",
              reference: "DEM-dem-1",
              title: "Titre",
              description: "Description",
              status: demande.status,
              category: "INFRASTRUCTURE",
              departmentId: "dept-INFRA",
              authorId: "author-1",
              createdAt: new Date("2026-01-01T00:00:00Z"),
              updatedAt: new Date("2026-01-01T00:00:00Z"),
              submittedAt: new Date("2026-01-01T00:00:00Z"),
              satisfactionProofUrl: null,
              satisfactionObservations: null,
              closureReturnReason: null,
              department: { code: "INFRA", name: "Infra" },
              author: { firstName: "A", lastName: "B", structureRoles: [] },
            };
          },
        },
        demandeDecision: {
          async findFirst() {
            return { id: "dec-1", type: "DECISION_DPMG_APPROBATION" };
          },
          async create({ data }: any) {
            return data;
          },
        },
      };
      return fn(tx);
    },
  };
  return db;
}

test("contrôle autorisé avec consolidation TRANSMISE et demande rattachée", async () => {
  const db = makeDb({ demandeConsolidationId: "cons-1", consolidationStatus: "TRANSMISE", dfcActive: true, dfcScope: "*" });
  const res = await controlDfcDemande("dem-1", "u1", "DISPONIBLE", null, "cons-1", db as any);
  assert.equal(res.status, "EN_ATTENTE_EXECUTION");
});

test("consolidation inexistante : refus", async () => {
  const db = makeDb({ demandeConsolidationId: "cons-1", consolidationExists: false, dfcActive: true, dfcScope: "*" });
  await assert.rejects(
    () => controlDfcDemande("dem-1", "u1", "DISPONIBLE", null, "cons-1", db as any),
    (err: any) => err.code === "NOT_FOUND"
  );
});

test("consolidation en BROUILLON : refus", async () => {
  const db = makeDb({ demandeConsolidationId: "cons-1", consolidationStatus: "BROUILLON", dfcActive: true, dfcScope: "*" });
  await assert.rejects(
    () => controlDfcDemande("dem-1", "u1", "DISPONIBLE", null, "cons-1", db as any),
    (err: any) => err.code === "NOT_FOUND"
  );
});

test("demande rattachée à une autre consolidation : refus DEMANDE_NOT_IN_CONSOLIDATION", async () => {
  const db = makeDb({ demandeConsolidationId: "other-cons", consolidationStatus: "TRANSMISE", dfcActive: true, dfcScope: "*" });
  await assert.rejects(
    () => controlDfcDemande("dem-1", "u1", "DISPONIBLE", null, "cons-1", db as any),
    (err: any) => err.code === "DEMANDE_NOT_IN_CONSOLIDATION"
  );
});

test("demande sans consolidation : refus DEMANDE_NOT_IN_CONSOLIDATION", async () => {
  const db = makeDb({ demandeConsolidationId: null, consolidationStatus: "TRANSMISE", dfcActive: true, dfcScope: "*" });
  await assert.rejects(
    () => controlDfcDemande("dem-1", "u1", "DISPONIBLE", null, "cons-1", db as any),
    (err: any) => err.code === "DEMANDE_NOT_IN_CONSOLIDATION"
  );
});

test("appel sans consolidationId : comportement historique préservé", async () => {
  const db = makeDb({ demandeConsolidationId: null, dfcActive: true, dfcScope: "*" });
  const res = await controlDfcDemande("dem-1", "u1", "DISPONIBLE", null, null, db as any);
  assert.equal(res.status, "EN_ATTENTE_EXECUTION");
});

test("habilitation DFC expirée : refus", async () => {
  const db = makeDb({ demandeConsolidationId: "cons-1", consolidationStatus: "TRANSMISE", dfcActive: false, dfcExpired: true, dfcScope: "*" });
  await assert.rejects(
    () => controlDfcDemande("dem-1", "u1", "DISPONIBLE", null, "cons-1", db as any),
    (err: any) => err.code === "FORBIDDEN"
  );
});

test("périmètre non autorisé : refus", async () => {
  const db = makeDb({ demandeConsolidationId: "cons-1", consolidationStatus: "TRANSMISE", dfcActive: true, dfcScope: "OTHER" });
  await assert.rejects(
    () => controlDfcDemande("dem-1", "u1", "DISPONIBLE", null, "cons-1", db as any),
    (err: any) => err.code === "FORBIDDEN"
  );
});