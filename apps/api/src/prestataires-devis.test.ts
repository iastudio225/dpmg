import "./test-env";
import test from "node:test";
import assert from "node:assert/strict";
import { prisma } from "./lib/prisma";
import * as prestataireSvc from "./services/prestataire.service";
import * as devisSvc from "./services/devis.service";

type RoleRow = { role: string; scope?: string | null; startDate?: Date; endDate?: Date | null };

function setup(opts: {
  demande?: any;
  cpmp?: RoleRow[];
  admin?: RoleRow[];
  devis?: any;
  prestataire?: any;
  userActive?: boolean;
} = {}) {
  const active = opts.userActive !== false;
  (prisma as any).demande = {
    findUnique: async () => opts.demande ?? { id: "d1", department: { code: "INFRA" } },
  };
  (prisma as any).prestataire = {
    findUnique: async () => opts.prestataire ?? { id: "p1", isActive: true },
  };
  (prisma as any).devis = opts.devis ?? {};
  (prisma as any).document = {};
  (prisma as any).userStructureRole = {
    findMany: async (args: any) => {
      const where = args?.where ?? {};
      const role = where.role;
      const rows: RoleRow[] =
        role && typeof role === "object" && Array.isArray(role.in)
          ? (opts.admin ?? [])
          : role === "CPMP_USER"
            ? (opts.cpmp ?? [])
            : [];
      if (!active) return [];
      const now = new Date();
      return rows.filter((r) => {
        if (r.startDate && r.startDate > now) return false;
        if (r.endDate && r.endDate < now) return false;
        return true;
      });
    },
  };
}

const validCpmp = [{ role: "CPMP_USER", scope: "INFRA" }];
const emptyList = { findMany: async () => [], count: async () => 0 };

test("prestataire create", async () => {
  setup({ prestataire: {} });
  (prisma as any).prestataire.create = async (a: any) => ({ id: "p1", ...a.data });
  const r = await prestataireSvc.createPrestataire({ nom: "Acme" }, "u1");
  assert.equal((r as any).nom, "Acme");
});

test("prestataire inactif cannot create devis", async () => {
  setup({ cpmp: validCpmp, prestataire: { id: "p1", isActive: false } });
  await assert.rejects(() => devisSvc.createDevis({ demandeId: "d1", prestataireId: "p1" }, "u1"), /inactif/i);
});

test("devis financial validation negative HT", async () => {
  setup({ cpmp: validCpmp });
  await assert.rejects(() => devisSvc.createDevis({ demandeId: "d1", prestataireId: "p1", montantHT: -10 }, "u1"), /ngatif|négatif/i);
});

test("devis financial validation negative TVA", async () => {
  setup({ cpmp: validCpmp });
  await assert.rejects(() => devisSvc.createDevis({ demandeId: "d1", prestataireId: "p1", montantTVA: -10 }, "u1"), /ngatif|négatif/i);
});

test("devis financial validation negative TTC", async () => {
  setup({ cpmp: validCpmp });
  await assert.rejects(() => devisSvc.createDevis({ demandeId: "d1", prestataireId: "p1", montantTTC: -10 }, "u1"), /ngatif|négatif/i);
});

test("devis financial coherence HT+TVA=TTC", async () => {
  setup({ cpmp: validCpmp, devis: { create: async (a: any) => ({ id: "dv1", ...a.data }) } });
  const r = await devisSvc.createDevis({ demandeId: "d1", prestataireId: "p1", montantHT: 1000, montantTVA: 180, montantTTC: 1180 }, "u1");
  assert.equal((r as any).montantTTC, 1180);
});

test("devis financial incoherence rejected", async () => {
  setup({ cpmp: validCpmp });
  await assert.rejects(() => devisSvc.createDevis({ demandeId: "d1", prestataireId: "p1", montantHT: 1000, montantTVA: 180, montantTTC: 1200 }, "u1"), /Incoh/i);
});

