import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { consolidationsApi } from "../../services/api";
import { ConsolidationResponse, ConsolidationObservationResponse } from "@dpmg/shared";

export function CpmpPage() {
  const [items, setItems] = useState<ConsolidationResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<ConsolidationResponse | null>(null);
  const [obs, setObs] = useState<ConsolidationObservationResponse[]>([]);
  const [text, setText] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try { const data = await consolidationsApi.list(); if (!cancelled) setItems(data); }
      catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : "Erreur"); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  const open = async (id: string) => {
    try {
      const d = await consolidationsApi.get(id);
      setDetail(d);
      setObs(await consolidationsApi.listObservations(id));
    } catch (e) { setError(e instanceof Error ? e.message : "Erreur"); }
  };

  const submit = async () => {
    if (!detail || !text.trim()) return;
    try {
      const o = await consolidationsApi.addObservation(detail.id, text.trim());
      setObs((p) => [...p, o]);
      setText("");
    } catch (e) { setError(e instanceof Error ? e.message : "Erreur"); }
  };

  return (
    <div style={{ padding: 24 }}>
      <h1>Espace CPMP</h1>
      {loading && <p>Chargement…</p>}
      {error && <p style={{ color: "red" }}>{error}</p>}
      {!detail && (
        <ul>
          {items.map((c) => (
            <li key={c.id}>
              <button onClick={() => open(c.id)}>{c.reference}</button> — {c.status} — {c.demandes.length} demandes
            </li>
          ))}
        </ul>
      )}
      {detail && (
        <div>
          <h2>{detail.reference}</h2>
          <p>Statut: {detail.status}</p>
          <ul>
            {detail.demandes.map((d) => (
              <li key={d.id}>{d.reference ?? d.id} — {d.title} <Link to={`/cpmp/demandes/${d.id}`}>Consulter la demande</Link></li>
            ))}
          </ul>
          <h3>Observations CPMP</h3>
          <ul>
            {obs.map((o) => <li key={o.id}>{o.commentaire}</li>)}
          </ul>
          <textarea value={text} onChange={(e) => setText(e.target.value)} />
          <button onClick={submit} disabled={!text.trim()}>Ajouter observation</button>
          <button onClick={() => setDetail(null)}>Retour</button>
        </div>
      )}
    </div>
  );
}
