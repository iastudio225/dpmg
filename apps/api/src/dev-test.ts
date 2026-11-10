import { enforceLocalTestDatabase } from "./local-test-env";

// 1. Verrou de sécurité : validation de `.env.test` et affectation de
//    DATABASE_URL AVANT toute initialisation du client Prisma.
enforceLocalTestDatabase();

// 2. Import dynamique : les imports statiques seraient évalués avant la ligne
//    précédente. Le point d'entrée de l'API n'est donc chargé qu'après succès.
void import("./index.js").catch((error: unknown) => {
  console.error("[SECURITY] Échec du démarrage de l'API en environnement de test local.");
  console.error(error instanceof Error ? error.name : "Erreur inconnue");
  process.exit(1);
});
