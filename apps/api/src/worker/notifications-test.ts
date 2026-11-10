import { enforceLocalTestDatabase } from "../local-test-env";

// 1. Même verrou que l'API : `.env.test` seul, jamais `.env`.
//    Le nom de ce fichier contient « notifications », ce qui satisfait le garde
//    de démarrage du Worker (worker/notifications.ts) lors de l'import.
enforceLocalTestDatabase();

// 2. Le Worker reste un processus indépendant : aucun import depuis l'API.
void import("./notifications.js").catch((error: unknown) => {
  console.error("[SECURITY] Échec du démarrage du Worker en environnement de test local.");
  console.error(error instanceof Error ? error.name : "Erreur inconnue");
  process.exit(1);
});
