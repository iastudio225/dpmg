# AUDIT EXHAUSTIF DES RÔLES ET HABILITATIONS — DPMG

Date de l'audit : 2026-11-12 (selon l'environnement)
Périmètre : audit uniquement, aucune modification de code ou de données.

---

## 1. Source de vérité examinée

- `database/prisma/schema.prisma` (enum `RoleType`, lignes 24-37 ; modèle `UserStructureRole`, lignes 158-180).
- `packages/shared/src/zod.ts` (`roleTypeSchema`, lignes 163-177 ; `userRoleAssignmentSchema`, lignes 263-286).
- `apps/api/src/middleware/auth.ts` (`requireRole`, lignes 78-92 ; `requireScope`, 98-112 ; `requireStructure`, 114-127).
- `apps/api/src/services/user.service.ts` (gestion des utilisateurs et rôles).
- `apps/api/src/services/demande.service.ts` (visibilité et autorisations par rôle).
- `apps/api/src/services/validation.service.ts` (validation hiérarchique et délégations).
- `apps/api/src/services/notification.service.ts` (destinataires par rôle).
- `apps/api/src/services/consolidation-observation.service.ts` (observations DG/CPMP).
- `apps/api/src/routes/*.ts` (routes protégées).
- `apps/web/src/pages/utilisateurs/UtilisateurForm.tsx`, `UtilisateursPage.tsx`.
- `apps/web/src/pages/demandes/DemandeDetailPage.tsx`, `apps/web/src/pages/dashboard/Dashboard.tsx`.
- `database/prisma/migrations/...` (init + ajout `SUPER_ADMIN`).
- Base de données `dpmg` (requêtes `SELECT` uniquement).

---

## 2. Liste exacte des rôles déclarés

Enum `RoleType` dans `database/prisma/schema.prisma` (lignes 24-37) :

| # | Identifiant technique |
|---|---|
| 1 | `EMPLOYEE` |
| 2 | `HIERARCHICAL_MANAGER` |
| 3 | `DELEGATED_REPRESENTATIVE` |
| 4 | `DEPARTMENT_MANAGER` |
| 5 | `DEPARTMENT_DELEGATE` |
| 6 | `DPMG_MANAGER` |
| 7 | `DPMG_DELEGATE` |
| 8 | `DFC_CONTROLLER` |
| 9 | `CPMP_USER` |
| 10 | `DG_USER` |
| 11 | `EXECUTION_AGENT` |
| 12 | `TECHNICAL_ADMIN` |
| 13 | `SUPER_ADMIN` |

Soit **13 rôles déclarés**.

### Existence dans le client partagé et Zod

- `packages/shared/src/zod.ts`, `roleTypeSchema` (lignes 163-177) : les **13** rôles sont présents, identiques à Prisma. Type `RoleType` dérivé (ligne 178).
- `userRoleAssignmentSchema` (lignes 263-286) : accepte `roleTypeSchema` ; `structureId` obligatoire sauf pour `TECHNICAL_ADMIN` et `SUPER_ADMIN` (lignes 275-281) qui peuvent être globaux.

### Historique migrations

- `database/prisma/migrations/20241014_init_auth_models/migration.sql` (ligne 8) : création de l'enum `RoleType` avec **12** valeurs (sans `SUPER_ADMIN`).
- `database/prisma/migrations/20261106000002_add_super_admin_role/migration.sql` (ligne 9) : `ALTER TYPE "RoleType" ADD VALUE 'SUPER_ADMIN';`.
- La base `dpmg` a bien la migration `20261106000002_add_super_admin_role` appliquée (vérifié via `_prisma_migrations`).

---

## 3. Vérification des rôles réellement utilisés (backend)

### Conditions d'autorisation backend (extraits)

