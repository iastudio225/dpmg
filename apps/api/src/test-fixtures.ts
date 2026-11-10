import type { Server } from "node:http";
import type { PrismaClient } from "@prisma/client";

/**
 * Support commun aux tests d'intégration API qui écrivent en base.
 *
 * Ce module est importé par les fichiers de tests APRÈS `./test-env` : la
 * variable `DATABASE_URL` a donc déjà été forcée vers la base de test. Il ne
 * modifie jamais cette configuration et ne réalise aucune opération au moment
 * de l'import : tout passe par des fonctions explicitement appelées depuis les
 * hooks `before` / `after`.
 *
 * Il fournit trois mécanismes complémentaires :
 *
 * 1. un nettoyage résilient des fixtures (`runCleanupSteps`) : chaque étape est
 *    tentée même si une précédente échoue, puis les échecs sont agrégés et
 *    signalés sans être masqués ;
 * 2. une fermeture attendue des ressources (`closeTestServer`) ;
 * 3. un balayage préalable des résidus (`sweepTestResidues`) strictement borné
 *    à la base `dpmg_test` et aux marqueurs de test.
 *
 * Une limite est assumée : aucun hook ne peut garantir un nettoyage après un
 * `SIGKILL`, un arrêt brutal de la machine ou une perte de connexion. Le
 * balayage préalable est le mécanisme de récupération de ces résidus.
 */

/** Nom imposé de la base de test : le balayage refuse toute autre base. */
const TEST_DATABASE_NAME = "dpmg_test";

/** Adresse e-mail des comptes de test : `<tag>-<RUN>@t.phase<N>.test`. */
const TEST_USER_EMAIL = /^[^@\s]+@t\.phase[0-9]+\.test$/;

/** Code ou référence de test : `TST-<RUN hex 6>[-…]`. */
const TEST_CODE = /^TST-[0-9a-f]{6}(?:-|$)/;

/** Jeton de session de test : `tok-<RUN hex 6>-<tag>`. */
const TEST_SESSION_TOKEN = /^tok-[0-9a-f]{6}-/;

/**
 * Ancienneté minimale d'un résidu pour être balayé.
 *
 * Les fichiers de tests s'exécutent en parallèle (un processus par fichier) et
 * partagent la même base. Sans ce seuil, le balayage d'un fichier détruirait
 * les fixtures vivantes d'un fichier voisin. Un fichier terminé en quelques
 * minutes, une marge de 30 minutes garantit qu'aucune exécution concurrente
 * n'est touchée. Conséquence assumée : un résidu très récent (moins de 30
 * minutes) n'est pas balayé immédiatement.
 */
const RESIDUE_MIN_AGE_MINUTES = 30;

/** Description d'une étape de nettoyage : libellé auditable et opération. */
export type CleanupStep = readonly [label: string, run: () => Promise<unknown>];

/** Compteur de lignes supprimées par le balayage. */
export interface SweepReport {
  users: number;
  sessions: number;
  demandes: number;
  roles: number;
  structures: number;
  departments: number;
}

/**
 * Vérifie explicitement que la base effective est bien `dpmg_test`.
 *
 * La vérification interroge le serveur (`current_database()`) : elle ne dépend
 * ni de `DATABASE_URL`, ni d'un fichier de configuration. En cas d'écart, le
 * processus est interrompu AVANT toute suppression.
 */
export async function assertEffectiveTestDatabase(prisma: PrismaClient): Promise<void> {
  const rows = await prisma.$queryRaw<Array<{ name: string }>>`SELECT current_database() AS name`;
  const effectiveName = rows[0]?.name;
  if (effectiveName !== TEST_DATABASE_NAME) {
    console.error(
      `[test-fixtures] La base effective n'est pas la base de test ${TEST_DATABASE_NAME}. ` +
        "Balayage et fixtures interrompus avant toute suppression."
    );
    process.exit(1);
  }
}

