import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

/**
 * Environnement de test des tests d'intégration API.
 *
 * Ce module est importé EN PREMIER LIGNE par les fichiers de tests qui écrivent
 * en base. Il n'est jamais importé par le code applicatif : ni l'API de
 * développement, ni l'API de production.
 *
 * Son rôle est d'empêcher qu'un test puisse écrire par inadvertance dans la base
 * de démonstration `dpmg` : les tests ne peuvent s'exécuter que si une base
 * dédiée, nommée `dpmg_test`, a été explicitement fournie via
 * `TEST_DATABASE_URL`.
 *
 * Après validation, `TEST_DATABASE_URL` est affectée à `process.env["DATABASE_URL"]`
 * afin que les instances `PrismaClient` déjà instanciées (services métier, store
 * de session, fixtures de test) ciblent toutes la base de test.
 *
 * La validation est volontairement STRICTE et repose sur une analyse de la chaîne
 * brute, sans le parseur d'URL du WHATWG :
 *
 * - le parseur WHATWG normalise silencieusement des formes que libpq/libpq URI
 *   interprète autrement (barres obliques initiales multiples, segments `..`,
 *   percent-encodages, casse du schéma) ;
 * - un paramètre de query string ignoré par l'URL WHATWG peut être honoré par le
 *   pilote PostgreSQL (par exemple `dbname=`), ce qui permettrait de viser une
 *   base différente de celle contrôlée ;
 * - seule une liste blanche de paramètres est acceptée, sans exception et sans
 *   se fonder sur la présence ou l'absence d'une chaîne dans un binaire.
 */

/** Nom de base imposé pour la base de test. */
const TEST_DATABASE_NAME = "dpmg_test";

/** Schémas acceptés, en minuscules strictes (libpq est sensible à la casse). */
const ALLOWED_SCHEMES = ["postgresql", "postgres"];

/** Paramètres de query string acceptés. */
const ALLOWED_QUERY_KEYS = ["schema"];

/** Valeur admise pour un paramètre autorisé (identifiant simple). */
const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_$]*$/;

/** Nom de base admis (jamais percent-encodé). */
const DATABASE_NAME_PATTERN = /^[A-Za-z0-9_][A-Za-z0-9_$-]*$/;