| Rôle | Usage backend confirmé | Fichier:ligne |
|---|---|---|
| `EMPLOYEE` | Auteur de demande ; aucune permission spéciale ; visibilité limitée à ses propres demandes | `apps/api/src/services/demande.service.ts` (visibilité auteur, ligne ~298) |
| `HIERARCHICAL_MANAGER` | Validateur hiérarchique dans `resolveValidatorForDemande` ; `MANAGER_ROLES` | `apps/api/src/services/validation.service.ts` (lignes 88-99) ; `apps/api/src/routes/demandes.ts` (lignes 45-51) |
| `DELEGATED_REPRESENTATIVE` | Délégation de validation hiérarchique (délégant = `HIERARCHICAL_MANAGER` actif) | `apps/api/src/services/validation.service.ts` (lignes 104-144) |
| `DEPARTMENT_MANAGER` | Avis départemental, exécution, visibilité ; `MANAGER_ROLES` | `apps/api/src/services/demande.service.ts` (lignes 887, 961, 1693) |
| `DEPARTMENT_DELEGATE` | Délégation départementale (délégant = `DEPARTMENT_MANAGER`) | `apps/api/src/services/demande.service.ts` (lignes 869, 908, 931) |
| `DPMG_MANAGER` | Décision DPMG, consolidation (écriture), clôture satisfaction | `apps/api/src/services/demande.service.ts` (lignes 1027, 1079) ; `apps/api/src/routes/consolidations.ts` (lignes 27-31) |
| `DPMG_DELEGATE` | Délégation DPMG (délégant = `DPMG_MANAGER`) | `apps/api/src/services/demande.service.ts` (lignes 1027, 1041, 1062, 1079) |
| `DFC_CONTROLLER` | Contrôle financier, visibilité financement | `apps/api/src/services/demande.service.ts` (lignes 1360-1393) ; `apps/api/src/services/notification.service.ts` (lignes 107-129) |
| `CPMP_USER` | Observation sur consolidations transmises | `apps/api/src/services/consolidation-observation.service.ts` (lignes 85, 91) ; `apps/api/src/services/demande.service.ts` (lignes 1441-1483) |
| `DG_USER` | Observation sur consolidations transmises | `apps/api/src/services/consolidation-observation.service.ts` (lignes 84, 90) ; `apps/api/src/services/demande.service.ts` (lignes 1421-1474) |
| `EXECUTION_AGENT` | Prise en charge exécution | `apps/api/src/services/demande.service.ts` (lignes 1688-1723) |
| `TECHNICAL_ADMIN` | Administration technique (utilisateurs, structures, départements, base) ; protégé | `apps/api/src/routes/users.ts` (lignes 42-214) ; `apps/api/src/routes/structures.ts` (lignes 59-115) ; `apps/api/src/routes/departments.ts` (lignes 57-95) ; `apps/api/src/routes/database-admin.ts` (lignes 23-55) |
| `SUPER_ADMIN` | Niveau supérieur ; peut gérer `TECHNICAL_ADMIN` ; accès consolidation | `apps/api/src/services/user.service.ts` (lignes 176-234, 384-402, 706-724) ; `apps/api/src/routes/consolidations.ts` (lignes 27-31) |

### Middlewares

- `requireRole(...)` (`apps/api/src/middleware/auth.ts`, lignes 78-92) : vérifie la présence d'au moins un des rôles autorisés parmi `req.userRoles`.
- `requireScope(scope)` (lignes 98-112) : vérifie `r.scope === scope || r.scope === "*"`.
- `requireStructure(structureId)` (lignes 114-127) : vérifie `r.structureId === structureId`.
- `requireAuth` (lignes 14-76) : charge les rôles actifs (`getUserActiveRoles`), bornes temporelles inclusives.

### Protections spécifiques

- `TECHNICAL_ADMIN` et `SUPER_ADMIN` sont protégés : dernier administrateur actif non supprimable/désactivable (`assertNotLastTechnicalAdmin`, `assertNotLastSuperAdmin` dans `user.service.ts`, lignes 135-167, 256-268).
- `TECHNICAL_ADMIN` ne peut pas gérer un autre `TECHNICAL_ADMIN` ni un `SUPER_ADMIN` ; `SUPER_ADMIN` ne peut pas gérer un autre `SUPER_ADMIN` (`assertNotOtherPrivilegedAdmin`, lignes 176-234).
- Seul un `SUPER_ADMIN` peut attribuer/créer `SUPER_ADMIN` (`user.service.ts`, lignes 384-402, 706-724).
- `TECHNICAL_ADMIN` ne peut pas s'attribuer à lui-même le rôle `TECHNICAL_ADMIN` (ligne 686).

---

## 4. Vérification des rôles côté frontend

### Composants/pages prenant en charge les rôles

