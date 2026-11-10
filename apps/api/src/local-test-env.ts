import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

/**
 * Verrou de sécurité des lancements locaux (API et Worker).
 *
 * Ce module n'importe volontairement NI `load-env.ts`, NI `@prisma/client`,
 * NI un quelconque service : il doit pouvoir s'exécuter AVANT toute
 * initialisation du client Prisma. Il ne lit que `.env.test` à la racine du
 * dépôt, jamais `.env`, et n'établit aucune connexion PostgreSQL.
 */

/** Nom de base imposé pour tout lancement local sécurisé. */
const TEST_DATABASE_NAME = "dpmg_test";

/** Schémas acceptés (formes canoniques de libpq). */
const ALLOWED_SCHEMES = ["postgresql:", "postgres:"];

/** Seuls ces paramètres de requête sont admis ; `dbname=` est proscrit. */
const ALLOWED_QUERY_KEYS = ["schema"];

export type TestDatabaseValidation =
  | { ok: true; databaseName: string; url: string }
  | { ok: false; reason: string };

/** Recherche `.env.test` en remontant depuis l'emplacement de ce module. */
function findEnvTestFile(): string | null {
  let dir = __dirname;
  for (let i = 0; i < 6; i++) {
    const candidate = resolve(dir, ".env.test");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/**
 * Extrait TEST_DATABASE_URL du contenu du fichier `.env.test`.
 * La lecture est volontairement manuelle : une variable déjà présente dans
 * l'environnement du processus ne peut pas prendre le pas sur le fichier.
 */
export function extractTestDatabaseUrl(content: string): string | null {
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*TEST_DATABASE_URL\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    let value = match[1]!.trim();
    if (value.length >= 2) {
      const first = value[0];
      const last = value[value.length - 1];
      if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
        value = value.slice(1, -1);
      }
    }
    return value.length > 0 ? value : null;
  }
  return null;
}

/** Analyse l'URL avec le parseur URL standard et impose le nom de base. */
export function validateTestDatabaseUrl(rawUrl: string | null): TestDatabaseValidation {
  if (rawUrl === null || rawUrl.trim().length === 0) {
    return { ok: false, reason: "TEST_DATABASE_URL est absente." };
  }

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, reason: "TEST_DATABASE_URL n'est pas une URL valide." };
  }

  if (!ALLOWED_SCHEMES.includes(url.protocol)) {
    return { ok: false, reason: "Le schéma de TEST_DATABASE_URL n'est pas PostgreSQL." };
  }
  if (url.hostname.length === 0 || url.hash.length > 0) {
    return { ok: false, reason: "TEST_DATABASE_URL est ambiguë (hôte vide ou fragment)." };
  }

  const queryKeys = [...url.searchParams.keys()];
  if (
    new Set(queryKeys).size !== queryKeys.length ||
    queryKeys.some((key) => !ALLOWED_QUERY_KEYS.includes(key))
  ) {
    return { ok: false, reason: "TEST_DATABASE_URL contient un paramètre de requête non autorisé." };
  }

  const pathname = url.pathname;
  if (!pathname.startsWith("/")) {
    return { ok: false, reason: "TEST_DATABASE_URL ne désigne aucune base." };
  }
  const databaseName = pathname.slice(1);
  if (
    databaseName.length === 0 ||
    databaseName.includes("/") ||
    databaseName === "." ||
    databaseName === ".."
  ) {
    return { ok: false, reason: "TEST_DATABASE_URL ne désigne pas une base unique." };
  }

  if (databaseName !== TEST_DATABASE_NAME) {
    return { ok: false, reason: `La base « ${databaseName} » n'est pas autorisée.` };
  }

  return { ok: true, databaseName, url: rawUrl };
}

/** Charge et valide `.env.test`, sans effet de bord ni connexion. */
export function resolveLocalTestDatabase(): TestDatabaseValidation {
  const envTestPath = findEnvTestFile();
  if (envTestPath === null) {
    return { ok: false, reason: "Fichier .env.test introuvable à la racine du dépôt." };
  }

  let content: string;
  try {
    content = readFileSync(envTestPath, "utf8");
  } catch {
    return { ok: false, reason: "Fichier .env.test illisible." };
  }

  return validateTestDatabaseUrl(extractTestDatabaseUrl(content));
}

function refuse(reason: string): never {
  console.error(`[SECURITY] ${reason}`);
  console.error("[SECURITY] Démarrage refusé.");
  console.error(`La base autorisée est exclusivement ${TEST_DATABASE_NAME}.`);
  console.error("Aucune connexion PostgreSQL n'a été tentée.");
  process.exit(1);
}

/**
 * À appeler AVANT tout import du code applicatif. Verrouille DATABASE_URL sur
 * la seule valeur validée issue de `.env.test`. `load-env.ts` (dotenv sans
 * override) ne peut plus réintroduire la configuration de `.env` ensuite.
 */
export function enforceLocalTestDatabase(): void {
  const validation = resolveLocalTestDatabase();
  if (!validation.ok) {
    refuse(validation.reason);
  }
  process.env["DATABASE_URL"] = validation.url;
}
