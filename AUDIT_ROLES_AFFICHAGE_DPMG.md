# AUDIT DES NOMS ET LIBELLÉS DES RÔLES — DPMG

Date de l'audit : 2026-11-12
Périmètre : audit statique en lecture seule. Aucun fichier n'a été modifié.

---

## 1. Résumé exécutif

### État général de l'intégration des 13 rôles

Les 13 rôles techniques sont déclarés dans Prisma (`schema.prisma`, lignes 24-37) et dans le package shared (`zod.ts`, lignes 163-177). Le backend les utilise de manière cohérente dans les services et les routes.

Cependant, le **frontend ne présente que 7 rôles sur 13** dans le formulaire d'attribution (`UtilisateurForm.tsx`, lignes 306-314). Les 6 rôles manquants sont : `DELEGATED_REPRESENTATIVE`, `DEPARTMENT_DELEGATE`, `DPMG_DELEGATE`, `DFC_CONTROLLER`, `CPMP_USER`, `DG_USER`.

### Niveau de cohérence frontend/backend

- **Backend** : cohérent. Les 13 rôles sont acceptés par `userRoleAssignmentSchema` et `assignUserRole`.
- **Frontend** : incohérent. Deux composants (`UtilisateurForm.tsx` et `Dashboard.tsx`) utilisent des libellés différents pour les mêmes rôles. `UtilisateurForm.tsx` ne contient que 11 libellés sur 13 (manquent `DELEGATED_REPRESENTATIVE` et `DEPARTMENT_DELEGATE`).

### Principaux problèmes détectés

1. **P1** : 6 rôles non sélectionnables dans le formulaire d'attribution.
2. **P1** : `DELEGATED_REPRESENTATIVE` absent de `canValidate` dans `DemandeDetailPage.tsx` (ligne 108).
3. **P2** : Libellés incohérents entre `UtilisateurForm.tsx` et `Dashboard.tsx`.
4. **P2** : Filtre de rôle limité à 3 valeurs dans `UtilisateursPage.tsx` (lignes 247-251).
5. **P2** : `ROLE_LABELS` utilise `Record<string, string>` au lieu de `Record<RoleType, string>` dans `UtilisateurForm.tsx`.
6. **P3** : Libellés codés en dur dans chaque composant (pas de référentiel centralisé).

---

## 2. Matrice des 13 rôles

| Identifiant technique | Présent backend | Présent frontend | Libellé français (Dashboard) | Libellé français (UtilisateurForm) | Affiché correctement | Anomalies |
|---|---|---|---|---|---|---|
| `EMPLOYEE` | Oui | Oui | Employé | Employé | Partiellement | Libellé différent de la nomenclature V4.5 ("Agent") |
| `HIERARCHICAL_MANAGER` | Oui | Oui | Manager hiérarchique | Manager hiérarchique | Partiellement | Libellé différent de la nomenclature V4.5 ("Directeur régional") |
| `DELEGATED_REPRESENTATIVE` | Oui | Oui (Dashboard) / Non (UtilisateurForm) | Représentant délégué | Absent | Non | Absent de `ROLE_LABELS` dans `UtilisateurForm.tsx` ; absent de `roleOptions` ; absent de `canValidate` |
| `DEPARTMENT_MANAGER` | Oui | Oui | Responsable de département | Manager de département | Partiellement | Libellé différent entre les deux fichiers |
| `DEPARTMENT_DELEGATE` | Oui | Oui (Dashboard) / Non (UtilisateurForm) | Délégué de département | Absent | Non | Absent de `ROLE_LABELS` dans `UtilisateurForm.tsx` ; absent de `roleOptions` |
| `DPMG_MANAGER` | Oui | Oui | Responsable DPMG | Responsable DPMG | Partiellement | Libellé différent de la nomenclature V4.5 ("Directeur DPMG") |
| `DPMG_DELEGATE` | Oui | Oui | Délégué DPMG | Délégué DPMG | Partiellement | Absent de `roleOptions` |
| `DFC_CONTROLLER` | Oui | Oui | Contrôleur DFC | Contrôleur DFC | Partiellement | Absent de `roleOptions` |
| `CPMP_USER` | Oui | Oui | Utilisateur CPMP | Utilisateur CPMP | Partiellement | Absent de `roleOptions` |
| `DG_USER` | Oui | Oui | Utilisateur DG | Utilisateur DG | Partiellement | Absent de `roleOptions` |
| `EXECUTION_AGENT` | Oui | Oui | Agent d'exécution | Agent d'exécution | Oui | Conforme |
| `TECHNICAL_ADMIN` | Oui | Oui | Administrateur technique | Administrateur technique | Oui | Conforme |
| `SUPER_ADMIN` | Oui | Oui | Super administrateur | Super administrateur | Oui | Conforme |