- `apps/web/src/components/AuthenticatedLayout.tsx` (ligne 70) : `isAdmin = hasAnyRole(["TECHNICAL_ADMIN", "SUPER_ADMIN"])`.
- `apps/web/src/pages/utilisateurs/UtilisateursPage.tsx` (lignes 29-44) : distingue `TECHNICAL_ADMIN` et `SUPER_ADMIN` cibles ; filtre de rôle limité à 3 valeurs (lignes 247-251).
- `apps/web/src/pages/utilisateurs/UtilisateurForm.tsx` :
  - `ROLE_LABELS` (lignes 25-37) : 11 libellés (manquent `DELEGATED_REPRESENTATIVE`, `DEPARTMENT_DELEGATE`).
  - `roleOptions` (lignes 306-314) : **7 rôles sélectionnables** : `EMPLOYEE`, `HIERARCHICAL_MANAGER`, `DEPARTMENT_MANAGER`, `DPMG_MANAGER`, `EXECUTION_AGENT`, `TECHNICAL_ADMIN`, `SUPER_ADMIN`.
- `apps/web/src/pages/demandes/DemandeDetailPage.tsx` (lignes 105-154) :
  - `canValidate` : `HIERARCHICAL_MANAGER` ou `DEPARTMENT_MANAGER` (ligne 108).
  - `canDpmg` : `DPMG_MANAGER` ou `DPMG_DELEGATE` (ligne 118).
  - `canDfc` : `DFC_CONTROLLER` (ligne 123).
  - `canExecution` : `DEPARTMENT_MANAGER`, `DEPARTMENT_DELEGATE`, `EXECUTION_AGENT` (ligne 128).
  - `canClose` : `DPMG_MANAGER` ou `DPMG_DELEGATE` (ligne 133).
  - `canGiveAvis` : `DEPARTMENT_MANAGER` ou `DEPARTMENT_DELEGATE` avec périmètre (lignes 145-154).
- `apps/web/src/pages/dashboard/Dashboard.tsx` (lignes 13-27) : `ROLE_LABELS` complet pour les 13 rôles.
- `apps/web/src/pages/ParametresPage.tsx` (ligne 11) : `TECHNICAL_ADMIN` uniquement.

### Disponibilité dans l'interface d'affectation

Uniquement les 7 rôles de `roleOptions` (`UtilisateurForm.tsx`, lignes 306-314) sont attribuables via l'interface. Les 6 autres (`DELEGATED_REPRESENTATIVE`, `DEPARTMENT_DELEGATE`, `DPMG_DELEGATE`, `DFC_CONTROLLER`, `CPMP_USER`, `DG_USER`) ne le sont pas, bien que le backend les accepte.

---

## 5. Tableau récapitulatif obligatoire

| Rôle technique | Déclaré dans Prisma | Utilisé backend | Utilisé frontend | Attribuable dans l'interface | Fonction administrative correspondante | Statut |
|---|---|---|---|---|---|---|
| `EMPLOYEE` | Oui | Oui | Oui (affichage) | Oui | Receveur d'agence / employé auteur | CONFIRMÉ ET OPÉRATIONNEL |
| `HIERARCHICAL_MANAGER` | Oui | Oui | Oui | Oui | Directeur Régional (DCR) — validateur hiérarchique | CONFIRMÉ ET OPÉRATIONNEL |
| `DELEGATED_REPRESENTATIVE` | Oui | Oui | Non (pas dans `canValidate`) | Non | Représentant/personne déléguée (validation hiérarchique) | PARTIELLEMENT IMPLÉMENTÉ |
| `DEPARTMENT_MANAGER` | Oui | Oui | Oui | Oui | Responsable de département (Infra/Logistique/Magasin) | CONFIRMÉ ET OPÉRATIONNEL |
| `DEPARTMENT_DELEGATE` | Oui | Oui | Oui | Non | Représentant/personne déléguée (département) | PARTIELLEMENT IMPLÉMENTÉ |
| `DPMG_MANAGER` | Oui | Oui | Oui | Oui | Décideur DPMG (probablement Directeur DPMG) | CONFIRMÉ ET OPÉRATIONNEL |
| `DPMG_DELEGATE` | Oui | Oui | Oui | Non | Représentant/personne déléguée (DPMG) | PARTIELLEMENT IMPLÉMENTÉ |
| `DFC_CONTROLLER` | Oui | Oui | Oui | Non | Direction Financière et Comptable (DFC) | PARTIELLEMENT IMPLÉMENTÉ |
| `CPMP_USER` | Oui | Oui | Non (aucun composant) | Non | Cellule de Passation des Marchés Publics (CPMP) | PARTIELLEMENT IMPLÉMENTÉ |
| `DG_USER` | Oui | Oui | Non (aucun composant) | Non | Directeur Général (DG) — observation | PARTIELLEMENT IMPLÉMENTÉ |
| `EXECUTION_AGENT` | Oui | Oui | Oui | Oui | Agent d'exécution | CONFIRMÉ ET OPÉRATIONNEL |
| `TECHNICAL_ADMIN` | Oui | Oui | Oui | Oui | Administrateur technique | CONFIRMÉ ET OPÉRATIONNEL |
| `SUPER_ADMIN` | Oui | Oui | Oui | Oui | Administrateur technique (niveau super) | CONFIRMÉ ET OPÉRATIONNEL |

