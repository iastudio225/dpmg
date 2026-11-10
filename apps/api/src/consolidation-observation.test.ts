import test from "node:test";
import assert from "node:assert/strict";
import type { ConsolidationDb } from "./services/consolidation.service";
import type { ObservationDb } from "./services/consolidation-observation.service";
import {
  addConsolidationObservation,
  listConsolidationObservations,
} from "./services/consolidation-observation.service";

function makeDb(opts: { dgActive?: boolean; cpmpActive?: boolean; userStatus?: string } = {}) {
  const dgActive = opts.dgActive ?? true;
  const cpmpActive = opts.cpmpActive ?? true;
  const userStatus = opts.userStatus ?? "ACTIVE";

  const consolidations: any[] = [
    {
      id: "c1",
      status: "TRANSMISE",
      demandes: [{ department: { code: "INFRA" } }],
    },
    { id: "c2", status: "BROUILLON", demandes: [{ department: { code: "INFRA" } }] },
  ];
  const observations: any[] = [];
  const audits: any[] = [];
  let seq = 0;

  const db: any = {
    user: {
      async findUnique({ where }: any) {
        return { status: userStatus };
      },
    },
    userStructureRole: {
      async findMany({ where }: any) {
        const roles: any[] = [];
        const roleFilter = where?.role;
        const wantDg = !roleFilter || roleFilter === "DG_USER" || (roleFilter?.in && roleFilter.in.includes("DG_USER"));
        const wantCpmp = !roleFilter || roleFilter === "CPMP_USER" || (roleFilter?.in && roleFilter.in.includes("CPMP_USER"));
        if (dgActive && wantDg) {
          roles.push({ role: "DG_USER", scope: "*", startDate: new Date("2020-01-01"), endDate: null });
        }
        if (cpmpActive && wantCpmp) {
          roles.push({ role: "CPMP_USER", scope: "*", startDate: new Date("2020-01-01"), endDate: null });
        }
        return roles;
      },
    },
    consolidation: {
      async findUnique({ where }: any) {
        return consolidations.find((c) => c.id === where.id) ?? null;
      },
    },
    consolidationObservation: {
      async create({ data }: any) {
        const row = {
          id: `o${++seq}`,
          consolidationId: data.consolidationId,
          actorId: data.actorId,
          role: data.role,
          commentaire: data.commentaire,
          createdAt: new Date(),
        };
        observations.push(row);
        return row;
      },
      async findMany({ where, orderBy }: any) {
        let rows = observations.filter((o) => o.consolidationId === where.consolidationId);
        rows = rows.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
        return rows;
      },
    },
    adminAuditLog: {
      async create({ data }: any) {
        audits.push(data);
        return data;
      },
    },
    async $transaction(fn: any) {
      return fn(db);
    },
  };

  (db as any).__observations = observations;
  (db as any).__audits = audits;
  (db as any).__consolidations = consolidations;
  return db as ObservationDb;
}

test("ajout réussi d'une observation DG", async () => {
  const db = makeDb({ dgActive: true, cpmpActive: false });
  const res = await addConsolidationObservation("c1", "Obs DG", "u1", db as any);
  assert.equal(res.role, "DG_USER");
  assert.equal(res.commentaire, "Obs DG");
});

test("ajout réussi d'une observation CPMP", async () => {
  const db = makeDb({ dgActive: false, cpmpActive: true });
  const res = await addConsolidationObservation("c1", "Obs CPMP", "u1", db as any);
  assert.equal(res.role, "CPMP_USER");
});

test("refus d'un utilisateur inactif", async () => {
  const db = makeDb({ userStatus: "SUSPENDED" });
  await assert.rejects(
    () => addConsolidationObservation("c1", "x", "u1", db as any),
    (err: any) => err.code === "FORBIDDEN"
  );
});

test("refus d'une habilitation expirée (aucune habilitation active)", async () => {
  const db = makeDb({ dgActive: false, cpmpActive: false });
  await assert.rejects(
    () => addConsolidationObservation("c1", "x", "u1", db as any),
    (err: any) => err.code === "FORBIDDEN"
  );
});

test("refus d'un scope non autorisé", async () => {
  // Simulate scope mismatch by making consolidation department code different
  const db = makeDb({ dgActive: true, cpmpActive: false });
  (db as any).__consolidations = (db as any).__consolidations ?? [];
  // change department code to something not covered by scope "*"? scope "*" covers all, so use a non-* scope
  // Override: make db return habilitation with scope "OTHER"
  db.userStructureRole.findMany = async () => [
    { role: "DG_USER", scope: "OTHER", startDate: new Date("2020-01-01"), endDate: null },
  ];
  await assert.rejects(
    () => addConsolidationObservation("c1", "x", "u1", db as any),
    (err: any) => err.code === "FORBIDDEN"
  );
});

test("refus d'une consolidation inexistante", async () => {
  const db = makeDb();
  await assert.rejects(
    () => addConsolidationObservation("nope", "x", "u1", db as any),
    (err: any) => err.code === "NOT_FOUND"
  );
});

test("refus d'une consolidation en brouillon", async () => {
  const db = makeDb();
  await assert.rejects(
    () => addConsolidationObservation("c2", "x", "u1", db as any),
    (err: any) => err.code === "NOT_FOUND"
  );
});

test("refus d'un commentaire vide", async () => {
  const db = makeDb();
  await assert.rejects(
    () => addConsolidationObservation("c1", "   ", "u1", db as any),
    (err: any) => err.code === "VALIDATION_ERROR"
  );
});

test("consultation des observations d'une consolidation transmise", async () => {
  const db = makeDb();
  await addConsolidationObservation("c1", "first", "u1", db as any);
  await addConsolidationObservation("c1", "second", "u1", db as any);
  const list = await listConsolidationObservations("c1", "u1", db as any);
  assert.equal(list.length, 2);
  assert.equal(list[0]!.commentaire, "first");
  assert.equal(list[1]!.commentaire, "second");
});

test("refus de consultation d'une consolidation en brouillon", async () => {
  const db = makeDb();
  await assert.rejects(
    () => listConsolidationObservations("c2", "u1", db as any),
    (err: any) => err.code === "NOT_FOUND"
  );
});

test("tri chronologique des observations", async () => {
  const db = makeDb();
  const o1 = await addConsolidationObservation("c1", "a", "u1", db as any);
  // force later date
  (db as any).__observations[0].createdAt = new Date("2026-01-01T00:00:00Z");
  const o2 = await addConsolidationObservation("c1", "b", "u1", db as any);
  (db as any).__observations[1].createdAt = new Date("2026-01-02T00:00:00Z");
  const list = await listConsolidationObservations("c1", "u1", db as any);
  assert.equal(list[0]!.commentaire, "a");
  assert.equal(list[1]!.commentaire, "b");
});

test("vérification de l'absence de modification des statuts", async () => {
  const db = makeDb();
  const consBefore = (db as any).__consolidations.find((c: any) => c.id === "c1");
  const statusBefore = consBefore.status;
  await addConsolidationObservation("c1", "obs", "u1", db as any);
  assert.equal(consBefore.status, statusBefore);
});

test("vérification de la traçabilité de l'auteur et du rôle", async () => {
  const db = makeDb({ dgActive: true, cpmpActive: false });
  const res = await addConsolidationObservation("c1", "obs", "u1", db as any);
  assert.equal(res.actorId, "u1");
  assert.equal(res.role, "DG_USER");
  assert.ok(res.createdAt);
  assert.equal((db as any).__audits.length, 1);
  assert.equal((db as any).__audits[0].action, "CREATE_CONSOLIDATION_OBSERVATION");
});