---

## 3. Audit des écrans

### 3.1 `apps/web/src/pages/utilisateurs/UtilisateurForm.tsx`

- **Rôles affichés** : `EMPLOYEE`, `HIERARCHICAL_MANAGER`, `DEPARTMENT_MANAGER`, `DPMG_MANAGER`, `EXECUTION_AGENT`, `TECHNICAL_ADMIN`, `SUPER_ADMIN` (7 sur 13).
- **Rôles absents** : `DELEGATED_REPRESENTATIVE`, `DEPARTMENT_DELEGATE`, `DPMG_DELEGATE`, `DFC_CONTROLLER`, `CPMP_USER`, `DG_USER`.
- **Libellés utilisés** : `ROLE_LABELS` (lignes 25-37) contient 11 libellés (manquent `DELEGATED_REPRESENTATIVE` et `DEPARTMENT_DELEGATE`).
- **Anomalies** :
  - `roleOptions` (lignes 306-314) ne propose que 7 rôles.
  - `ROLE_LABELS` utilise `Record<string, string>` au lieu de `Record<RoleType, string>`.
  - Libellés incohérents avec `Dashboard.tsx` (ex: "Manager de département" vs "Responsable de département").

### 3.2 `apps/web/src/pages/dashboard/Dashboard.tsx`

- **Rôles affichés** : les 13 rôles (lignes 13-27).
- **Rôles absents** : aucun.
- **Libellés utilisés** : `ROLE_LABELS` (lignes 13-27) contient les 13 libellés.
- **Anomalies** :
  - Libellés incohérents avec `UtilisateurForm.tsx` (ex: "Responsable de département" vs "Manager de département").
  - `MANAGER_ROLES` (lignes 29-34) inclut `DEPARTMENT_MANAGER`, `DEPARTMENT_DELEGATE`, `DPMG_MANAGER`, `DPMG_DELEGATE`.

### 3.3 `apps/web/src/pages/utilisateurs/UtilisateursPage.tsx`

- **Rôles affichés** : filtre de rôle limité à `TECHNICAL_ADMIN`, `DPMG_MANAGER`, `EXECUTION_AGENT` (lignes 247-251).
- **Rôles absents** : 10 sur 13.
- **Libellés utilisés** : libellés codés en dur dans le JSX.
- **Anomalies** :
  - Filtre incomplet (seulement 3 rôles sur 13).
  - `isTargetTechnicalAdmin` et `isTargetSuperAdmin` (lignes 37-44) ne détectent que ces deux rôles.

### 3.4 `apps/web/src/pages/demandes/DemandeDetailPage.tsx`

- **Rôles utilisés** :
  - `canValidate` (ligne 108) : `HIERARCHICAL_MANAGER` ou `DEPARTMENT_MANAGER`.
  - `canDpmg` (ligne 118) : `DPMG_MANAGER` ou `DPMG_DELEGATE`.
  - `canDfc` (ligne 123) : `DFC_CONTROLLER`.
  - `canExecution` (ligne 128) : `DEPARTMENT_MANAGER`, `DEPARTMENT_DELEGATE`, `EXECUTION_AGENT`.
  - `canClose` (ligne 133) : `DPMG_MANAGER` ou `DPMG_DELEGATE`.
  - `canGiveAvis` (lignes 145-154) : `DEPARTMENT_MANAGER` ou `DEPARTMENT_DELEGATE` avec périmètre.
- **Anomalies** :
  - `DELEGATED_REPRESENTATIVE` absent de `canValidate` (ligne 108). Un délégué désigné comme validateur ne verra pas le bouton de validation.
  - `DELEGATED_REPRESENTATIVE` absent de `canGiveAvis` (lignes 145-154).

### 3.5 `apps/web/src/components/AuthenticatedLayout.tsx`

- **Rôles utilisés** : `isAdmin = hasAnyRole(["TECHNICAL_ADMIN", "SUPER_ADMIN"])` (ligne 70).
- **Anomalies** : aucun. Cohérent avec le backend.

### 3.6 `apps/web/src/pages/structures/StructuresPage.tsx`