---

## 6. Correspondances avec l'organisation administrative

| Fonction administrative | Rôle technique correspondant (confirmé par le code) | Preuve |
|---|---|---|
| Directeur du Patrimoine et des Moyens Généraux | `DPMG_MANAGER` (décision DPMG, consolidation, clôture) — le code ne nomme pas explicitement le directeur ; le rôle est libellé "Responsable DPMG" | `apps/api/src/services/demande.service.ts` lignes 1000-1118 ; `apps/web/src/pages/utilisateurs/UtilisateurForm.tsx` ligne 29 |
| Responsable du département Infrastructure et Moyens Généraux | `DEPARTMENT_MANAGER` (scope `INFRA`) | `apps/api/src/scripts/seed-demo.ts` lignes 18-25 ; base `dpmg` : `konate.mamourou@...` sur structure `INFRA` |
| Responsable du département Logistique et Gestion des Stocks | `DEPARTMENT_MANAGER` (scope `LOGISTIQUE`) | idem ; base : `gbeu.olivier@...` sur `LOGIS` |
| Responsable Magasin | `DEPARTMENT_MANAGER` (scope `MAGASIN`) | idem seed-demo |
| Directeur de la DCR (Directeur Régional) | `HIERARCHICAL_MANAGER` sur une structure `REGIONAL_DIRECTION` (portée régionale : toutes les agences filles) | `apps/api/src/services/demande.service.ts` lignes 236-280 ; base : `douzo.guehi@...` sur `DCR-INTRA-MUROS` |
| Receveurs d'agence | `EMPLOYEE` (auteur de demande, limité à son agence via la structure) | base : `receveur.abidjan01@...`, `receveur.abidjan18@...` |
| Directeur Général (DG) | `DG_USER` (observation sur consolidations transmises) | `apps/api/src/services/consolidation-observation.service.ts` lignes 84, 90 |
| Direction Financière et Comptable (DFC) | `DFC_CONTROLLER` | `apps/api/src/services/demande.service.ts` lignes 1360-1393 ; seed-demo `controleur.dfc@dpmg.local` |
| Cellule de Passation des Marchés Publics (CPMP) | `CPMP_USER` | `apps/api/src/services/consolidation-observation.service.ts` lignes 85, 91 |
| Administrateurs techniques | `TECHNICAL_ADMIN` (et `SUPER_ADMIN` au-dessus) | `apps/api/src/services/user.service.ts` ; `apps/api/src/routes/database-admin.ts` |
| Représentants et personnes déléguées | `DELEGATED_REPRESENTATIVE`, `DEPARTMENT_DELEGATE`, `DPMG_DELEGATE` | `apps/api/src/services/validation.service.ts` ; `apps/api/src/services/demande.service.ts` |

Note : `EXECUTION_AGENT` n'a pas de fonction administrative explicitement nommée dans l'énoncé ; le rôle confère des droits d'exécution (`startExecution`, visibilité exécution).

---

## 7. Périmètres d'accès (`UserStructureRole`)

Modèle `UserStructureRole` (`database/prisma/schema.prisma`, lignes 158-180) :

- `userId` : FK `User`, cascade.
- `structureId` : FK `Structure`, nullable, cascade.
- `role` : `RoleType`.
- `scope` : chaîne libre nullable.
- `startDate` : défaut `now()`.
- `endDate` : nullable.
- `delegatedFromUserId` : FK `User` (délégant), nullable.
- `delegationNote` : texte nullable.
- Contrainte d'unicité : `@@unique([userId, structureId, role])` (ligne 174).
- Index sur `userId`, `structureId`, `role`, `startDate, endDate`, `delegatedFromUserId`.

