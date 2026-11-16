import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { devisApi, prestatairesApi, demandesApi } from "../../services/api";

export function CpmpDemandeDetailPage() {
  const { id } = useParams();
  const [demande, setDemande] = useState<any | null>(null);
  const [devis, setDevis] = useState<any[]>([]);
  const [prestataires, setPrestataires] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPrestataire, setSelectedPrestataire] = useState("");
  const [montantHT, setMontantHT] = useState("");
  const [montantTTC, setMontantTTC] = useState("");

  const load = async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      try { setDemande(await demandesApi.get(id)); } catch { setDemande(null); }
      const res = await devisApi.listByDemande(id);
      setDevis(Array.isArray(res) ? res : (res.items ?? []));
      const pres = await prestatairesApi.list({ isActive: true });
      setPrestataires(Array.isArray(pres) ? pres : (pres.items ?? []));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  const create = async () => {
    if (!id || !selectedPrestataire) return;
    try {
      await devisApi.create({
        demandeId: id,
        prestataireId: selectedPrestataire,
        montantHT: montantHT ? Number(montantHT) : undefined,
        montantTTC: montantTTC ? Number(montantTTC) : undefined,
      });
      setSelectedPrestataire("");
      setMontantHT("");
      setMontantTTC("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    }
  };

  const remove = async (devisId: string) => {
    try {
      await devisApi.delete(devisId);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    }
  };

  return (
    <div style={{ padding: 24 }}>
      <h1>Demande {demande?.reference ?? id} — Devis et prestataires</h1>
      {demande && (
        <div>
          <p>Objet: {demande.title ?? demande.description}</p>
          <p>Statut: {demande.status}</p>
        </div>
      )}
      {loading && <p>Chargement…</p>}
      {error && <p style={{ color: "red" }}>{error}</p>}
      <h2>Ajouter un devis</h2>
      <select value={selectedPrestataire} onChange={(e) => setSelectedPrestataire(e.target.value)}>
        <option value="">-- prestataire --</option>
        {prestataires.map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}
      </select>
      <input placeholder="HT" value={montantHT} onChange={(e) => setMontantHT(e.target.value)} />
      <input placeholder="TTC" value={montantTTC} onChange={(e) => setMontantTTC(e.target.value)} />
      <button onClick={create}>Ajouter</button>

      <h2>Devis associés</h2>
      {!loading && devis.length === 0 && <p>Aucun devis.</p>}
      <ul>
        {devis.map((d) => (
          <li key={d.id}>
            {d.reference ?? d.id} — {d.prestataire?.nom ?? d.prestataireId} — HT {d.montantHT} TTC {d.montantTTC} {d.devise}
            <button onClick={() => remove(d.id)} style={{ marginLeft: 8 }}>Supprimer</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
