import test from "node:test";
import assert from "node:assert/strict";
import type { ConsolidationDb } from "./services/consolidation.service";
import {
  createConsolidation,
  addDemandes,
  removeDemande,
  transmitConsolidation,
  deleteConsolidation,
  listConsolidations,
  getConsolidation,
  getAvisCompleteness,
} from "./services/consolidation.service";

function iso(date: Date): string {
  return date.toISOString();
}

function makeDemande(id: string, consolidationId: string | null = null, deptCode = "INFRA") {
  return {
    id,
    reference: `DEM-${id}`,
    title: "Titre",
    description: "Description",
    status: "EN_ATTENTE_DECISION",
    category: "INFRASTRUCTURE",
    departmentId: `dept-${deptCode}`,
    authorId: "author-1",
    consolidationId,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    submittedAt: new Date("2026-01-01T00:00:00Z"),
    satisfactionProofUrl: null,
    satisfactionObservations: null,
    closureReturnReason: null,
    department: { code: deptCode, name: deptCode },
    author: { firstName: "A", lastName: "B" },
  };
}

function makeDb(options: { manager?: boolean; dfcScopes?: string[]; dfcExpired?: boolean; demandes?: any[]; avisDemandeIds?: string[] } = {}): ConsolidationDb {
  const manager = options.manager ?? true;
  const dfcScopes = options.dfcScopes ?? [];
  const dfcExpired = options.dfcExpired ?? false;
  const consolidations: any[] = [];
  const demandes: any[] = options.demandes ?? [makeDemande("d1"), makeDemande("d2"), makeDemande("d3")];
  const avisDemandeIds = options.avisDemandeIds === undefined ? null : options.avisDemandeIds;
  const audits: any[] = [];
  let seq = 0;

  const matchWhere = (row: any, where: any): boolean => {
    if (!where) return true;
    for (const [key, value] of Object.entries(where)) {
      if (value && typeof value === "object" && "in" in (value as any)) {
        if (!(value as any).in.includes(row[key])) return false;
      } else if (row[key] !== value) {
        return false;
      }
    }
    return true;
  };

  const db: ConsolidationDb = {
    consolidation: {
      async create({ data }: any) {
        const now = new Date();
        const row = {
          id: `c${++seq}`,
          reference: data.reference,
          periodStart: data.periodStart,
          periodEnd: data.periodEnd,
          status: data.status ?? "BROUILLON",
          createdById: data.createdById,
          transmittedAt: null,
          createdAt: now,
          updatedAt: now,
        };
        consolidations.push(row);
        return row;
      },
      async findMany({ where }: any = {}) {
        return consolidations.filter((r) => matchWhere(r, where));
      },
      async findUnique({ where }: any) {
        return consolidations.find((r) => matchWhere(r, where)) ?? null;
      },
      async update({ where, data }: any) {
        const row = consolidations.find((r) => matchWhere(r, where));
        Object.assign(row, data, { updatedAt: new Date() });
        return row;
      },
      async updateMany({ where, data }: any) {
        let count = 0;
        for (const row of consolidations) {
          if (matchWhere(row, where)) {
            Object.assign(row, data, { updatedAt: new Date() });
            count++;
          }
        }
        return { count };
      },
      async delete({ where }: any) {
        const idx = consolidations.findIndex((r) => matchWhere(r, where));
        const [row] = consolidations.splice(idx, 1);
        return row;
      },
      async deleteMany({ where }: any) {
        const before = consolidations.length;
        for (let i = consolidations.length - 1; i >= 0; i--) {
          if (matchWhere(consolidations[i], where)) consolidations.splice(i, 1);
        }
        return { count: before - consolidations.length };
      },
    },
    demande: {
      async findMany({ where }: any) {
        return demandes.filter((r) => matchWhere(r, where));
      },
      async updateMany({ where, data }: any) {
        let count = 0;
        for (const row of demandes) {
          if (matchWhere(row, where)) {
            Object.assign(row, data);
            count++;
          }
        }
        return { count };
      },
    },
    demandeDecision: {
      async findMany({ where }: any) {
        const ids = where?.demandeId?.in ?? [];
        if (avisDemandeIds === null) return ids.map((id: string) => ({ demandeId: id }));
        return ids.filter((id: string) => avisDemandeIds.includes(id)).map((id: string) => ({ demandeId: id }));
      },
    },
    userStructureRole: {
      async findMany({ where }: any) {
        const roleFilter = where?.role;
        const hasTimeFilter = !!(where?.startDate || where?.OR);
        const wantDfc = !roleFilter || roleFilter === "DFC_CONTROLLER" || (roleFilter?.in && roleFilter.in.includes("DFC_CONTROLLER"));
        const wantManager = !roleFilter || roleFilter === "DPMG_MANAGER" || roleFilter === "SUPER_ADMIN" || roleFilter === "TECHNICAL_ADMIN" || (roleFilter?.in && (roleFilter.in.includes("DPMG_MANAGER") || roleFilter.in.includes("SUPER_ADMIN") || roleFilter.in.includes("TECHNICAL_ADMIN")));
        const roles: any[] = [];
        if (manager && wantManager) {
          roles.push({ role: "DPMG_MANAGER", startDate: new Date("2020-01-01T00:00:00Z"), endDate: null });
        }
        if ((dfcScopes.length > 0 || dfcExpired) && wantDfc) {
          for (const scope of dfcScopes.length > 0 ? dfcScopes : ["*"]) {
            const role = {
              role: "DFC_CONTROLLER",
              scope,
              startDate: new Date("2020-01-01T00:00:00Z"),
              endDate: dfcExpired ? new Date("2020-01-02T00:00:00Z") : null,
            };
            if (hasTimeFilter && dfcExpired) continue; // expired → excluded from active queries
            roles.push(role);
          }
        }
        return roles;
      },
    },
    user: {
      async findUnique() {
        return { status: "ACTIVE" };
      },
    },
    adminAuditLog: {
      async create({ data }: any) {
        audits.push(data);
        return data;
      },
    },
    async $queryRaw() {
      return [];
    },
    async $transaction<T>(fn: (tx: ConsolidationDb) => Promise<T>): Promise<T> {
      return fn(db);
    },
  };
  (db as any).__audits = audits;
  (db as any).__consolidations = consolidations;
  (db as any).__demandes = demandes;
  return db;
}