### Multiplicité

Un même rôle peut être attribué à plusieurs utilisateurs et à plusieurs structures : la contrainte d'unicité est par `(utilisateur, structure, rôle)`, pas par rôle. Un utilisateur peut détenir le même rôle sur plusieurs structures distinctes.

### Vérifications demandées

- **Directeur DPMG accès global** : un `DPMG_MANAGER` avec `scope = "*"` sur la structure DPMG couvre tous les départements (`dpmgScopeCovers`, `demande.service.ts` ligne 1010-1014 ; `resolveDpmgDecisionDepartmentIds` lignes 1107-1118). Confirmé en base pour `eyemon.poupouya@...` (`scope = "*"`).
- **Responsable départemental limité à son département** : `habilitationCoversDepartment` (`demande.service.ts` lignes 864-873) exige `scope === department.code` ou rattachement structurel (`Department.structureId === UserStructureRole.structureId`) ; `scope = "*"` ne confère **aucun** droit départemental (`targetsDepartment`, ligne 853). Confirmé par le code.
- **Directeur Régional limité aux agences de sa région** : `resolveRegionalAgencyAuthorIds` (`demande.service.ts` lignes 236-280) exige un `HIERARCHICAL_MANAGER` actif sur **exactement une** structure `REGIONAL_DIRECTION` ; puis toutes les agences filles (`parentId`). Aucune ouverture globale.
- **Receveur d'agence limité à son agence** : `EMPLOYEE` n'a pas de permissions de workflow ; la visibilité est limitée à ses propres demandes (`authorId = userId`). Les demandes sont rattachées à un département/agence.
- **Délégations respectent le périmètre du délégant** :
  - Validation hiérarchique : `delegationCoversScope` (`validation.service.ts` lignes 30-45) : le délégué ne reçoit jamais un périmètre plus large que le délégant ; `scope = "*"` du délégué n'est accepté que si le délégant a aussi `scope = "*"`.
  - Département : `habilitationCoversDepartment` vérifie que le délégant couvre le même département (lignes 864-873).
  - DPMG : `dpmgHabilitationCovers` (lignes 1074-1083) vérifie la couverture du délégant.
  - Notifications : `resolveDepartmentRecipients` vérifie l'égalité de périmètre (lignes 234-254).
- **Dates** : bornes inclusives (`startDate <= now`, `endDate` null ou `>= now`) appliquées partout.

---

## 8. Vérification des données réelles (base `dpmg`, SELECT uniquement)

Rôles effectivement attribués (requête `GROUP BY role` sur `UserStructureRole`) :

| Rôle | Nombre |
|---|---|
| `EMPLOYEE` | 3 |
| `HIERARCHICAL_MANAGER` | 1 |
| `DEPARTMENT_MANAGER` | 4 |
| `DPMG_MANAGER` | 2 |
| `EXECUTION_AGENT` | 1 |
| `TECHNICAL_ADMIN` | 1 |

Soit **6 rôles distincts** effectivement attribués, pour **12 utilisateurs** ayant au moins un rôle (1 utilisateur sans rôle : `allirant.nzi@laposte.ci`).

Rôles déclarés mais **absents de la base** `dpmg` : `DELEGATED_REPRESENTATIVE`, `DEPARTMENT_DELEGATE`, `DPMG_DELEGATE`, `DFC_CONTROLLER`, `CPMP_USER`, `DG_USER`, `SUPER_ADMIN`.

Utilisateurs et structures (extrait, sans secrets) :

| Utilisateur | Rôle(s) | Structure | Scope |
|---|---|---|---|
| `eyemon.poupouya@laposte.ci` (Administrateur DPMG) | `TECHNICAL_ADMIN`, `DPMG_MANAGER` | (global) | `*` |
| `koua.alexis@laposte.ci` | `DPMG_MANAGER` | `DIR-DPMG` | (null) |
| `douzo.guehi@laposte.ci` | `HIERARCHICAL_MANAGER` | `DCR-INTRA-MUROS` | (null) |
| `konate.mamourou@laposte.ci` | `DEPARTMENT_MANAGER` | `INFRA` | (null) |
| `gbeu.olivier@laposte.ci` | `DEPARTMENT_MANAGER` | `LOGIS` | (null) |
| `theodore.kouame@laposte.ci` | `DEPARTMENT_MANAGER` | `DFC` | (null) |
| `ossiri.simon@laposte.ci` | `DEPARTMENT_MANAGER` | `CPMP` | (null) |
| `koffi.elysee@laposte.ci` | `EXECUTION_AGENT` | `LOGIS` | (null) |
| `receveur.abidjan01@laposte.ci` | `EMPLOYEE` | `ABJ-01` | (null) |
| `receveur.abidjan18@laposte.ci` | `EMPLOYEE` | `ABJ-18` | (null) |
| `bombo.djany@laposte.ci` | `EMPLOYEE` | `DIR-GLE` | (null) |

