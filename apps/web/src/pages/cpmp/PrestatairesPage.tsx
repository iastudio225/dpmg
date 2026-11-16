import { useEffect, useState } from "react";
import { prestatairesApi } from "../../services/api";

export function PrestatairesPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [nom, setNom] = useState("");

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await prestatairesApi.list({ search: search || undefined });
      setItems(Array.isArray(res) ? res : (res.items ?? []));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!nom.trim()) return;
    try {
      await prestatairesApi.create({ nom: nom.trim() });
      setNom("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    }
  };

  return (
    <div style={{ padding: 24 }}>
      <h1>Prestataires (CPMP)</h1>
      <div>
        <input placeholder="Recherche" value={search} onChange={(e) => setSearch(e.target.value)} />
        <button onClick={load}>Rechercher</button>
      </div>
      <div>
        <input placeholder="Nouveau prestataire" value={nom} onChange={(e) => setNom(e.target.value)} />
        <button onClick={create}>Créer</button>
      </div>
      {loading && <p>Chargement…</p>}
      {error && <p style={{ color: "red" }}>{error}</p>}
      {!loading && items.length === 0 && <p>Aucun prestataire.</p>}
      <ul>
        {items.map((p) => (
          <li key={p.id}>{p.nom} — {p.isActive ? "actif" : "inactif"}</li>
        ))}
      </ul>
    </div>
  );
}