/**
 * Supprime les résidus laissés par une exécution de test interrompue.
 *
 * Le balayage ne reconnaît que les marqueurs produits par les tests :
 * - e-mails `…@t.phase<N>.test` ;
 * - codes et références `TST-<RUN hex 6>…` ;
 * - jetons de session `tok-<RUN hex 6>-…`.
 *
 * Il ne supprime jamais une ligne sur la seule base de son nom : les
 * candidats sont d'abord sélectionnés par préfixe/suffixe, puis filtrés par
 * expression régulière stricte, et les utilisateurs sont en outre limités aux
 * adresses de test (les comptes de démonstration ne peuvent donc pas être
 * atteints).
 *
 * L'ordre respecte les clés étrangères validées par l'audit :
 * sessions → demandes (cascade des décisions) → rôles structurels →
 * utilisateurs → structures → départements.
 *
 * Tout est exécuté dans une transaction : en cas d'échec, rien n'est supprimé
 * partiellement. Le balayage est idempotent.
 */
export async function sweepTestResidues(prisma: PrismaClient): Promise<SweepReport> {
  await assertEffectiveTestDatabase(prisma);

  const report = await prisma.$transaction(async (tx) => {
    const cutoff = new Date(Date.now() - RESIDUE_MIN_AGE_MINUTES * 60_000);

    const userCandidates = await tx.user.findMany({
      where: {
        createdAt: { lt: cutoff },
        OR: [
          { email: { endsWith: ".test" } },
          {
            sessions: {
              some: {
                token: { startsWith: "tok-" },
                createdAt: { lt: cutoff },
              },
            },
          },
        ],
      },
      select: { id: true, email: true },
    });
    const userIds = userCandidates.filter((user) => TEST_USER_EMAIL.test(user.email)).map((user) => user.id);

    const structureCandidates = await tx.structure.findMany({
      where: { createdAt: { lt: cutoff }, code: { startsWith: "TST-" } },
      select: { id: true, code: true },
    });
    const structureIds = structureCandidates.filter((row) => TEST_CODE.test(row.code)).map((row) => row.id);

    const departmentCandidates = await tx.department.findMany({
      where: { createdAt: { lt: cutoff }, code: { startsWith: "TST-" } },
      select: { id: true, code: true },
    });
    const departmentIds = departmentCandidates.filter((row) => TEST_CODE.test(row.code)).map((row) => row.id);

    const consolidationCandidates = await tx.consolidation.findMany({
      where: { createdAt: { lt: cutoff }, reference: { startsWith: "TST-" } },
      select: { id: true, reference: true },
    });
    const consolidationIds = consolidationCandidates.filter((row) => TEST_CODE.test(row.reference)).map((row) => row.id);

    const demandeCandidates = await tx.demande.findMany({
      where: {
        createdAt: { lt: cutoff },
        OR: [{ reference: { startsWith: "TST-" } }, { authorId: { in: userIds } }],
      },
      select: { id: true, reference: true, authorId: true },
    });
    const demandeIds = demandeCandidates
      .filter((row) => TEST_CODE.test(row.reference) || userIds.includes(row.authorId))
      .map((row) => row.id);

    const sessionCandidates = await tx.session.findMany({
      where: {
        createdAt: { lt: cutoff },
        OR: [{ token: { startsWith: "tok-" } }, { userId: { in: userIds } }],
      },
      select: { id: true, token: true, userId: true },
    });
    const sessionIds = sessionCandidates
      .filter((row) => TEST_SESSION_TOKEN.test(row.token) || userIds.includes(row.userId))
      .map((row) => row.id);

    const consolidationObservations = await tx.consolidationObservation.deleteMany({ where: { consolidationId: { in: consolidationIds } } });
    const consolidations = await tx.consolidation.deleteMany({ where: { id: { in: consolidationIds } } });
    const sessions = await tx.session.deleteMany({ where: { id: { in: sessionIds } } });
    const demandes = await tx.demande.deleteMany({ where: { id: { in: demandeIds } } });
    const roles = await tx.userStructureRole.deleteMany({
      where: { OR: [{ userId: { in: userIds } }, { structureId: { in: structureIds } }] },
    });
    const adminAuditLogs = await tx.adminAuditLog.deleteMany({ where: { actorId: { in: userIds } } });
    const users = await tx.user.deleteMany({ where: { id: { in: userIds } } });
    const structures = await tx.structure.deleteMany({ where: { id: { in: structureIds } } });
    const departments = await tx.department.deleteMany({ where: { id: { in: departmentIds } } });

    return {
      users: users.count,
      sessions: sessions.count,
      demandes: demandes.count,
      roles: roles.count,
      structures: structures.count,
      departments: departments.count,
    };
  });

  const total =
    report.users + report.sessions + report.demandes + report.roles + report.structures + report.departments;
  if (total > 0) {
    console.log(
      "[test-fixtures] balayage préalable : " +
        `utilisateurs=${report.users} sessions=${report.sessions} demandes=${report.demandes} ` +
        `rôles=${report.roles} structures=${report.structures} départements=${report.departments}`
    );
  }

  return report;
}