const period = {
  periodStart: iso(new Date("2026-11-04T00:00:00Z")),
  periodEnd: iso(new Date("2026-11-10T23:59:59Z")),
};

test("création d'une consolidation", async () => {
  const db = makeDb();
  const result = await createConsolidation("u1", { ...period }, db);
  assert.equal(result.status, "BROUILLON");
  assert.match(result.reference, /^CONS-\d{4}-W\d{2}$/);
  assert.equal(result.demandes.length, 0);
});

test("référence unique", async () => {
  const db = makeDb();
  await createConsolidation("u1", { ...period, reference: "CONS-2026-W45" }, db);
  await assert.rejects(
    () => createConsolidation("u1", { ...period, reference: "CONS-2026-W45" }, db),
    (err: any) => err.code === "REFERENCE_ALREADY_EXISTS"
  );
});

test("rattachement de plusieurs demandes", async () => {
  const db = makeDb();
  const created = await createConsolidation("u1", { ...period }, db);
  const result = await addDemandes(created.id, "u1", { demandeIds: ["d1", "d2"] }, db);
  assert.equal(result.demandes.length, 2);
  assert.ok(result.demandes.every((d) => d.id === "d1" || d.id === "d2"));
});

test("refus d'une demande déjà rattachée", async () => {
  const db = makeDb();
  const c1 = await createConsolidation("u1", { ...period }, db);
  await addDemandes(c1.id, "u1", { demandeIds: ["d1"] }, db);
  const c2 = await createConsolidation("u1", { ...period, reference: "CONS-2026-W45-B" }, db);
  await assert.rejects(
    () => addDemandes(c2.id, "u1", { demandeIds: ["d1"] }, db),
    (err: any) => err.code === "DEMANDE_ALREADY_CONSOLIDATED"
  );
});

test("retrait d'une demande d'un brouillon", async () => {
  const db = makeDb();
  const created = await createConsolidation("u1", { ...period }, db);
  await addDemandes(created.id, "u1", { demandeIds: ["d1", "d2"] }, db);
  const result = await removeDemande(created.id, "u1", "d1", db);
  assert.equal(result.demandes.length, 1);
  assert.equal(result.demandes[0]!.id, "d2");
});

test("refus de transmission d'une consolidation vide", async () => {
  const db = makeDb();
  const created = await createConsolidation("u1", { ...period }, db);
  await assert.rejects(
    () => transmitConsolidation(created.id, "u1", db),
    (err: any) => err.code === "CONSOLIDATION_EMPTY"
  );
});