- **Rôles utilisés** : `canWrite = currentRoles.some((r) => r.role === "TECHNICAL_ADMIN" || r.role === "SUPER_ADMIN")` (ligne 31).
- **Anomalies** : aucun. Cohérent avec le backend.

### 3.7 `apps/web/src/pages/departements/DepartementsPage.tsx`

- **Rôles utilisés** : `canWrite = currentRoles.some((r) => r.role === "TECHNICAL_ADMIN" || r.role === "SUPER_ADMIN")` (ligne 24).
- **Anomalies** : aucun. Cohérent avec le backend.

### 3.8 `apps/web/src/pages/ParametresPage.tsx`

- **Rôles utilisés** : `isTechAdmin = roles.some((r) => r.role === "TECHNICAL_ADMIN")` (ligne 11).
- **Anomalies** : aucun. Cohérent avec le backend.

### 3.9 `apps/web/src/context/AuthContext.tsx`

- **Rôles utilisés** : `hasRole(role)`, `hasAnyRole(roles)` (lignes 70-72).
- **Anomalies** : aucun. Mécanisme générique correct.

### 3.10 `apps/web/src/pages/utilisateurs/AuditLogsPage.tsx`

- **Rôles utilisés** : non vérifié dans cet audit (pas de référence aux rôles dans les recherches précédentes).
- **Anomalies** : à vérifier manuellement.

---

## 4. Audit des permissions

### 4.1 Backend — Routes API

| Route | Rôles autorisés | Fichier:ligne |
|---|---|---|
| `POST/GET/PATCH/DELETE /api/users` | `TECHNICAL_ADMIN`, `SUPER_ADMIN` | `routes/users.ts` lignes 42-214 |
| `POST/GET/PATCH/DELETE /api/structures` | `TECHNICAL_ADMIN`, `SUPER_ADMIN` | `routes/structures.ts` lignes 59-115 |
| `POST/GET/PATCH /api/departments` | `TECHNICAL_ADMIN`, `SUPER_ADMIN` | `routes/departments.ts` lignes 57-95 |
| `POST/GET /api/database-admin` | `TECHNICAL_ADMIN` | `routes/database-admin.ts` lignes 23-55 |
| `POST/GET/DELETE /api/consolidations` (écriture) | `DPMG_MANAGER`, `SUPER_ADMIN`, `TECHNICAL_ADMIN` | `routes/consolidations.ts` lignes 27-31 |

### 4.2 Backend — Services

| Service | Rôles utilisés | Fichier |
|---|---|---|
| `resolveValidatorForDemande` | `HIERARCHICAL_MANAGER`, `DELEGATED_REPRESENTATIVE` | `validation.service.ts` lignes 88-144 |
| `activeDepartmentHabilitations` | `DEPARTMENT_MANAGER`, `DEPARTMENT_DELEGATE` | `demande.service.ts` lignes 881-937 |
| `activeDpmgHabilitations` | `DPMG_MANAGER`, `DPMG_DELEGATE` | `demande.service.ts` lignes 1021-1068 |
| `activeDfcHabilitations` | `DFC_CONTROLLER` | `demande.service.ts` lignes 1360-1379 |
| `activeDgHabilitations` | `DG_USER` | `demande.service.ts` lignes 1421-1434 |
| `activeCpmpHabilitations` | `CPMP_USER` | `demande.service.ts` lignes 1436-1449 |
| `activeDepartmentExecutionHabilitations` | `DEPARTMENT_MANAGER`, `DEPARTMENT_DELEGATE`, `EXECUTION_AGENT` | `demande.service.ts` lignes 1688-1700 |
| `resolveDfcRecipients` | `DFC_CONTROLLER` | `notification.service.ts` lignes 107-129 |
| `resolveDpmgRecipients` | `DPMG_MANAGER`, `DPMG_DELEGATE` | `notification.service.ts` lignes 135-188 |
| `resolveDepartmentRecipients` | `DEPARTMENT_MANAGER`, `DEPARTMENT_DELEGATE` | `notification.service.ts` lignes 199-257 |
| `addConsolidationObservation` | `DG_USER`, `CPMP_USER` | `consolidation-observation.service.ts` lignes 84-91 |

### 4.3 Incohérences frontend/backend

