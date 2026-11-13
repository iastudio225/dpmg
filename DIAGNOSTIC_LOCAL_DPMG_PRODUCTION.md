# DIAGNOSTIC LOCAL DPMG PRODUCTION

## 1. Configuration de l'environnement local
- Racine du monorepo : `D:\dpmg`
- Package manager : pnpm 12.11.2
- Node.js : v24.11.1
- PostgreSQL : 17.6
- API : `apps/api`, port 3001
- Frontend : `apps/web`, port 5173
- Worker : `apps/api/src/worker/notifications.ts`
- Prisma : `database/prisma/schema.prisma`

## 2. Base réellement ciblée
- Base : `dpmg`
- Schéma : `public`
- Version PostgreSQL : 17.6
- Connexion : lecture seule confirmée

## 3. Résultat de la connexion PostgreSQL
- `current_database()` = `dpmg`
- `current_schema()` = `public`
- Connexion réussie en lecture seule

## 4. État de Prisma
- Schéma Prisma présent et cohérent avec la base
- Dernière migration appliquée : `20261113000000_add_regional_direction_structure_type`
- Migration Lot N1 `20261114000000_add_demande_en_attente_analyse_notification` : **non appliquée**
- Enum `NotificationType` : **absence** de `DEMANDE_EN_ATTENTE_ANALYSE`
- Client Prisma généré et disponible

## 5. Présence du compte Tokpa GBEU
- Email : `gbeu.olivier@laposte.ci`
- ID : `cmwbybqmb006w835jlzv8bosk`
- Statut : `ACTIVE`
- Rôle : `DEPARTMENT_MANAGER`
- Structure : `LOGIS` (`cmwbxwlng001k835j604glm83`)
- Scope : `null`
- Éligible selon les règles du Lot N1 : **OUI**

## 6. État de la demande DEM-2026-ZENPK
- ID : `cmwc0ch5u000y4q72i13hm4pv`
- Statut : `EN_ATTENTE_ANALYSE`
- Département : `LOGIS` (`cmwbxy74m002e835jh8bf24ek`)
- Structure département : `cmwbxwlng001k835j604glm83`
- Auteur : `receveur.abidjan01@laposte.ci`
- Validation régionale : `douzo.guehi@laposte.ci` (11/11/2026 12:12:10)

## 7. État du système de notifications
- 2 entrées Outbox pour cette demande :
  - `DEMANDE_SOUMISE` → validateur régional (traitée)
  - `DEMANDE_VALIDEE` → auteur (traitée)
- 0 entrée `DEMANDE_EN_ATTENTE_ANALYSE`
- 0 notification pour `gbeu.olivier@laposte.ci`
- Cause : le code du Lot N1 n'est pas actif en production

## 8. État du code Lot N1
- Code local présent et validé.
- Migration SQL préparée mais non appliquée.
- Enum Prisma mis à jour localement.
- Backend typecheck : OK.
- Frontend typecheck : OK.

## 9. Risques liés à l'exécution locale sur la production
- Le worker pourrait traiter des événements Outbox.
- L'API locale utiliserait la base de production.
- Aucun événement artificiel ne doit être déclenché.
- Aucune écriture ne doit être effectuée.

## 10. Actions nécessaires avant de démarrer l'application
1. Vérifier `DATABASE_URL` pointe vers `dpmg`.
2. Ne pas démarrer le worker sans autorisation.
3. Ne pas soumettre ni valider de demande.
4. Ne pas exécuter de migration.
5. Ne pas exécuter de seed.

## 11. Opérations nécessitant une autorisation explicite
- Démarrage de l'API.
- Démarrage du worker.
- Démarrage du frontend.
- Toute écriture en base.
- Toute migration ou seed.

## Conclusion
La connexion locale à `dpmg` est fonctionnelle en lecture seule. Le système est prêt pour un diagnostic, mais toute opération d'écriture ou de démarrage de service nécessite une autorisation explicite. Aucune modification n'a été effectuée.