test("transmission et horodatage", async () => {
  const db = makeDb();
  const created = await createConsolidation("u1", { ...period }, db);
  await addDemandes(created.id, "u1", { demandeIds: ["d1"] }, db);
  const result = await transmitConsolidation(created.id, "u1", db);
  assert.equal(result.status, "TRANSMISE");
  assert.ok(result.transmittedAt);
});

test("conservation du statut des demandes après transmission", async () => {
  const db = makeDb();
  const created = await createConsolidation("u1", { ...period }, db);
  await addDemandes(created.id, "u1", { demandeIds: ["d1"] }, db);
  const result = await transmitConsolidation(created.id, "u1", db);
  assert.equal(result.demandes[0]!.status, "EN_ATTENTE_DECISION");
});

test("refus de modification après transmission", async () => {
  const db = makeDb();
  const created = await createConsolidation("u1", { ...period }, db);
  await addDemandes(created.id, "u1", { demandeIds: ["d1"] }, db);
  await transmitConsolidation(created.id, "u1", db);
  await assert.rejects(
    () => addDemandes(created.id, "u1", { demandeIds: ["d2"] }, db),
    (err: any) => err.code === "CONSOLIDATION_NOT_DRAFT"
  );
});

test("refus de suppression d'une consolidation transmise", async () => {
  const db = makeDb();
  const created = await createConsolidation("u1", { ...period }, db);
  await addDemandes(created.id, "u1", { demandeIds: ["d1"] }, db);
  await transmitConsolidation(created.id, "u1", db);
  await assert.rejects(
    () => deleteConsolidation(created.id, "u1", db),
    (err: any) => err.code === "CONSOLIDATION_TRANSMITTED"
  );
});

test("suppression d'un brouillon sans suppression des demandes", async () => {
  const db = makeDb();
  const created = await createConsolidation("u1", { ...period }, db);
  await addDemandes(created.id, "u1", { demandeIds: ["d1", "d2"] }, db);
  await deleteConsolidation(created.id, "u1", db);
  await assert.rejects(
    () => getConsolidation(created.id, "u1", db),
    (err: any) => err.code === "NOT_FOUND"
  );
  const all = await listConsolidations("u1", db);
  assert.equal(all.length, 0);
});

test("contrôle des permissions", async () => {
  const db = makeDb({ manager: false });
  await assert.rejects(
    () => createConsolidation("u1", { ...period }, db),
    (err: any) => err.code === "FORBIDDEN"
  );
});

test("une seconde transmission est refusée et ne modifie pas transmittedAt", async () => {
  const db = makeDb();
  const created = await createConsolidation("u1", { ...period }, db);
  await addDemandes(created.id, "u1", { demandeIds: ["d1"] }, db);
  const first = await transmitConsolidation(created.id, "u1", db);
  const transmittedAt = first.transmittedAt;
  const auditCount = (db as any).__audits.length;

  await assert.rejects(
    () => transmitConsolidation(created.id, "u1", db),
    (err: any) => err.code === "CONSOLIDATION_NOT_DRAFT"
  );

  const row = (db as any).__consolidations.find((c: any) => c.id === created.id);
  assert.equal(row.transmittedAt.toISOString(), transmittedAt);
  assert.equal((db as any).__audits.length, auditCount);
});

test("une opération concurrente ne peut pas supprimer une consolidation transmise", async () => {
  const db = makeDb();
  const created = await createConsolidation("u1", { ...period }, db);
  await addDemandes(created.id, "u1", { demandeIds: ["d1"] }, db);
  await transmitConsolidation(created.id, "u1", db);

  await assert.rejects(
    () => deleteConsolidation(created.id, "u1", db),
    (err: any) => err.code === "CONSOLIDATION_TRANSMITTED"
  );
  const remaining = (db as any).__consolidations.filter((c: any) => c.id === created.id);
  assert.equal(remaining.length, 1);
  const demande = (db as any).__demandes.find((d: any) => d.id === "d1");
  assert.equal(demande.consolidationId, created.id);
});

function seedConsolidation(db: ConsolidationDb, ref: string, status: string, deptCodes: string[]) {
  const id = `cc-${ref}`;
  const now = new Date();
  const cons = {
    id,
    reference: ref,
    periodStart: new Date("2026-11-04T00:00:00Z"),
    periodEnd: new Date("2026-11-10T23:59:59Z"),
    status,
    createdById: "u1",
    transmittedAt: status === "TRANSMISE" ? now : null,
    createdAt: now,
    updatedAt: now,
  };
  (db as any).__consolidations.push(cons);
  deptCodes.forEach((code, i) => {
    (db as any).__demandes.push(makeDemande(`${ref}-d${i}`, id, code));
  });
  return id;
}