Observations données :
- Aucun `SUPER_ADMIN` en base.
- Aucun `DFC_CONTROLLER`, `CPMP_USER`, `DG_USER` en base (les structures DFC et CPMP sont couvertes par des `DEPARTMENT_MANAGER`, ce qui ne leur confère pas les droits financiers/observation prévus).
- Les scopes sont `null` pour tous les rôles sauf `eyemon` (`*`) ; selon le code, un scope `null` ne confère aucun droit départemental pour `DEPARTMENT_MANAGER`/`DFC_CONTROLLER`/etc. (voir `targetsDepartment`, `dfcScopeCovers`). Les responsables de département réels pourraient donc ne pas avoir accès aux demandes de leur département via les chemins scope-dépendants, sauf rattachement structurel.

---

## 9. Incohérences backend / frontend / Prisma

1. **Interface d'affectation incomplète** : `UtilisateurForm.tsx` `roleOptions` (lignes 306-314) n'expose que 7 rôles sur 13. Manquants : `DELEGATED_REPRESENTATIVE`, `DEPARTMENT_DELEGATE`, `DPMG_DELEGATE`, `DFC_CONTROLLER`, `CPMP_USER`, `DG_USER`.
2. **Libellés manquants** : `ROLE_LABELS` dans `UtilisateurForm.tsx` (lignes 25-37) ne contient pas `DELEGATED_REPRESENTATIVE` ni `DEPARTMENT_DELEGATE` → affichage brut du code technique.
3. **Filtre de rôle limité** : `UtilisateursPage.tsx` (lignes 247-251) ne propose que 3 rôles au filtrage.
4. **Frontend `canValidate` incomplet** : `DemandeDetailPage.tsx` (ligne 108) n'inclut pas `DELEGATED_REPRESENTATIVE`, alors que le backend peut désigner un délégué comme validateur (`validation.service.ts`). Bouton de validation masqué pour ces utilisateurs.
5. **Routes base de données réservées à `TECHNICAL_ADMIN`** : `database-admin.ts` (lignes 23-55) exige `TECHNICAL_ADMIN` uniquement ; un `SUPER_ADMIN` n'y a pas accès (peut être voulu, mais non documenté).
6. **Délégations non créables depuis l'UI** : aucun champ `delegatedFromUserId` dans `UtilisateurForm.tsx` ; les délégations ne peuvent être créées que via l'API.
7. **`SUPER_ADMIN` absent de la base réelle** : le rôle existe et est testé, mais aucun compte ne le porte en production actuelle.
8. **Migration non appliquée** : `20261114000000_add_demande_en_attente_analyse_notification` est présente dans le dépôt mais absente de `_prisma_migrations` de `dpmg`.

---

## 10. Rôles redondants / chevauchements

