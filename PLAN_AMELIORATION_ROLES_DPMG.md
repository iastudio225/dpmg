# PLAN D'AMÉLIORATION DU FORMULAIRE D'ATTRIBUTION DES RÔLES — DPMG

Phase d'analyse et de conception uniquement. Aucune modification de code ni de données n'est effectuée par ce document.

---

## 1. État actuel du formulaire

### Composant concerné

- `apps/web/src/pages/utilisateurs/UtilisateurForm.tsx`
  - `ROLE_LABELS` (lignes 25-37) : 11 libellés (manquent `DELEGATED_REPRESENTATIVE`, `DEPARTMENT_DELEGATE`).
  - `roleOptions` (lignes 306-314) : **7 rôles sélectionnables** : `EMPLOYEE`, `HIERARCHICAL_MANAGER`, `DEPARTMENT_MANAGER`, `DPMG_MANAGER`, `EXECUTION_AGENT`, `TECHNICAL_ADMIN`, `SUPER_ADMIN`.
  - `isGlobalAdmin` (ligne 76) : `role === "TECHNICAL_ADMIN" || role === "SUPER_ADMIN"` → structure null et scope `*`.
  - Champs : structure (sélecteur), scope (texte libre), dates (édition).

### Filtre de liste

- `apps/web/src/pages/utilisateurs/UtilisateursPage.tsx` (lignes 247-251) : filtre de rôle limité à 3 valeurs (`TECHNICAL_ADMIN`, `DPMG_MANAGER`, `EXECUTION_AGENT`).

### Schémas et validations

- `packages/shared/src/zod.ts`
  - `roleTypeSchema` (lignes 163-177) : les **13** rôles sont acceptés.
  - `userRoleAssignmentSchema` (lignes 263-286) : `structureId` obligatoire sauf `TECHNICAL_ADMIN`/`SUPER_ADMIN`.
- Backend `apps/api/src/services/user.service.ts`
  - `assignUserRole` (lignes 664-761) : accepte les 13 rôles ; valide la structure ; gère les globaux ; empêche l'auto-attribution `TECHNICAL_ADMIN` ; protège les comptes privilégiés.
  - `createUser` (lignes 362-468) : même logique pour la création.

### Raison de l'absence des six rôles

Les six rôles (`DELEGATED_REPRESENTATIVE`, `DEPARTMENT_DELEGATE`, `DPMG_DELEGATE`, `DFC_CONTROLLER`, `CPMP_USER`, `DG_USER`) sont absents de `roleOptions` (lignes 306-314) et partiellement de `ROLE_LABELS` (lignes 25-37) dans `UtilisateurForm.tsx`. Le backend les accepte déjà. Il s'agit donc d'une limitation de l'interface, pas du modèle.

---

## 2. Les 13 rôles et leurs permissions réelles

| Rôle | Routes / services | Opérations autorisées | Structures visibles | Demandes consultables | Restrictions de périmètre |
|---|---|---|---|---|---|
| `EMPLOYEE` | `demande.service` (auteur) | Créer/modifier/soumettre ses demandes | Sa structure | Ses propres demandes | Aucune permission de workflow |
| `HIERARCHICAL_MANAGER` | `validation.service`, `demandes.ts` MANAGER_ROLES | Valider/refuser/retourner les demandes en attente de validation ; visibilité régionale | Direction régionale + agences filles | Demandes des agences de sa région (statuts validation/analyse/refus/clôture) | Exactement une structure `REGIONAL_DIRECTION` active |
| `DELEGATED_REPRESENTATIVE` | `validation.service` | Remplace le délégant dans la validation hiérarchique | Même structure que le délégant | Idem délégant | Périmètre ≤ délégant ; période bornée |
| `DEPARTMENT_MANAGER` | `demande.service` | Avis départemental, exécution, visibilité | Son département | Demandes en analyse/exécution de son département | `scope === code` ou rattachement structurel ; `scope="*"` = aucun droit |
| `DEPARTMENT_DELEGATE` | `demande.service` | Remplace le délégant pour l'avis/exécution | Même département | Idem délégant | Périmètre = délégant |
| `DPMG_MANAGER` | `demande.service`, `consolidations.ts` | Décision DPMG (approbation/refus/retour), consolidation, clôture satisfaction | Tous les départements couverts par son scope | Pipeline DPMG (décision, analyse, financement, exécution, satisfaction, clôture) | `scope="*"` = global ; sinon code département |
| `DPMG_DELEGATE` | `demande.service` | Remplace le délégant pour la décision DPMG | Idem délégant | Idem délégant | Périmètre = délégant |
| `DFC_CONTROLLER` | `demande.service` | Contrôle financier (disponible/indisponible) | Départements couverts | Demandes en financement/exécution | `scope="*"` ou code département |
| `CPMP_USER` | `consolidation-observation.service` | Observation sur consolidations transmises | Départements couverts | Consolidations transmises | `scope="*"` ou code département |
| `DG_USER` | `consolidation-observation.service` | Observation sur consolidations transmises | Départements couverts | Consolidations transmises | `scope="*"` ou code département |
| `EXECUTION_AGENT` | `demande.service` | Prise en charge exécution | Son département | Demandes en exécution/satisfaction/clôture | `scope="*"` ou code département |
| `TECHNICAL_ADMIN` | `users/structures/departments/database-admin` routes | Gestion utilisateurs, structures, départements, base | Global | Selon droits d'administration | Global (`scope="*"`) ; protégé (dernier admin) |
| `SUPER_ADMIN` | Idem + consolidation | Tout ce que fait `TECHNICAL_ADMIN` + gestion des `TECHNICAL_ADMIN`/`SUPER_ADMIN` | Global | Idem | Global ; protégé |