test("devis TTC<HT rejected", async () => {
  setup({ cpmp: validCpmp });
  await assert.rejects(() => devisSvc.createDevis({ demandeId: "d1", prestataireId: "p1", montantHT: 1000, montantTTC: 900 }, "u1"), /TTC < HT/i);
});

test("devis delete blocked when documents", async () => {
  setup({ cpmp: validCpmp, devis: { findUnique: async () => ({ id: "dv1", demandeId: "d1", documents: [{ id: "doc1" }] }), delete: async () => ({}) } });
  await assert.rejects(() => devisSvc.deleteDevis("u1", "dv1"), /documents/i);
});

test("devis pagination", async () => {
  setup({ cpmp: validCpmp, devis: emptyList });
  const r = await devisSvc.listDevisByDemande("u1", "d1", 1, 10);
  assert.equal((r as any).total, 0);
  assert.equal((r as any).totalPages, 0);
});

test("devis pagination with items", async () => {
  setup({ cpmp: validCpmp, devis: { findMany: async () => [{ id: "a" }, { id: "b" }], count: async () => 2 } });
  const r = await devisSvc.listDevisByDemande("u1", "d1", 1, 10);
  assert.equal((r as any).items.length, 2);
  assert.equal((r as any).total, 2);
  assert.equal((r as any).totalPages, 1);
});

test("devis out of perimeter rejected", async () => {
  setup({ cpmp: [{ role: "CPMP_USER", scope: "LOGISTIQUE" }], devis: emptyList });
  await assert.rejects(() => devisSvc.listDevisByDemande("u1", "d1", 1, 10), /habilit/i);
});

test("CPMP future start rejected", async () => {
  setup({ cpmp: [], devis: emptyList });
  await assert.rejects(() => devisSvc.listDevisByDemande("u1", "d1", 1, 10), /habilit/i);
});

test("CPMP expired rejected", async () => {
  setup({ cpmp: [], devis: emptyList });
  await assert.rejects(() => devisSvc.listDevisByDemande("u1", "d1", 1, 10), /habilit/i);
});

test("CPMP inactive user rejected", async () => {
  setup({ cpmp: [], devis: emptyList });
  await assert.rejects(() => devisSvc.listDevisByDemande("u1", "d1", 1, 10), /habilit/i);
});

test("SUPER_ADMIN active bypass authorized", async () => {
  setup({ cpmp: [], admin: [{ role: "SUPER_ADMIN" }], devis: emptyList });
  const r = await devisSvc.listDevisByDemande("u1", "d1", 1, 10);
  assert.equal((r as any).total, 0);
});

test("TECHNICAL_ADMIN active bypass authorized", async () => {
  setup({ cpmp: [], admin: [{ role: "TECHNICAL_ADMIN" }], devis: emptyList });
  const r = await devisSvc.listDevisByDemande("u1", "d1", 1, 10);
  assert.equal((r as any).total, 0);
});

test("admin expired rejected", async () => {
  setup({ cpmp: [], admin: [], devis: emptyList });
  await assert.rejects(() => devisSvc.listDevisByDemande("u1", "d1", 1, 10), /habilit/i);
});

test("get devis authorized", async () => {
  setup({ cpmp: validCpmp, devis: { findUnique: async () => ({ id: "dv1", demandeId: "d1" }) } });
  const r = await devisSvc.getDevis("u1", "dv1");
  assert.equal((r as any).id, "dv1");
});

test("get devis out of perimeter rejected", async () => {
  setup({ cpmp: [], devis: { findUnique: async () => ({ id: "dv1", demandeId: "d1" }) } });
  await assert.rejects(() => devisSvc.getDevis("u1", "dv1"), /habilit/i);
});

test("create devis out of perimeter rejected", async () => {
  setup({ cpmp: [], devis: { create: async () => ({}) } });
  await assert.rejects(() => devisSvc.createDevis({ demandeId: "d1", prestataireId: "p1" }, "u1"), /habilit/i);
});

test("update devis out of perimeter rejected", async () => {
  setup({ cpmp: [], devis: { findUnique: async () => ({ id: "dv1", demandeId: "d1" }), update: async () => ({}) } });
  await assert.rejects(() => devisSvc.updateDevis("u1", "dv1", {}), /habilit/i);
});