test("DFC scope '*' voit toutes les consolidations transmises", async () => {
  const db = makeDb({ manager: false, dfcScopes: ["*"], demandes: [] });
  seedConsolidation(db, "c1", "TRANSMISE", ["INFRA"]);
  seedConsolidation(db, "c2", "TRANSMISE", ["LOGISTIQUE"]);
  const list = await listConsolidations("u1", db);
  assert.equal(list.length, 2);
});

test("DFC scope départemental ne voit que ses départements", async () => {
  const db = makeDb({ manager: false, dfcScopes: ["INFRA"], demandes: [] });
  seedConsolidation(db, "c1", "TRANSMISE", ["INFRA"]);
  seedConsolidation(db, "c2", "TRANSMISE", ["LOGISTIQUE"]);
  const list = await listConsolidations("u1", db);
  assert.equal(list.length, 1);
  assert.equal(list[0]!.reference, "c1");
});

test("DFC ne voit que les demandes de son périmètre", async () => {
  const db = makeDb({ manager: false, dfcScopes: ["INFRA"], demandes: [] });
  const id = seedConsolidation(db, "c1", "TRANSMISE", ["INFRA", "LOGISTIQUE"]);
  const detail = await getConsolidation(id, "u1", db);
  assert.equal(detail.demandes.length, 1);
  assert.equal(detail.demandes[0]!.departmentCode, "INFRA");
});

test("consolidation sans demande dans le périmètre DFC refusée", async () => {
  const db = makeDb({ manager: false, dfcScopes: ["INFRA"], demandes: [] });
  const id = seedConsolidation(db, "c1", "TRANSMISE", ["LOGISTIQUE"]);
  await assert.rejects(
    () => getConsolidation(id, "u1", db),
    (err: any) => err.code === "NOT_FOUND"
  );
});

test("consolidation BROUILLON inaccessible à la DFC", async () => {
  const db = makeDb({ manager: false, dfcScopes: ["*"], demandes: [] });
  const id = seedConsolidation(db, "c1", "BROUILLON", ["INFRA"]);
  await assert.rejects(
    () => getConsolidation(id, "u1", db),
    (err: any) => err.code === "NOT_FOUND"
  );
});

test("DFC sans habilitation active est refusé", async () => {
  const db = makeDb({ manager: false, dfcExpired: true, demandes: [] });
  const id = seedConsolidation(db, "c1", "TRANSMISE", ["INFRA"]);
  await assert.rejects(
    () => getConsolidation(id, "u1", db),
    (err: any) => err.code === "NOT_FOUND"
  );
  const list = await listConsolidations("u1", db);
  assert.equal(list.length, 0);
});

test("accès DG/CPMP non régressé (non-DFC, non-manager)", async () => {
  const db = makeDb({ manager: false, dfcScopes: [], demandes: [] });
  const id = seedConsolidation(db, "c1", "TRANSMISE", ["INFRA", "LOGISTIQUE"]);
  const detail = await getConsolidation(id, "u1", db);
  assert.equal(detail.demandes.length, 2);
});

test("accès DPMG/administrateurs inchangé (voit tout)", async () => {
  const db = makeDb({ manager: true, demandes: [] });
  seedConsolidation(db, "c1", "BROUILLON", ["INFRA"]);
  seedConsolidation(db, "c2", "TRANSMISE", ["LOGISTIQUE"]);
  const list = await listConsolidations("u1", db);
  assert.equal(list.length, 2);
});


test("consultation DFC autoris�e g�n�re un audit", async () => {
  const db = makeDb({ manager: false, dfcScopes: ["*"], demandes: [] });
  const id = seedConsolidation(db, "c1", "TRANSMISE", ["INFRA"]);
  const before = (db as any).__audits.length;
  await getConsolidation(id, "u1", db);
  assert.equal((db as any).__audits.length, before + 1);
  assert.equal((db as any).__audits[before].action, "CONSULTATION_DFC_CONSOLIDATION");
  assert.equal((db as any).__audits[before].targetId, id);
});

test("consolidation hors scope DFC ne g�n�re aucun audit", async () => {
  const db = makeDb({ manager: false, dfcScopes: ["OTHER"], demandes: [] });
  const id = seedConsolidation(db, "c1", "TRANSMISE", ["INFRA"]);
  const before = (db as any).__audits.length;
  await assert.rejects(() => getConsolidation(id, "u1", db), (err: any) => err.code === "NOT_FOUND");
  assert.equal((db as any).__audits.length, before);
});