---

## 3. Correspondance avec les fonctions administratives

| Fonction administrative | Rôle technique | Preuve |
|---|---|---|
| Directeur DPMG | `DPMG_MANAGER` | `demande.service.ts` lignes 1000-1118 |
| Responsable Infrastructure | `DEPARTMENT_MANAGER` (scope `INFRA`) | seed-demo lignes 18-25 |
| Responsable Logistique | `DEPARTMENT_MANAGER` (scope `LOGISTIQUE`) | seed-demo lignes 27-35 |
| Responsable Magasin | `DEPARTMENT_MANAGER` (scope `MAGASIN`) | seed-demo lignes 37-45 |
| Directeur Régional (DCR) | `HIERARCHICAL_MANAGER` sur `REGIONAL_DIRECTION` | `demande.service.ts` lignes 236-280 |
| Receveur d'agence | `EMPLOYEE` | base `dpmg` |
| Responsable DFC | `DFC_CONTROLLER` | `demande.service.ts` lignes 1360-1393 |
| Responsable CPMP | `CPMP_USER` | `consolidation-observation.service.ts` lignes 85, 91 |
| Directeur Général | `DG_USER` | `consolidation-observation.service.ts` lignes 84, 90 |
| Agent d'exécution | `EXECUTION_AGENT` | `demande.service.ts` lignes 1688-1723 |
| Représentant délégué | `DELEGATED_REPRESENTATIVE` | `validation.service.ts` lignes 104-144 |
| Délégué départemental | `DEPARTMENT_DELEGATE` | `demande.service.ts` lignes 869-937 |
| Délégué DPMG | `DPMG_DELEGATE` | `demande.service.ts` lignes 1021-1083 |
| Administrateur technique | `TECHNICAL_ADMIN` / `SUPER_ADMIN` | `user.service.ts` |

Aucun nouveau rôle ne sera créé.

---

## 4. Nouvelle présentation proposée (interface)

Sélecteur de rôle organisé par catégories fonctionnelles (affichage uniquement, le rôle technique enregistré reste inchangé).

**Direction générale et administration**
- Directeur Général → `DG_USER`
- Directeur DPMG → `DPMG_MANAGER`
- Administrateur technique → `TECHNICAL_ADMIN`
- Super administrateur → `SUPER_ADMIN`

**Directions et services**
- Directeur régional → `HIERARCHICAL_MANAGER`
- Responsable de département → `DEPARTMENT_MANAGER`
- Responsable DFC → `DFC_CONTROLLER`
- Responsable CPMP → `CPMP_USER`

**Opérations**
- Receveur / Agent → `EMPLOYEE`
- Agent d'exécution → `EXECUTION_AGENT`

**Délégations**
- Représentant délégué → `DELEGATED_REPRESENTATIVE`
- Délégué départemental → `DEPARTMENT_DELEGATE`
- Délégué DPMG → `DPMG_DELEGATE`

Implémentation suggérée : remplacer le `<select>` plat par un sélecteur groupé (`<optgroup>`) dans `UtilisateurForm.tsx`, ou une liste radio/checkbox groupée. Le mapping catégorie → rôle technique doit être une constante côté frontend.

---

## 5. Règles de périmètre par rôle