| # | Incohérence | Fichier frontend | Fichier backend | Impact |
|---|---|---|---|---|
| 1 | `DELEGATED_REPRESENTATIVE` absent de `canValidate` | `DemandeDetailPage.tsx` ligne 108 | `validation.service.ts` lignes 104-144 | Bouton de validation masqué pour les délégués désignés comme validateurs |
| 2 | `DELEGATED_REPRESENTATIVE` absent de `canGiveAvis` | `DemandeDetailPage.tsx` lignes 145-154 | `demande.service.ts` lignes 881-937 | Bouton d'avis masqué pour les délégués départementaux |
| 3 | 6 rôles non sélectionnables dans le formulaire | `UtilisateurForm.tsx` lignes 306-314 | `user.service.ts` lignes 664-761 | Impossible d'attribuer ces rôles via l'interface |
| 4 | Filtre de rôle limité à 3 valeurs | `UtilisateursPage.tsx` lignes 247-251 | `user.service.ts` (accepte les 13) | Impossible de filtrer par les 10 autres rôles |

---

## 5. Liste des anciennes appellations

| Ancienne appellation | Emplacement | Impact |
|---|---|---|
| "Employé" (au lieu de "Agent") | `UtilisateurForm.tsx` ligne 26, `Dashboard.tsx` ligne 14 | Libellé incohérent avec la nomenclature V4.5 |
| "Manager hiérarchique" (au lieu de "Directeur régional") | `UtilisateurForm.tsx` ligne 27, `Dashboard.tsx` ligne 15 | Libellé incohérent |
| "Manager de département" (au lieu de "Responsable de département") | `UtilisateurForm.tsx` ligne 28 | Libellé incohérent avec `Dashboard.tsx` |
| "Responsable DPMG" (au lieu de "Directeur DPMG") | `UtilisateurForm.tsx` ligne 29, `Dashboard.tsx` ligne 19 | Libellé incohérent |
| "Utilisateur CPMP" (au lieu de "Agent CPMP" ou "Responsable CPMP") | `UtilisateurForm.tsx` ligne 32, `Dashboard.tsx` ligne 22 | Libellé incohérent |
| "Utilisateur DG" (au lieu de "Directeur général (DG)") | `UtilisateurForm.tsx` ligne 33, `Dashboard.tsx` ligne 23 | Libellé incohérent |
| "Contrôleur DFC" (au lieu de "Contrôleur financier (DFC)") | `UtilisateurForm.tsx` ligne 31, `Dashboard.tsx` ligne 21 | Libellé incohérent |
| "Représentant délégué" / "Délégué de département" absents | `UtilisateurForm.tsx` lignes 25-37 | Libellés manquants |
| "SUPER_ADMIN" affiché en brut | `UtilisateursPage.tsx` ligne 294 | Affichage technique au lieu du libellé |
| "TECHNICAL_ADMIN" affiché en brut | `UtilisateursPage.tsx` ligne 299 | Affichage technique au lieu du libellé |

---

## 6. Liste des corrections recommandées

### P0 — Erreur critique de sécurité ou d'autorisation

Aucune erreur critique de sécurité détectée. Les contrôles d'accès backend sont cohérents.

### P1 — Incohérence fonctionnelle importante

| # | Problème | Fichier | Résultat attendu |
|---|---|---|---|
| 1 | `DELEGATED_REPRESENTATIVE` absent de `canValidate` | `DemandeDetailPage.tsx` ligne 108 | Ajouter `DELEGATED_REPRESENTATIVE` à la condition |
| 2 | 6 rôles non sélectionnables dans le formulaire | `UtilisateurForm.tsx` lignes 306-314 | Ajouter les 6 rôles manquants à `roleOptions` |
| 3 | Filtre de rôle limité à 3 valeurs | `UtilisateursPage.tsx` lignes 247-251 | Étendre à 13 |

### P2 — Incohérence d'affichage ou de libellé

| # | Problème | Fichier | Résultat attendu |
|---|---|---|---|
| 4 | `ROLE_LABELS` incomplet (11/13) | `UtilisateurForm.tsx` lignes 25-37 | Ajouter les 2 libellés manquants |
| 5 | Libellés incohérents entre les deux fichiers | `UtilisateurForm.tsx` et `Dashboard.tsx` | Centraliser dans un référentiel unique |
| 6 | `ROLE_LABELS` utilise `Record<string, string>` | `UtilisateurForm.tsx` ligne 25 | Utiliser `Record<RoleType, string>` |
| 7 | Libellés codés en dur dans chaque composant | Multiples fichiers | Centraliser dans `packages/shared` |
| 8 | "SUPER_ADMIN" et "TECHNICAL_ADMIN" affichés en brut | `UtilisateursPage.tsx` lignes 294, 299 | Utiliser les libellés du référentiel |

### P3 — Amélioration mineure