/** Userinfo admise (RFC 3986 : unreserved, sub-delims, ":" et percent-encodage). */
const USERINFO_PATTERN = /^[A-Za-z0-9\-._~!$&'()*+,;=:%]*$/;

/** Hôte admise (nom d'hôte ou IPv4). */
const HOST_PATTERN = /^[A-Za-z0-9._-]+$/;

/** Hôte IPv6 admise, entre crochets. */
const IPV6_PATTERN = /^\[[0-9A-Fa-f:.]+\]$/;

/** Port admis. */
const PORT_PATTERN = /^[0-9]{1,5}$/;

/** Résultat d'analyse d'une URL PostgreSQL. */
type ParsedTarget =
  | { ok: true; databaseName: string; queryKeys: string[] }
  | { ok: false; reason: "malformed" | "scheme" | "path" | "query" };

function loadEnvFile(fileName: string): void {
  const candidates = [fileName, `../${fileName}`, `../../${fileName}`].map((p) =>
    resolve(process.cwd(), p)
  );
  const envFile = candidates.find((p) => existsSync(p));
  if (!envFile) return;

  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const key = match[1]!;
    let value = match[2]!.trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

/**
 * Analyse STRICTE d'une URL PostgreSQL, à partir de la chaîne brute.
 *
 * Aucune normalisation n'est appliquée : la forme acceptée est exactement
 * `postgresql://[userinfo@]host[:port]/<un seul segment de nom de base>[?query]`.
 *
 * Sont rejetés :
 * - les schémas autres que `postgresql` et `postgres`, et leur casse non
 *   canonique (libpq est sensible à la casse) ;
 * - les chaînes mal formées, avec espaces, fragment (`#`) ou query multiple ;
 * - un hôte vide (forme socket local, ambiguë) ;
 * - un chemin vide, à plusieurs segments, ou comportant des barres obliques
 *   initiales multiples (divergence avec les conventions libpq) ;
 * - un nom de base percent-encodé ou contenant des segments de navigation ;
 * - toute query string non vide dont les paramètres ne sont pas tous autorisés,
 *   sont dupliqués, ou dont la valeur n'est pas un identifiant simple.
 *
 * Ne retourne jamais l'URL ni les identifiants : uniquement le nom de base et
 * la liste des clés de paramètres rencontrées.
 */
function parsePostgresTarget(rawUrl: string): ParsedTarget {
  if (rawUrl.length === 0) return { ok: false, reason: "malformed" };
  // Aucun espace en tête ou en queue : le parseur WHATWG les ignorerait, libpq non.
  if (rawUrl !== rawUrl.trim()) return { ok: false, reason: "malformed" };

  const schemeEnd = rawUrl.indexOf("://");
  if (schemeEnd < 0) return { ok: false, reason: "malformed" };
  const scheme = rawUrl.slice(0, schemeEnd);
  if (!ALLOWED_SCHEMES.includes(scheme)) {
    // Un schéma syntaxiquement valide mais non PostgreSQL est un cas distinct.
    if (!/^[A-Za-z][A-Za-z0-9+.-]*$/.test(scheme)) return { ok: false, reason: "malformed" };
    return { ok: false, reason: "scheme" };
  }

  let rest = rawUrl.slice(schemeEnd + 3);
  if (rest.includes("#")) return { ok: false, reason: "malformed" };

  let query = "";
  const queryIndex = rest.indexOf("?");
  if (queryIndex >= 0) {
    query = rest.slice(queryIndex + 1);
    rest = rest.slice(0, queryIndex);
    if (query.includes("?")) return { ok: false, reason: "malformed" };
  }

  const slashIndex = rest.indexOf("/");
  if (slashIndex < 0) return { ok: false, reason: "path" };
  const authority = rest.slice(0, slashIndex);
  const path = rest.slice(slashIndex);

  // Autorité : [userinfo@]host[:port]
  const atIndex = authority.lastIndexOf("@");
  let hostAndPort = authority;
  if (atIndex >= 0) {
    const userinfo = authority.slice(0, atIndex);
    hostAndPort = authority.slice(atIndex + 1);
    if (userinfo.length === 0) return { ok: false, reason: "malformed" };
    if (!USERINFO_PATTERN.test(userinfo)) return { ok: false, reason: "malformed" };
  }
  let host = hostAndPort;
  let port = "";
  if (hostAndPort.startsWith("[")) {
    const closing = hostAndPort.indexOf("]");
    if (closing < 0) return { ok: false, reason: "malformed" };
    host = hostAndPort.slice(0, closing + 1);
    const remainder = hostAndPort.slice(closing + 1);
    if (remainder.length > 0) {
      if (!remainder.startsWith(":")) return { ok: false, reason: "malformed" };
      port = remainder.slice(1);
    }
    if (!IPV6_PATTERN.test(host)) return { ok: false, reason: "malformed" };
  } else {
    const colonIndex = hostAndPort.indexOf(":");
    if (colonIndex >= 0) {
      host = hostAndPort.slice(0, colonIndex);
      port = hostAndPort.slice(colonIndex + 1);
    }
    if (!HOST_PATTERN.test(host)) return { ok: false, reason: "malformed" };
  }
  // Un hôte vide designates un socket local : forme ambiguë, elle est refusée.
  if (host.length === 0) return { ok: false, reason: "malformed" };
  if (port.length > 0) {
    if (!PORT_PATTERN.test(port)) return { ok: false, reason: "malformed" };
    const portNumber = Number(port);
    if (portNumber < 1 || portNumber > 65535) return { ok: false, reason: "malformed" };
  }

  // Chemin : exactement un segment, sans ambiguïté possible.
  if (!path.startsWith("/")) return { ok: false, reason: "path" };
  if (path.includes("//")) return { ok: false, reason: "path" };
  const segments = path.slice(1).split("/");
  if (segments.length !== 1) return { ok: false, reason: "path" };
  const databaseName = segments[0]!;
  if (databaseName.length === 0) return { ok: false, reason: "path" };
  if (databaseName === "." || databaseName === "..") return { ok: false, reason: "path" };
  if (!DATABASE_NAME_PATTERN.test(databaseName)) return { ok: false, reason: "path" };

  // Query string : liste blanche stricte, sans doublon ni valeur exotique.
  const queryKeys: string[] = [];
  if (query.length > 0) {
    for (const part of query.split("&")) {
      if (part.length === 0) return { ok: false, reason: "query" };
      const equalsIndex = part.indexOf("=");
      if (equalsIndex < 0) return { ok: false, reason: "query" };
      const key = part.slice(0, equalsIndex);
      const value = part.slice(equalsIndex + 1);
      if (!ALLOWED_QUERY_KEYS.includes(key)) return { ok: false, reason: "query" };
      if (queryKeys.includes(key)) return { ok: false, reason: "query" };
      if (!IDENTIFIER_PATTERN.test(value)) return { ok: false, reason: "query" };
      queryKeys.push(key);
    }
  }

  return { ok: true, databaseName, queryKeys };
}

/** Arrête le processus de test avec un message explicite, sans aucune valeur. */
function fail(message: string): never {
  console.error(`[test-env] ${message}`);
  process.exit(1);
}

// 1. Configuration existante : le .env racine alimente toujours l'API et les tests.
loadEnvFile(".env");

// 2. Nom de la base de développement, relevé AVANT toute surcharge de test.
//    Notation par crochets obligatoire : ProcessEnv n'expose que des index
//    signatures (noPropertyAccessFromIndexSignature).
//    Si DATABASE_URL est présente, elle doit être exploitable : sinon la
//    comparaison avec la base de test serait ininterprétable.
const developmentDatabaseUrl = process.env["DATABASE_URL"];
let developmentDatabaseName: string | null = null;
if (developmentDatabaseUrl !== undefined && developmentDatabaseUrl.trim() !== "") {
  const parsedDevelopment = parsePostgresTarget(developmentDatabaseUrl);
  if (!parsedDevelopment.ok) {
    fail(
      "DATABASE_URL est définie mais n'est pas une URL PostgreSQL exploitable. " +
        "Corrigez la configuration de développement avant d'exécuter les tests."
    );
  }
  developmentDatabaseName = parsedDevelopment.databaseName;
}

// 3. Configuration de test dédiée (préparée séparément, absente à ce stade).
//    Elle ne complète QUE les variables encore absentes : une variable déjà
//    définie par le .env racine (DATABASE_URL par exemple) n'est pas
//    remplacée, et le .env racine reste donc prioritaire. En pratique,
//    .env.test sert à fournir TEST_DATABASE_URL.
loadEnvFile(".env.test");

// 4. La base de test est obligatoire : aucun repli silencieux sur DATABASE_URL.
const testDatabaseUrl = process.env["TEST_DATABASE_URL"];
if (typeof testDatabaseUrl !== "string" || testDatabaseUrl.trim() === "") {
  fail(
    "TEST_DATABASE_URL est obligatoire pour les tests API. " +
      `Définissez-la sur la base dédiée ${TEST_DATABASE_NAME}, sans l'utiliser pour le développement.`
  );
}

// 5. L'URL doit être analysable, sans être affichée.
const parsedTest = parsePostgresTarget(testDatabaseUrl);
if (!parsedTest.ok) {
  if (parsedTest.reason === "scheme") {
    fail(
      "TEST_DATABASE_URL doit utiliser le schéma postgresql:// ou postgres://. " +
        `Utilisez le format postgresql://utilisateur:motdepasse@hote:5432/${TEST_DATABASE_NAME}.`
    );
  }
  if (parsedTest.reason === "query") {
    fail(
      "TEST_DATABASE_URL ne doit contenir que des paramètres autorisés " +
        `(actuellement : ${ALLOWED_QUERY_KEYS.join(", ")}), sans doublon. ` +
        "Retirez notamment dbname= et tout autre paramètre inconnu."
    );
  }
  if (parsedTest.reason === "path") {
    fail(
      "TEST_DATABASE_URL doit désigner une base unique et non ambiguë. " +
        "Utilisez le format postgresql://utilisateur:motdepasse@hote:5432/" +
        `${TEST_DATABASE_NAME}.`
    );
  }
  fail(
    "TEST_DATABASE_URL doit être une URL PostgreSQL exploitable (schéma postgresql://). " +
      "Utilisez le format postgresql://utilisateur:motdepasse@hote:5432/" +
      `${TEST_DATABASE_NAME}.`
  );
}

// 6. Le chemin doit désigner une base unique et non ambiguë, nommée exactement
//    comme attendu. Les formes ambiguës (barres obliques multiples, segments
//    supplémentaires, nom percent-encodé) sont refusées ici.
if (parsedTest.databaseName !== TEST_DATABASE_NAME) {
  fail(
    `La base de test doit s'appeler ${TEST_DATABASE_NAME}. ` +
      "TEST_DATABASE_URL pointe vers une autre base : les tests ne peuvent pas s'exécuter."
  );
}

// 7. La base de test ne doit jamais être la base de développement.
if (developmentDatabaseName && developmentDatabaseName === parsedTest.databaseName) {
  fail(
    "TEST_DATABASE_URL et DATABASE_URL pointent vers la même base. " +
      "Les tests ne doivent jamais écrire dans la base de développement : " +
      `utilisez une base dédiée nommée ${TEST_DATABASE_NAME}.`
  );
}

// 8. Validation effectuée : le processus de test cible désormais la base de test.
process.env["DATABASE_URL"] = testDatabaseUrl;