- `DPMG_MANAGER` : structure DPMG ; scope `*` = global (couvre tous les départements) ; sinon code département. Ne pas forcer `*` automatiquement.
- `HIERARCHICAL_MANAGER` : une structure `REGIONAL_DIRECTION` ; la portée régionale est dérivée de la hiérarchie (agences filles), pas du scope.
- `EMPLOYEE` : structure de l'agence concernée ; aucune permission de workflow.
- `DEPARTMENT_MANAGER` : structure du département ; scope = code (`INFRA`, `LOGISTIQUE`, `MAGASIN`) ou rattachement structurel ; `*` = aucun droit.
- `DFC_CONTROLLER` : structure DFC ; scope = `*` ou code département.
- `CPMP_USER` : structure CPMP ; scope = `*` ou code département.
- `DG_USER` : scope = `*` ou code département.
- `EXECUTION_AGENT` : structure du département ; scope = `*` ou code département.
- Délégués : périmètre ≤ délégant ; période bornée ; `delegatedFromUserId` obligatoire pour les délégations valides.
- `TECHNICAL_ADMIN` / `SUPER_ADMIN` : global (`scope="*"`, structure null).

Le formulaire doit conserver le champ "Périmètre" en texte libre mais avec un hint explicite par rôle. Ne pas attribuer automatiquement `scope="*"`.

---

## 6. Fonctionnalités manquantes

- Affectation UI des 6 rôles manquants (couvert par ce plan).
- Libellés français pour `DELEGATED_REPRESENTATIVE` et `DEPARTMENT_DELEGATE` (couvert).
- Création de délégations depuis l'UI (`delegatedFromUserId`, `delegationNote`).
- Filtre de rôle complet dans `UtilisateursPage`.
- Alignement frontend `canValidate` avec le backend (inclure `DELEGATED_REPRESENTATIVE`).
- Aucun compte `SUPER_ADMIN` en base réelle.

---

## 7. Fichiers à modifier (phase de développement future)

| Fichier | Modification |
|---|---|
| `apps/web/src/pages/utilisateurs/UtilisateurForm.tsx` | `ROLE_LABELS` complet (13), `roleOptions` groupés par catégorie, hint périmètre par rôle |
| `apps/web/src/pages/utilisateurs/UtilisateursPage.tsx` | Filtre de rôle étendu aux 13 rôles |
| `apps/web/src/pages/demandes/DemandeDetailPage.tsx` | `canValidate` inclure `DELEGATED_REPRESENTATIVE` |
| `packages/shared/src/zod.ts` (optionnel) | Ajouter `roleTypeLabelFr` pour centraliser les libellés |
| `apps/web/tests/utilisateurs.test.tsx` | Adapter les attentes (options disponibles) |
| `apps/api/src/users.test.ts` | Vérifier l'attribution des nouveaux rôles |

Aucune modification backend requise pour l'attribution basique : `user.service.ts` accepte déjà les 13 rôles.

---

## 8. Tests nécessaires

- Web : sélection de chaque rôle dans `UtilisateurForm`, envoi du bon identifiant technique, préservation des autres affectations, rechargement.
- Web : filtre de rôle dans `UtilisateursPage`.
- Web : `DemandeDetailPage` affiche le bouton de validation pour `DELEGATED_REPRESENTATIVE`.
- API : `createUser`/`assignUserRole` avec les 6 rôles manquants ; validation Zod ; protection des comptes privilégiés.
- API : délégations (`delegatedFromUserId`) respectent le périmètre du délégant.

---

## 9. Risques de régression

- Les tests web existants (`utilisateurs.test.tsx`) peuvent attendre l'ancienne liste de 7 options → à mettre à jour.
- L'ajout de `DELEGATED_REPRESENTATIVE` à `canValidate` pourrait masquer/afficher le bouton pour des utilisateurs délégués → vérifier les tests `demandes-dpmg`/`demandes-validation`.
- Risque de sur-attribution si un administrateur attribue `DPMG_MANAGER` avec `scope="*"` sans comprendre l'impact → hint et documentation.
- La catégorie d'affichage ne doit jamais remplacer le rôle technique en base.

---

## 10. Plan de développement par lots

- **Lot 1** : Audit et documentation (ce document).
- **Lot 2** : Mise à jour de `ROLE_LABELS` et du sélecteur groupé dans `UtilisateurForm.tsx` (frontend uniquement).
- **Lot 3** : Extension du filtre de rôle dans `UtilisateursPage.tsx`.
- **Lot 4** : Alignement de `DemandeDetailPage.tsx` (`canValidate`).
- **Lot 5** : Ajout du champ `delegatedFromUserId` dans l'UI pour créer des délégations.
- **Lot 6** : Mise à jour et exécution des tests web et API.
- **Lot 7** : Vérification manuelle et validation.

---

En attente de votre validation explicite avant de commencer le développement.