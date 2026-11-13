import "./test-env";
import test from "node:test";
import assert from "node:assert/strict";
import { prisma } from "./lib/prisma";
import * as prestataireSvc from "./services/prestataire.service";
import * as devisSvc from "./services/devis.service";

function resetMocks() {
  (prisma as any).prestataire = {};
  (prisma as any).demande = {};
  (prisma as any).devis = {};
  (prisma as any).document = {};
}

test("prestataire create", async () => {
  resetMocks();
  (prisma as any).prestataire.create = async (a: any) => ({ id: "p1", ...a.data });
  const r = await prestataireSvc.createPrestataire({ nom: "Acme" }, "u1");
  assert.equal((r as any).nom, "Acme");
});

test("prestataire inactif cannot create devis", async () => {
  resetMocks();
  (prisma as any).demande = { findUnique: async () => ({ id: "d1" }) };
  (prisma as any).prestataire = { findUnique: async () => ({ id: "p1", isActive: false }) };
  await assert.rejects(() => devisSvc.createDevis({ demandeId: "d1", prestataireId: "p1" }, "u1"), /inactif/i);
});

test("devis financial validation negative HT", async () => {
  resetMocks();
  (prisma as any).demande = { findUnique: async () => ({ id: "d1" }) };
  (prisma as any).prestataire = { findUnique: async () => ({ id: "p1", isActive: true }) };
  await assert.rejects(() => devisSvc.createDevis({ demandeId: "d1", prestataireId: "p1", montantHT: -10 }, "u1"), /négatif/i);
});

test("devis financial validation negative TVA", async () => {
  resetMocks();
  (prisma as any).demande = { findUnique: async () => ({ id: "d1" }) };
  (prisma as any).prestataire = { findUnique: async () => ({ id: "p1", isActive: true }) };
  await assert.rejects(() => devisSvc.createDevis({ demandeId: "d1", prestataireId: "p1", montantTVA: -10 }, "u1"), /négatif/i);
});

test("devis financial validation negative TTC", async () => {
  resetMocks();
  (prisma as any).demande = { findUnique: async () => ({ id: "d1" }) };
  (prisma as any).prestataire = { findUnique: async () => ({ id: "p1", isActive: true }) };
  await assert.rejects(() => devisSvc.createDevis({ demandeId: "d1", prestataireId: "p1", montantTTC: -10 }, "u1"), /négatif/i);
});

test("devis financial coherence HT+TVA=TTC", async () => {
  resetMocks();
  (prisma as any).demande = { findUnique: async () => ({ id: "d1" }) };
  (prisma as any).prestataire = { findUnique: async () => ({ id: "p1", isActive: true }) };
  (prisma as any).devis = { create: async (a: any) => ({ id: "dv1", ...a.data }) };
  const r = await devisSvc.createDevis({ demandeId: "d1", prestataireId: "p1", montantHT: 1000, montantTVA: 180, montantTTC: 1180 }, "u1");
  assert.equal((r as any).montantTTC, 1180);
});

test("devis financial incoherence rejected", async () => {
  resetMocks();
  (prisma as any).demande = { findUnique: async () => ({ id: "d1" }) };
  (prisma as any).prestataire = { findUnique: async () => ({ id: "p1", isActive: true }) };
  await assert.rejects(() => devisSvc.createDevis({ demandeId: "d1", prestataireId: "p1", montantHT: 1000, montantTVA: 180, montantTTC: 1200 }, "u1"), /Incohérence/i);
});

test("devis TTC<HT rejected", async () => {
  resetMocks();
  (prisma as any).demande = { findUnique: async () => ({ id: "d1" }) };
  (prisma as any).prestataire = { findUnique: async () => ({ id: "p1", isActive: true }) };
  await assert.rejects(() => devisSvc.createDevis({ demandeId: "d1", prestataireId: "p1", montantHT: 1000, montantTTC: 900 }, "u1"), /TTC < HT/i);
});

test("devis delete blocked when documents", async () => {
  resetMocks();
  (prisma as any).devis = { findUnique: async () => ({ id: "dv1", demandeId: "d1", documents: [{ id: "doc1" }] }), delete: async () => ({}) };
  (prisma as any).demande = { findUnique: async () => ({ id: "d1" }) };
  await assert.rejects(() => devisSvc.deleteDevis("dv1"), /documents/i);
});

test("devis pagination", async () => {
  resetMocks();
  (prisma as any).demande = { findUnique: async () => ({ id: "d1" }) };
  (prisma as any).devis = { findMany: async () => [], count: async () => 0 };
  const r = await devisSvc.listDevisByDemande("d1", 1, 10);
  assert.equal((r as any).total, 0);
  assert.equal((r as any).totalPages, 0);
});

test("devis pagination with items", async () => {
  resetMocks();
  (prisma as any).demande = { findUnique: async () => ({ id: "d1" }) };
  (prisma as any).devis = { findMany: async () => [{ id: "a" }, { id: "b" }], count: async () => 2 };
  const r = await devisSvc.listDevisByDemande("d1", 1, 10);
  assert.equal((r as any).items.length, 2);
  assert.equal((r as any).total, 2);
  assert.equal((r as any).totalPages, 1);
});