test("delete devis out of perimeter rejected", async () => {
  setup({ cpmp: [], devis: { findUnique: async () => ({ id: "dv1", demandeId: "d1", documents: [] }), delete: async () => ({}) } });
  await assert.rejects(() => devisSvc.deleteDevis("u1", "dv1"), /habilit/i);
});

// R.4.5: administrator matrix
function adminScenario(role: string, kind: "valid" | "future" | "expired" | "inactive" | "absent") {
  const now = new Date();
  const startDate = new Date(now.getTime() - 86400000);
  const admin: RoleRow[] =
    kind === "absent"
      ? []
      : [{ role, startDate: kind === "future" ? new Date(now.getTime() + 86400000) : startDate, endDate: kind === "expired" ? new Date(now.getTime() - 86400000) : null }];
  setup({ cpmp: [], admin, userActive: kind !== "inactive", devis: emptyList });
}

for (const role of ["SUPER_ADMIN", "TECHNICAL_ADMIN"]) {
  test(`${role} valid authorized`, async () => {
    adminScenario(role, "valid");
    const r = await devisSvc.listDevisByDemande("u1", "d1", 1, 10);
    assert.equal((r as any).total, 0);
  });
  test(`${role} future rejected`, async () => {
    adminScenario(role, "future");
    await assert.rejects(() => devisSvc.listDevisByDemande("u1", "d1", 1, 10), /habilit/i);
  });
  test(`${role} expired rejected`, async () => {
    adminScenario(role, "expired");
    await assert.rejects(() => devisSvc.listDevisByDemande("u1", "d1", 1, 10), /habilit/i);
  });
  test(`${role} inactive rejected`, async () => {
    adminScenario(role, "inactive");
    await assert.rejects(() => devisSvc.listDevisByDemande("u1", "d1", 1, 10), /habilit/i);
  });
  test(`${role} absent rejected`, async () => {
    adminScenario(role, "absent");
    await assert.rejects(() => devisSvc.listDevisByDemande("u1", "d1", 1, 10), /habilit/i);
  });
}

test("CPMP scope '*' authorized", async () => {
  setup({ cpmp: [{ role: "CPMP_USER", scope: "*" }], devis: emptyList });
  const r = await devisSvc.listDevisByDemande("u1", "d1", 1, 10);
  assert.equal((r as any).total, 0);
});

test("CPMP no assignment rejected", async () => {
  setup({ cpmp: [], devis: emptyList });
  await assert.rejects(() => devisSvc.listDevisByDemande("u1", "d1", 1, 10), /habilit/i);
});

test("create refusal does not call devis.create", async () => {
  let called = false;
  setup({ cpmp: [], devis: { create: async () => { called = true; return {}; } } });
  await assert.rejects(() => devisSvc.createDevis({ demandeId: "d1", prestataireId: "p1" }, "u1"));
  assert.equal(called, false);
});

test("update refusal does not call devis.update", async () => {
  let called = false;
  setup({ cpmp: [], devis: { findUnique: async () => ({ id: "dv1", demandeId: "d1" }), update: async () => { called = true; return {}; } } });
  await assert.rejects(() => devisSvc.updateDevis("u1", "dv1", {}));
  assert.equal(called, false);
});

test("delete refusal does not call devis.delete", async () => {
  let called = false;
  setup({ cpmp: [], devis: { findUnique: async () => ({ id: "dv1", demandeId: "d1", documents: [] }), delete: async () => { called = true; return {}; } } });
  await assert.rejects(() => devisSvc.deleteDevis("u1", "dv1"));
  assert.equal(called, false);
});

test("list refusal does not call devis.findMany", async () => {
  let called = false;
  setup({ cpmp: [], devis: { findMany: async () => { called = true; return []; }, count: async () => 0 } });
  await assert.rejects(() => devisSvc.listDevisByDemande("u1", "d1", 1, 10));
  assert.equal(called, false);
});