- `TECHNICAL_ADMIN` et `SUPER_ADMIN` : deux niveaux d'administration technique avec des capacités très proches ; `SUPER_ADMIN` est au-dessus (peut gérer `TECHNICAL_ADMIN`). Redondance partielle, mais justifiée par la protection du dernier administrateur.
- `DEPARTMENT_MANAGER` et `HIERARCHICAL_MANAGER` : tous deux apparaissent dans `MANAGER_ROLES` (`demandes.ts`, lignes 45-51) et peuvent influencer la validation/visibilité ; leurs pouvoirs réels diffèrent (hiérarchique = validation d'approbation ; département = avis/exécution).
- `*_DELEGATE` / `DELEGATED_REPRESENTATIVE` : rôles de délégation qui doublonnent les rôles de base correspondants ; nécessaires au mécanisme de délégation.

---

## 11. Fonctionnalités manquantes

- Affectation UI des rôles `DFC_CONTROLLER`, `CPMP_USER`, `DG_USER`, `DPMG_DELEGATE`, `DEPARTMENT_DELEGATE`, `DELEGATED_REPRESENTATIVE`.
- Libellés français pour `DELEGATED_REPRESENTATIVE` et `DEPARTMENT_DELEGATE` dans l'UI.
- Création de délégations depuis l'interface (`delegatedFromUserId`, `delegationNote`).
- Filtre de rôle complet dans `UtilisateursPage`.
- Alignement frontend `canValidate` avec le backend (inclure `DELEGATED_REPRESENTATIVE`).
- Affectation d'un `SUPER_ADMIN` en base (aucun compte actuellement).

---

## 12. Recommandations (sans implémentation)

1. Compléter `roleOptions` et `ROLE_LABELS` dans `UtilisateurForm.tsx` pour les 13 rôles, avec libellés français.
2. Ajouter un champ `delegatedFromUserId` (sélecteur d'utilisateur) dans le formulaire d'affectation pour créer des délégations depuis l'UI.
3. Étendre `canValidate` dans `DemandeDetailPage.tsx` pour inclure `DELEGATED_REPRESENTATIVE` (alignement avec `validation.service.ts`).
4. Étendre le filtre de rôle dans `UtilisateursPage.tsx` à l'ensemble des 13 rôles.
5. Documenter la différence entre `TECHNICAL_ADMIN` et `SUPER_ADMIN` et les accès (notamment base de données).
6. Appliquer la migration `20261114000000_add_demande_en_attente_analyse_notification` à la base `dpmg` après validation.
7. Vérifier/corriger les données réelles : attribuer `DFC_CONTROLLER`, `CPMP_USER`, `DG_USER` aux bons utilisateurs ; corriger les scopes `null` des responsables de département ; attribuer un `SUPER_ADMIN` si nécessaire.
8. Clarifier dans le code ou la documentation le mapping "Directeur DPMG" → `DPMG_MANAGER`.

---

## Conclusion

DPMG possède aujourd'hui **13 rôles déclarés** dans Prisma et le shared (`EMPLOYEE`, `HIERARCHICAL_MANAGER`, `DELEGATED_REPRESENTATIVE`, `DEPARTMENT_MANAGER`, `DEPARTMENT_DELEGATE`, `DPMG_MANAGER`, `DPMG_DELEGATE`, `DFC_CONTROLLER`, `CPMP_USER`, `DG_USER`, `EXECUTION_AGENT`, `TECHNICAL_ADMIN`, `SUPER_ADMIN`).

Tous sont **implémentés côté backend** (autorisations, visibilité, délégations). **7 sont pleinement opérationnels et attribuables via l'interface** (`EMPLOYEE`, `HIERARCHICAL_MANAGER`, `DEPARTMENT_MANAGER`, `DPMG_MANAGER`, `EXECUTION_AGENT`, `TECHNICAL_ADMIN`, `SUPER_ADMIN`). Les **6 autres** (`DELEGATED_REPRESENTATIVE`, `DEPARTMENT_DELEGATE`, `DPMG_DELEGATE`, `DFC_CONTROLLER`, `CPMP_USER`, `DG_USER`) sont implémentés côté backend mais **non attribuables depuis l'interface** et partiellement supportés côté frontend.

En base réelle (`dpmg`), seuls **6 rôles** sont effectivement attribués (`EMPLOYEE`, `HIERARCHICAL_MANAGER`, `DEPARTMENT_MANAGER`, `DPMG_MANAGER`, `EXECUTION_AGENT`, `TECHNICAL_ADMIN`) ; aucun `SUPER_ADMIN`, `DFC_CONTROLLER`, `CPMP_USER`, `DG_USER`, ni rôle de délégation. Les correspondances administratives confirmées par le code sont : `DEPARTMENT_MANAGER` pour les responsables de département, `HIERARCHICAL_MANAGER` pour le Directeur Régional, `DPMG_MANAGER` pour le décideur DPMG, `DFC_CONTROLLER` pour la DFC, `CPMP_USER` pour la CPMP, `DG_USER` pour le DG, `TECHNICAL_ADMIN`/`SUPER_ADMIN` pour les administrateurs techniques, et les rôles `*_DELEGATE`/`DELEGATED_REPRESENTATIVE` pour les représentants délégués.