/**
 * Tente chaque étape de nettoyage, même si une précédente échoue, puis
 * signale explicitement l'ensemble des échecs.
 *
 * Les erreurs ne sont jamais avalées : elles sont journalisées et regroupées
 * dans un `AggregateError` levé à la fin. Un hook `after` qui lève cette
 * erreur est rapporté comme en échec par `node:test`.
 */
export async function runCleanupSteps(steps: readonly CleanupStep[]): Promise<void> {
  const failures: Array<{ label: string; error: unknown }> = [];

  for (const [label, run] of steps) {
    try {
      await run();
    } catch (error) {
      failures.push({ label, error });
    }
  }

  if (failures.length === 0) return;

  const details = failures
    .map(({ label, error }) => `- ${label} : ${error instanceof Error ? error.message : String(error)}`)
    .join("\n");
  console.error(`[test-fixtures] ${failures.length} étape(s) de nettoyage en échec :\n${details}`);

  throw new AggregateError(
    failures.map((failure) => failure.error),
    `Nettoyage des fixtures incomplet (${failures.length} étape(s) en échec) :\n${details}`
  );
}

/**
 * Ferme le serveur HTTP éphémère et attend réellement sa fermeture.
 *
 * `closeAllConnections()` libère les connexions persistantes afin que la
 * fermeture aboutisse sans attendre les délais de garde. Idempotent.
 */
export async function closeTestServer(server: Server | undefined): Promise<void> {
  if (!server || !server.listening) return;

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
    server.closeAllConnections();
  });
}

/**
 * Réduit les résidus après une interruption gracieuse (`SIGINT`/`SIGTERM`).
 *
 * Un seul jeu de gestionnaires est installé par processus ; la fonction
 * retournée les retire. Le gestionnaire exécute le nettoyage fourni puis
 * termine le processus avec un code conventionnel non nul (130/143) : une
 * interruption reste visible pour le runner, elle n'est pas masquée.
 *
 * Cette protection ne couvre ni `SIGKILL`, ni un arrêt brutal de la machine,
 * ni une perte de connexion : le balayage préalable reste le mécanisme de
 * récupération.
 */
export function installInterruptionCleanup(cleanup: () => Promise<void>): () => void {
  let started = false;

  const handle = (signal: "SIGINT" | "SIGTERM", exitCode: number): void => {
    if (started) return;
    started = true;
    console.error(`[test-fixtures] ${signal} reçu : nettoyage des fixtures avant arrêt.`);
    void cleanup()
      .catch((error: unknown) => {
        console.error("[test-fixtures] le nettoyage sur signal a échoué :", error);
      })
      .finally(() => {
        process.exit(exitCode);
      });
  };

  const onInt = (): void => handle("SIGINT", 130);
  const onTerm = (): void => handle("SIGTERM", 143);

  process.on("SIGINT", onInt);
  process.on("SIGTERM", onTerm);

  return () => {
    process.off("SIGINT", onInt);
    process.off("SIGTERM", onTerm);
  };
}