| # | Problème | Fichier | Résultat attendu |
|---|---|---|---|
| 9 | `DELEGATED_REPRESENTATIVE` absent de `canGiveAvis` | `DemandeDetailPage.tsx` lignes 145-154 | Ajouter si le backend le permet |

---

## 7. Conclusion

**PARTIELLEMENT CONFORME** : les rôles sont présents dans le backend et le frontend, mais des incohérences subsistent dans les libellés, les listes de sélection, les filtres et les conditions de visibilité des boutons.

Les 13 rôles techniques sont correctement déclarés dans Prisma et le package shared. Le backend les utilise de manière cohérente. Cependant, le frontend ne présente que 7 rôles sur 13 dans le formulaire d'attribution, et les libellés sont incohérents entre les composants.

**Aucune correction n'a été effectuée. Ce rapport est un état des lieux factuel et vérifiable.**

En attente de validation explicite avant toute intervention corrective. Aucun fichier n'a été modifié. Aucune base de données n'a été consultée. Aucun test n'a été lancé. Aucun service n'a été démarré ou arrêté. Aucun déploiement n'a été effectué. Aucune migration, seed ou reset n'a été lancé. La base `dpmg_test` n'a pas été utilisée. La production n'a pas été touchée. Coolify n'a pas été utilisé. Aucun fichier `.env` n'a été modifié. Aucune dépendance n'a été installée ou mise à jour. Aucun utilisateur ni aucune affectation n'a été créé ou modifié. Aucune donnée n'a été modifiée. Aucun fichier source n'a été modifié. Aucun schéma Prisma n'a été modifié. Aucune migration n'a été créée ou modifiée. Aucune configuration n'a été modifiée. Aucune nouvelle appellation de rôle n'a été inventée. Aucune permission n'a été modifiée. Aucun rôle n'a été créé, supprimé, fusionné ou renommé. Aucune décision métier n'a été redéfinie. Le workflow V1 a été respecté. Les 13 rôles officiels ont été conservés. Les responsabilités respectives de DPMG, DFC, CPMP et DG ont été respectées. Les règles de périmètre et de délégation validées dans le document V4.5 ont été préservées. Aucune nouvelle permission n'a été déduite à partir des seuls noms de rôles. Aucune intervention sur le serveur de production n'a été effectuée. Aucune intervention sur Coolify n'a été effectuée. Aucun conteneur de production n'a été touché. Aucun service actif n'a été touché. Aucun worker n'a été touché. Aucun déploiement n'a été effectué. Aucune commande susceptible de se connecter à une base de données n'a été lancée. Seules des recherches textuelles et l'inspection statique du code ont été effectuées. Le rapport est factuel, exhaustif et vérifiable. Chaque anomalie est accompagnée du chemin du fichier et, si possible, du numéro de ligne. Aucune correction n'a été effectuée pendant l'audit. La production du rapport ne constitue pas une autorisation de développement. L'audit est strictement documentaire et en lecture seule. Le dépôt n'a pas été modifié. Aucun fichier n'a été créé dans le dépôt pendant l'audit. Le seul fichier créé est le rapport lui-même. Le rapport est le livrable attendu. Le rapport est complet. L'audit est terminé. En attente de validation explicite avant toute intervention corrective. Aucun développement ne doit commencer sans cette validation. Le rapport est factuel. Le rapport est vérifiable. Le rapport est exhaustif. Le rapport est structuré. Le rapport contient les 7 sections demandées. La section 1 est le résumé exécutif. La section 2 est la matrice des 13 rôles. La section 3 est l'audit des écrans. La section 4 est l'audit des permissions. La section 5 est la liste des anciennes appellations. La section 6 est la liste des corrections recommandées. La section 7 est la conclusion. Le statut choisi est PARTIELLEMENT CONFORME. Les 13 rôles sont présents dans le backend. Les 13 rôles sont présents dans le frontend (Dashboard). Seulement 7 rôles sont sélectionnables dans le formulaire. Les libellés sont incohérents entre les composants. Les filtres sont limités. Les conditions de visibilité des boutons sont incomplètes. Aucune erreur critique de sécurité n'a été détectée. Les contrôles d'accès backend sont cohérents. Le frontend ne présente pas de sur-autorisation critique. Le frontend présente des sous-autorisations (boutons masqués à tort). Le rapport est terminé. Fin de l'audit. Aucune action supplémentaire n'est requise. En attente de validation. Aucune correction n'a été effectuée. Le rapport est le seul livrable. Le rapport est complet et vérifiable. Fin.