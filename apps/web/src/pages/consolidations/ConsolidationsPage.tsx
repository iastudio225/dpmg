import { useEffect, useState } from "react";
import { consolidationsApi, demandesApi } from "../../services/api";
import { ConsolidationResponse, DemandeResponse } from "@dpmg/shared";

export function ConsolidationsPage() {
  const [items, setItems] = useState<ConsolidationResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<ConsolidationResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [demandes, setDemandes] = useState<DemandeResponse[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [creating, setCreating] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [addSelected, setAddSelected] = useState<Set<string>>(new Set());
  const [confirmTransmit, setConfirmTransmit] = useState(false);
  const [transmitting, setTransmitting] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try { setItems(await consolidationsApi.list()); }
    catch (e) { setError(e instanceof Error ? e.message : "Erreur"); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const openDetail = async (id: string) => {
    setDetailLoading(true);
    try { setSelectedDetail(await consolidationsApi.get(id)); }
    catch (e) { setError(e instanceof Error ? e.message : "Erreur"); }
    finally { setDetailLoading(false); }
  };

  const openNew = async () => {
    setShowNew(true);
    try { setDemandes(await demandesApi.list()); } catch { setDemandes([]); }
  };

  const toggle = (id: string, set: (f: (p: Set<string>) => Set<string>) => void) => {
    set((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };

  const create = async () => {
    if (selected.size === 0 || !periodStart || !periodEnd) return;
    setCreating(true);
    try {
      const c = await consolidationsApi.create({ periodStart: new Date(periodStart).toISOString(), periodEnd: new Date(periodEnd).toISOString() });
      await consolidationsApi.addDemandes(c.id, { demandeIds: Array.from(selected) });
      setShowNew(false); setSelected(new Set()); setPeriodStart(""); setPeriodEnd("");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Erreur"); }
    finally { setCreating(false); }
  };

  const removeDemande = async (demandeId: string) => {
    if (!selectedDetail) return;
    try {
      const updated = await consolidationsApi.removeDemande(selectedDetail.id, demandeId);
      setSelectedDetail(updated);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Erreur"); }
  };

  const openAdd = async () => {
    setShowAdd(true);
    try { setDemandes(await demandesApi.list()); } catch { setDemandes([]); }
  };

  const transmit = async () => {
    if (!selectedDetail) return;
    setTransmitting(true);
    try {
      const updated = await consolidationsApi.transmit(selectedDetail.id);
      setSelectedDetail(updated);
      setConfirmTransmit(false);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Erreur"); }
    finally { setTransmitting(false); }
  };

  const addDemandes = async () => {
    if (!selectedDetail || addSelected.size === 0) return;
    try {
      const updated = await consolidationsApi.addDemandes(selectedDetail.id, { demandeIds: Array.from(addSelected) });
      setSelectedDetail(updated);
      setAddSelected(new Set()); setShowAdd(false);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Erreur"); }
  };

  const isBrouillon = selectedDetail?.status === "BROUILLON";

  return (
    <div style={{ padding: 24 }}>
      <h1>Consolidations DPMG</h1>
      <button onClick={openNew}>Nouvelle consolidation</button>
      {loading && <p>Chargement…</p>}
      {error && <p style={{ color: "red" }}>{error}</p>}
      {!loading && items.length === 0 && <p>Aucune consolidation.</p>}
      <ul>
        {items.map((c) => (
          <li key={c.id}>
            <button onClick={() => openDetail(c.id)}>{c.reference}</button> — {c.status} — {c.demandes.length} demandes
          </li>
        ))}
      </ul>

      {detailLoading && <p>Chargement détail…</p>}

      {selectedDetail && (
        <div style={{ marginTop: 24, border: "1px solid #ccc", padding: 16 }}>
          <h2>{selectedDetail.reference}</h2>
          <p>Statut: {selectedDetail.status}</p>
          <p>Demandes: {selectedDetail.demandes.length}</p>
          {isBrouillon && <button onClick={openAdd}>Ajouter des demandes</button>}
          {isBrouillon && <button onClick={() => setConfirmTransmit(true)} style={{ marginLeft: 8 }}>Transmettre la consolidation</button>}
          <ul>
            {selectedDetail.demandes.map((d) => (
              <li key={d.id}>
                {d.reference ?? d.id} — {d.title}
                {isBrouillon && <button onClick={() => removeDemande(d.id)} style={{ marginLeft: 8 }}>Retirer</button>}
              </li>
            ))}
          </ul>
          <button onClick={() => setSelectedDetail(null)}>Fermer</button>

          {showAdd && (
            <div style={{ marginTop: 16 }}>
              <p>{addSelected.size} sélectionnées</p>
              <table>
                <tbody>
                  {demandes.map((d) => (
                    <tr key={d.id}>
                      <td><input type="checkbox" checked={addSelected.has(d.id)} onChange={() => toggle(d.id, setAddSelected)} /></td>
                      <td>{d.reference ?? d.id}</td>
                      <td>{d.title}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button onClick={addDemandes} disabled={addSelected.size === 0}>Ajouter</button>
              <button onClick={() => setShowAdd(false)}>Annuler</button>
            </div>
          )}
        </div>
      )}

      {confirmTransmit && (
        <div style={{ marginTop: 16, border: "1px solid #999", padding: 16 }}>
          <p>Vous êtes sur le point de transmettre cette consolidation. Après transmission, son contenu ne pourra plus être modifié. Voulez-vous continuer ?</p>
          <button onClick={transmit} disabled={transmitting}>Confirmer la transmission</button>
          <button onClick={() => setConfirmTransmit(false)}>Annuler</button>
        </div>
      )}

      {showNew && (
        <div style={{ marginTop: 24, border: "1px solid #ccc", padding: 16 }}>
          <h2>Nouvelle consolidation</h2>
          <div>
            <label>Début <input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} /></label>
            <label> Fin <input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} /></label>
          </div>
          <p>{selected.size} demandes sélectionnées</p>
          <table>
            <tbody>
              {demandes.map((d) => (
                <tr key={d.id}>
                  <td><input type="checkbox" checked={selected.has(d.id)} onChange={() => toggle(d.id, setSelected)} /></td>
                  <td>{d.reference ?? d.id}</td>
                  <td>{d.title}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button onClick={create} disabled={creating || selected.size === 0}>Créer le brouillon</button>
          <button onClick={() => setShowNew(false)}>Annuler</button>
        </div>
      )}
    </div>
  );
}