test("consolidation en brouillon ne g�n�re aucun audit DFC", async () => {
  const db = makeDb({ manager: false, dfcScopes: ["*"], demandes: [] });
  const id = seedConsolidation(db, "c1", "BROUILLON", ["INFRA"]);
  const before = (db as any).__audits.length;
  await assert.rejects(() => getConsolidation(id, "u1", db), (err: any) => err.code === "NOT_FOUND");
  assert.equal((db as any).__audits.length, before);
});

test("la consultation de la liste ne g�n�re aucun audit", async () => {
  const db = makeDb({ manager: false, dfcScopes: ["*"], demandes: [] });
  seedConsolidation(db, "c1", "TRANSMISE", ["INFRA"]);
  const before = (db as any).__audits.length;
  await listConsolidations("u1", db);
  assert.equal((db as any).__audits.length, before);
});


test("compl�tude : toutes les demandes ont un avis", async () => {
  const db = makeDb({ manager: true, demandes: [makeDemande("d1"), makeDemande("d2")] });
  const id = seedConsolidation(db, "c1", "BROUILLON", ["INFRA", "INFRA"]);
  // attach demandes to consolidation
  const created = await createConsolidation("u1", { ...period }, db);
  const ds = (db as any).__demandes.filter((d: any) => d.id === "d1" || d.id === "d2");
  ds.forEach((d: any) => (d.consolidationId = created.id));
  const res = await getAvisCompleteness(created.id, "u1", db);
  assert.equal(res.complete, true);
  assert.equal(res.totalDemandes, 2);
  assert.equal(res.demandesSansAvis, 0);
});

test("compl�tude : une demande sans avis ? incomplet", async () => {
  const db = makeDb({ manager: true, demandes: [makeDemande("d1"), makeDemande("d2")], avisDemandeIds: ["d1"] });
  const created = await createConsolidation("u1", { ...period }, db);
  const ds = (db as any).__demandes.filter((d: any) => d.id === "d1" || d.id === "d2");
  ds.forEach((d: any) => (d.consolidationId = created.id));
  const res = await getAvisCompleteness(created.id, "u1", db);
  assert.equal(res.complete, false);
  assert.equal(res.demandesSansAvis, 1);
});

test("compl�tude : plusieurs demandes m�me d�partement ? chacune n�cessite son avis", async () => {
  const db = makeDb({ manager: true, demandes: [makeDemande("d1"), makeDemande("d2")], avisDemandeIds: ["d1"] });
  const created = await createConsolidation("u1", { ...period }, db);
  const ds = (db as any).__demandes.filter((d: any) => d.id === "d1" || d.id === "d2");
  ds.forEach((d: any) => (d.consolidationId = created.id));
  const res = await getAvisCompleteness(created.id, "u1", db);
  assert.equal(res.demandesSansAvis, 1);
  assert.equal(res.demandesAvecAvis, 1);
});

test("compl�tude : consolidation sans demande ? complete (vacuement)", async () => {
  const db = makeDb({ manager: true, demandes: [] });
  const id = seedConsolidation(db, "c1", "BROUILLON", []);
  const res = await getAvisCompleteness(id, "u1", db);
  assert.equal(res.complete, true);
  assert.equal(res.totalDemandes, 0);
});

test("transmission avec avis manquant : refus�e", async () => {
  const db = makeDb({ manager: true, demandes: [makeDemande("d1"), makeDemande("d2")], avisDemandeIds: ["d1"] });
  const created = await createConsolidation("u1", { ...period }, db);
  const ds = (db as any).__demandes.filter((d: any) => d.id === "d1" || d.id === "d2");
  ds.forEach((d: any) => (d.consolidationId = created.id));
  await assert.rejects(
    () => transmitConsolidation(created.id, "u1", db),
    (err: any) => err.code === "CONSOLIDATION_AVIS_INCOMPLET"
  );
  const row = (db as any).__consolidations.find((c: any) => c.id === created.id);
  assert.equal(row.status, "BROUILLON");
});

test("transmission avec tous les avis : autoris�e", async () => {
  const db = makeDb({ manager: true, demandes: [makeDemande("d1"), makeDemande("d2")] });
  const created = await createConsolidation("u1", { ...period }, db);
  const ds = (db as any).__demandes.filter((d: any) => d.id === "d1" || d.id === "d2");
  ds.forEach((d: any) => (d.consolidationId = created.id));
  const res = await transmitConsolidation(created.id, "u1", db);
  assert.equal(res.status, "TRANSMISE");
});
