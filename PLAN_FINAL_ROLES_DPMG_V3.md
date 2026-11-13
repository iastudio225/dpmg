# PLAN FINAL DES RÔLES DPMG — V3

Phase d'analyse et de conception uniquement. Aucun code ni donnée n'a été modifié.

---

## 1. Résumé exécutif

Le plan V3 finalise la conception de l'attribution des rôles dans DPMG en intégrant les décisions métier définitives validées par l'utilisateur : le DG consulte uniquement la consolidation transmise par la DPMG ; la CPMP recherche et enregistre le prestataire ; la DFC effectue le contrôle financier. La décision d'unicité du Directeur Régional (Option A) est confirmée.

Les 13 rôles existants sont conservés. Aucun nouveau rôle n'est créé. Le workflow V1 (mercredi : synthèses des directions ; jeudi : consolidation DPMG et transmission au DG ; DFC et CPMP en parallèle) est respecté.

Les six réserves sont traitées : réserve 4 (Directeur Régional unique) est RÉSOLUE ; les autres sont RÉSOLUES SOUS CONDITION.

---

## 2. Décisions métier définitives

### 2.1 Directeur Régional — Option A (une seule Direction Régionale)

Un utilisateur ayant le rôle `HIERARCHICAL_MANAGER` en qualité de Directeur Régional ne peut être affecté qu'à une seule structure active de type `REGIONAL_DIRECTION`. Les agences rattachées à cette Direction Régionale constituent son périmètre. Une deuxième affectation régionale active doit être refusée. En cas de changement, l'ancienne affectation doit être désactivée avant l'activation de la nouvelle. Une affectation sur une structure non régionale ne donne aucun droit régional.

### 2.2 Directeur DPMG

Directeur DPMG = `DPMG_MANAGER`. Ne pas utiliser `HIERARCHICAL_MANAGER` pour le représenter. `scope = null` = affectation incomplète et non opérationnelle. `scope = "*"` = accès global DPMG. `scope = code département` = périmètre limité. Ne jamais attribuer automatiquement `scope = "*"`.

### 2.3 Directeur Général — consultation uniquement

Le DG consulte simplement la consolidation transmise par la DPMG. Rôle technique : `DG_USER`. Permissions : consulter les consolidations transmises, consulter les informations nécessaires à sa mission. Interdictions : modifier les consolidations, approuver ou refuser les demandes, effectuer une validation départementale, effectuer une décision DPMG, effectuer une validation financière.

### 2.4 CPMP — recherche et enregistrement du prestataire

La CPMP recherche le prestataire et enregistre directement dans DPMG les informations du prestataire identifié. Rôle technique : `CPMP_USER`. La CPMP peut consulter les consolidations et demandes de son périmètre, rechercher et identifier un prestataire, enregistrer un prestataire dans le dossier de la demande, ajouter ou modifier les informations du prestataire, joindre un devis et des documents justificatifs, ajouter des observations, transmettre les informations du prestataire à la DFC. La CPMP ne peut pas valider la disponibilité financière, refuser ou approuver le contrôle financier à la place de la DFC, modifier une décision financière de la DFC, effectuer une décision DPMG.

### 2.5 DFC — contrôle et validation financière

Rôle technique : `DFC_CONTROLLER`. La DFC est responsable de la validation financière. Elle intervient après la recherche et l'enregistrement du prestataire par la CPMP. La DFC peut consulter les informations du prestataire, les devis et documents justificatifs, examiner le montant proposé, effectuer le contrôle financier, enregistrer une validation ou un refus financier, ajouter des observations et justifications, consulter l'historique. La DFC ne peut pas modifier les informations du prestataire à la place de la CPMP, effectuer la recherche du prestataire, prendre une décision DPMG.

### 2.6 Chaîne de traitement CPMP / DFC

1. La CPMP identifie un prestataire. 2. La CPMP enregistre ses informations dans le dossier de la demande. 3. La CPMP joint le devis et les justificatifs disponibles. 4. La CPMP transmet le dossier à la DFC. 5. La DFC examine le prestataire, le montant et les documents. 6. La DFC effectue le contrôle financier. 7. La DFC enregistre sa validation ou son refus avec ses observations. 8. Le résultat du contrôle est disponible pour la suite du workflow DPMG.

---

## 3. Vérification de l'architecture des structures

### 3.1 Enum StructureType

`database/prisma/schema.prisma` (lignes 16-22) : `DIRECTION`, `REGIONAL_DIRECTION`, `AGENCY`, `POINT_OF_SALE`, `OTHER`. `REGIONAL_DIRECTION` est déjà pris en charge. ✓

### 3.2 Migration 20261113000000

Nom : `20261113000000_add_regional_direction_structure_type`. Dossier daté du 10/11/2026, nom indiquant le 13/11/2026. La date du jour est le 12/11/2026. La migration est donc datée dans le futur par rapport à la date actuelle. C'est une incohérence de nommage, mais la migration est appliquée (vérifié dans `_prisma_migrations` : `finished_at = 2026-11-10 16:33:05`).

### 3.3 Migration 20261114000000 (non appliquée)

Contenu : `ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'DEMANDE_EN_ATTENTE_ANALYSE';`. Le type `DEMANDE_EN_ATTENTE_ANALYSE` est déjà présent dans l'enum `NotificationType` du schéma Prisma (ligne 293). La migration est donc redondante. Elle n'est pas appliquée à la base `dpmg` (absente de `_prisma_migrations`). Risque : aucun (la valeur existe déjà). Recommandation : l'appliquer pour la cohérence de l'historique des migrations, mais ce n'est pas bloquant.

### 3.4 Modèle Structure et Department

`Structure` : `id`, `code`, `name`, `type`, `parentId`, `status`. `Department` : `id`, `name`, `code`, `structureId` (unique, nullable). Relation `parent`/`children` pour la hiérarchie. Les agences sont rattachées à leur direction régionale via `parentId`. Les départements sont rattachés à leur structure via `Department.structureId`.

### 3.5 Écarts entre code et conception

| Élément | Code existant | Conception souhaitée | Écart |
|---|---|---|---|
| `REGIONAL_DIRECTION` | Présent | Présent | Aucun |
| Rattachement agences → direction régionale | `parentId` | `parentId` | Aucun |
| Rattachement département → structure | `Department.structureId` | `Department.structureId` | Aucun |
| Migration `20261114000000` | Non appliquée à `dpmg` | Appliquée | À appliquer (non bloquant) |

---

## 4. Matrice des 13 rôles

| # | Rôle | Fonction administrative | Structure d'affectation | Scope | Périmètre de visibilité | Permissions autorisées | Permissions interdites | Conditions d'opérationnalité | Comportement si incomplet |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `EMPLOYEE` | Receveur d'agence | Agence | (aucun) | Ses propres demandes | Créer/modifier/soumettre ses demandes | Aucune permission de workflow | Toujours | N/A |
| 2 | `HIERARCHICAL_MANAGER` | Directeur Régional (DCR) | `REGIONAL_DIRECTION` | (non utilisé) | Demandes des agences de sa région | Validation hiérarchique (approuver/refuser/retourner) | Accès aux autres régions | Exactement une `REGIONAL_DIRECTION` active | Aucun droit régional |
| 3 | `DELEGATED_REPRESENTATIVE` | Représentant délégué (validation) | Même structure que le délégant | ≤ délégant | Idem délégant | Validation hiérarchique (remplace le délégant) | Périmètre supérieur au délégant | Délégation valide (dates + délégant actif) | Non opérationnel |
| 4 | `DEPARTMENT_MANAGER` | Responsable de département | Département | Code ou null | Demandes de son département | Avis départemental, exécution, visibilité | Accès aux autres départements | Scope = code ou rattachement structurel | Accès refusé si structure non correspondante |
| 5 | `DEPARTMENT_DELEGATE` | Délégué départemental | Même département | = délégant | Idem délégant | Avis, exécution (remplace le délégant) | Périmètre supérieur au délégant | Délégation valide | Non opérationnel |
| 6 | `DPMG_MANAGER` | Décideur DPMG | DPMG (ou null si global) | `*` ou code | Pipeline DPMG | Décision, consolidation, clôture | Décision sur départements non couverts | Scope non null | Non opérationnel |
| 7 | `DPMG_DELEGATE` | Délégué DPMG | Même périmètre DPMG | = délégant | Idem délégant | Décision DPMG (remplace le délégant) | Périmètre supérieur au délégant | Délégation valide | Non opérationnel |
| 8 | `DFC_CONTROLLER` | Contrôleur financier DFC | DFC | `*` ou code | Demandes en financement/exécution | Contrôle financier (disponible/indisponible) | Décision DPMG, recherche prestataire | Scope = `*` ou code | Non opérationnel si scope null |
| 9 | `CPMP_USER` | Responsable CPMP | CPMP | `*` ou code | Consolidations transmises | Observation, recherche et enregistrement de prestataire | Validation financière, décision DPMG | Scope = `*` ou code | Non opérationnel si scope null |
| 10 | `DG_USER` | Directeur Général | (global) | `*` ou code | Consolidations transmises | Consultation uniquement | Toute modification, décision, validation | Scope = `*` ou code | Non opérationnel si scope null |
| 11 | `EXECUTION_AGENT` | Agent d'exécution | Département | `*` ou code | Demandes en exécution/satisfaction/clôture | Prise en charge exécution | Décision DPMG | Scope = `*` ou code | Non opérationnel si scope null |
| 12 | `TECHNICAL_ADMIN` | Administrateur technique | (null) | `*` | Global | Gestion complète | Aucune (sauf protection dernier admin) | Toujours | N/A |
| 13 | `SUPER_ADMIN` | Super administrateur | (null) | `*` | Global | Gestion complète + privilèges | Aucune (sauf protection dernier admin) | Toujours | N/A |

---

## 5. Matrice fonction / rôle / structure / scope / permissions

Voir section 4. Points clés :

- `scope = "*"` pour `DPMG_MANAGER` = accès global à tous les départements.
- `scope = "*"` pour `DEPARTMENT_MANAGER` / `DFC_CONTROLLER` / `CPMP_USER` / `DG_USER` / `EXECUTION_AGENT` = aucun droit (selon `targetsDepartment`, `dfcScopeCovers`, etc.).
- `scope = null` pour `DEPARTMENT_MANAGER` = droit si structure correspond au département.
- `scope = null` pour `DPMG_MANAGER` = aucun droit.
- Délégations : périmètre ≤ délégant, période bornée.

---

## 6. Règles de visibilité

### 6.1 Directeur DPMG
- Visibilité sur le pipeline DPMG (décision, analyse, financement, exécution, satisfaction, clôture) pour les départements couverts par son scope.
- `resolveDpmgDecisionDepartmentIds` (`demande.service.ts`, lignes 1107-1118).

### 6.2 Directeur Régional
- Visibilité sur les demandes des agences de sa région (validation, analyse, refus, clôture).
- `resolveRegionalAgencyAuthorIds` (`demande.service.ts`, lignes 236-280).

### 6.3 Receveur d'agence
- Visibilité limitée à ses propres demandes (`authorId = userId`).

### 6.4 Responsable de département
- Visibilité sur les demandes de son département (analyse, exécution).
- `resolveAnalyzableDepartmentIds` (`demande.service.ts`, lignes 944-955).

### 6.5 Contrôleur financier DFC
- Visibilité sur les demandes en financement/exécution de son périmètre.
- `resolveDfcDecisionDepartmentIds` (`demande.service.ts`, lignes 1386-1393).

### 6.6 CPMP et DG
- Visibilité sur les consolidations transmises.
- Pas de visibilité sur les demandes individuelles (observation uniquement).

### 6.7 Agent d'exécution
- Visibilité sur les demandes en exécution/satisfaction/clôture de son périmètre.
- `resolveExecutionDepartmentIds` (`demande.service.ts`, lignes 1716-1723).

---

## 7. Règle d'unicité du Directeur Régional

### 7.1 Règle métier

Un utilisateur ayant le rôle `HIERARCHICAL_MANAGER` en qualité de Directeur Régional ne peut être affecté qu'à une seule structure active de type `REGIONAL_DIRECTION`.

### 7.2 Vérification du code actuel

- `resolveRegionalAgencyAuthorIds` (`demande.service.ts`, lignes 236-280) : filtre `HIERARCHICAL_MANAGER` sur `structure.type === "REGIONAL_DIRECTION"`. Si `regionalStructureIds.length !== 1` → retourne `[]`.
- Le code applique déjà la règle, mais sans message d'erreur explicite (retour silencieux de tableau vide).
- Aucune validation frontend n'empêche la création d'une deuxième affectation active.

### 7.3 Contrôles manquants

**Backend** : Ajouter une validation dans `assignUserRole` (`user.service.ts`) : si le rôle est `HIERARCHICAL_MANAGER` et la structure est de type `REGIONAL_DIRECTION`, vérifier qu'il n'existe pas déjà une affectation active du même utilisateur sur une autre `REGIONAL_DIRECTION`. Si oui, refuser avec une erreur explicite.

**Frontend** : Afficher un avertissement si l'utilisateur a déjà une affectation active sur une autre Direction Régionale.

### 7.4 Tests à prévoir

- Affectation à une seule Direction Régionale : acceptée.
- Affectation à deux Directions Régionales actives : refusée.
- Accès aux agences de sa Direction Régionale : autorisé.
- Accès aux agences d'une autre Direction Régionale : refusé.
- Désactivation de l'ancienne affectation avant changement : acceptée.
- Affectation sur une structure non régionale : aucun droit régional.

---

## 8. Responsabilités DG, CPMP et DFC

### 8.1 Directeur Général (`DG_USER`)

- Consultation des consolidations transmises par la DPMG.
- Consultation des informations nécessaires à sa mission.
- Pas de modification, pas de décision, pas de validation.
- Le workflow V1 prévoit le DG dans le circuit de consultation (jeudi : consolidation transmise au DG).

### 8.2 Responsable CPMP (`CPMP_USER`)

- Consultation des consolidations et demandes de son périmètre.
- Recherche et identification d'un prestataire.
- Enregistrement du prestataire dans le dossier de la demande.
- Ajout de devis et documents justificatifs.
- Ajout d'observations.
- Transmission à la DFC.
- Pas de validation financière, pas de décision DPMG.

### 8.3 Contrôleur financier DFC (`DFC_CONTROLLER`)

- Consultation des informations du prestataire enregistrées par la CPMP.
- Consultation des devis et documents justificatifs.
- Contrôle financier (disponible/indisponible).
- Enregistrement d'une validation ou d'un refus financier avec observations.
- Pas de modification du prestataire, pas de recherche de prestataire, pas de décision DPMG.

---

## 9. Fonctionnalité de gestion des prestataires

### 9.1 Parcours utilisateur

1. La CPMP accède au dossier de la demande (consolidation transmise).
2. La CPMP recherche et identifie un prestataire.
3. La CPMP enregistre les informations du prestataire dans le dossier.
4. La CPMP joint le devis et les documents justificatifs.
5. La CPMP ajoute ses observations.
6. La CPMP transmet le dossier à la DFC.
7. La DFC consulte le dossier et effectue le contrôle financier.
8. La DFC enregistre sa validation ou son refus.

### 9.2 Données à prévoir

| Champ | Type | Obligatoire | Description |
|---|---|---|---|
| `id` | String (cuid) | Oui | Identifiant unique |
| `demandeId` | String (FK) | Oui | Demande associée |
| `nom` | String | Oui | Nom ou raison sociale du prestataire |
| `telephone` | String? | Non | Contact téléphonique |
| `adresse` | String? | Non | Adresse |
| `contact` | String? | Non | Coordonnées de contact |
| `description` | String? | Non | Description ou présentation |
| `montant` | Decimal? | Non | Montant de la proposition |
| `devise` | String? | Non | Devise |
| `devisUrl` | String? | Non | URL du devis |
| `observations` | String? | Non | Observations de la CPMP |
| `createdById` | String (FK User) | Oui | Utilisateur CPMP responsable |
| `createdAt` | DateTime | Oui | Date d'enregistrement |
| `updatedAt` | DateTime | Oui | Date de dernière modification |

La liaison directe à une demande est suffisante (pas besoin d'un référentiel global de prestataires).

### 9.3 Contrôle financier DFC

- Consultation du dossier transmis par la CPMP.
- Consultation des pièces jointes.
- Contrôle du montant.
- Décision financière (disponible/indisponible) avec observations.
- Historique et auteur de la validation.

### 9.4 Sécurité

- Consultation des pièces jointes : CPMP, DFC, DPMG, DG (selon périmètre).
- Ajout/modification des informations du prestataire : CPMP uniquement.
- Modification après transmission à la DFC : à définir (probablement verrouillé).
- Traçabilité : audit log pour chaque modification.
- Protection des documents : stockage sécurisé, accès authentifié.

### 9.5 Vérification du code existant

Aucun modèle `Prestataire` ou `Provider` n'existe dans le schéma Prisma. Aucune route ni service ne gère les prestataires. Cette fonctionnalité est entièrement à développer.

---

## 10. Règles complètes de délégation

### 10.1 Création d'une délégation

- Le champ `delegatedFromUserId` doit référencer un utilisateur actif.
- Le délégant doit posséder le rôle de base correspondant sur la même structure.
- Le périmètre du délégué ne peut pas dépasser celui du délégant.

### 10.2 Vérification du rôle du délégant

- `validation.service.ts` (lignes 127-144) : pour `DELEGATED_REPRESENTATIVE`, le délégant doit être un `HIERARCHICAL_MANAGER` actif sur la même structure.
- `demande.service.ts` (lignes 881-937) : pour `DEPARTMENT_DELEGATE`, le délégant doit être un `DEPARTMENT_MANAGER` actif.
- `demande.service.ts` (lignes 1021-1068) : pour `DPMG_DELEGATE`, le délégant doit être un `DPMG_MANAGER` actif.

### 10.3 Vérification de la structure et du périmètre

- `delegationCoversScope` (`validation.service.ts`, lignes 30-45) : le délégué ne reçoit jamais un périmètre plus large que le délégant.
- `habilitationCoversDepartment` (`demande.service.ts`, lignes 864-873) : pour les délégations départementales, le délégant doit couvrir le même département.
- `dpmgHabilitationCovers` (`demande.service.ts`, lignes 1074-1083) : pour les délégations DPMG, le délégant doit couvrir le même département.

### 10.4 Date de début et date de fin

- `startDate` : défaut `now()`.
- `endDate` : nullable (mais obligatoire pour les nouvelles délégations selon la V3).
- Bornes inclusives : `startDate <= now` et (`endDate` null ou `endDate >= now`).

### 10.5 Activation automatique selon les dates

- Le rôle est actif si `startDate <= now` et (`endDate` null ou `endDate >= now`).
- `getUserActiveRoles` (`auth.service.ts`, lignes 132-142) applique ces bornes.

### 10.6 Révocation anticipée

- Mettre à jour `endDate` à une date passée via `updateUserRole` (`user.service.ts`, lignes 763-816).
- Le rôle devient inactif immédiatement.

### 10.7 Désactivation du délégant

- Si le délégant est désactivé (`UserStatus !== ACTIVE`), la délégation est invalidée.
- `validation.service.ts` (ligne 131) vérifie `delegator.status !== UserStatus.ACTIVE`.

### 10.8 Expiration de la délégation

- Si `endDate` est passée, le rôle est inactif.
- Aucune notification automatique d'expiration (fonctionnalité manquante).

### 10.9 Traçabilité des actions du délégué

- Les décisions sont enregistrées avec `actorId = délégué` dans `DemandeDecision`.
- L'audit log enregistre l'action avec `actorId` et `details`.
- Le champ `delegatedFromUserId` permet de tracer le délégant.

### 10.10 Interdiction de dépasser les permissions du délégant

- Vérifié par `delegationCoversScope`, `habilitationCoversDepartment`, `dpmgHabilitationCovers`.

### 10.11 Prévention des délégations circulaires ou incohérentes

- Le code actuel ne vérifie pas les délégations circulaires.
- Fonctionnalité manquante : ajouter une vérification de cycle dans `assignUserRole`.

---

## 11. Traitement des affectations incomplètes

### 11.1 Règles

- `DPMG_MANAGER` avec `scope = null` : non opérationnel. Avertissement dans le formulaire.
- `HIERARCHICAL_MANAGER` sur une structure non `REGIONAL_DIRECTION` : pas de droits régionaux. Avertissement dans le formulaire.
- `DEPARTMENT_MANAGER` avec `scope = null` et structure ne correspondant pas au département : aucun accès. Avertissement dans le formulaire.
- Le formulaire doit signaler toute affectation incomplète sans l'interdire.

### 11.2 Avertissements du formulaire

| Rôle | Condition d'incomplétude | Message d'avertissement |
|---|---|---|
| `DPMG_MANAGER` | `scope` vide | "Scope obligatoire : `*` pour global ou code département" |
| `HIERARCHICAL_MANAGER` | Structure non `REGIONAL_DIRECTION` | "Doit être rattaché à une Direction Régionale pour les droits régionaux" |
| `DEPARTMENT_MANAGER` | `scope` vide et structure non correspondante | "Scope = code département ou laisser vide si la structure correspond" |
| `DFC_CONTROLLER` | `scope` vide | "Scope obligatoire : `*` ou code département" |
| `CPMP_USER` | `scope` vide | "Scope obligatoire : `*` ou code département" |
| `DG_USER` | `scope` vide | "Scope obligatoire : `*` ou code département" |
| `EXECUTION_AGENT` | `scope` vide | "Scope obligatoire : `*` ou code département" |

---

## 12. Présentation définitive du formulaire

### 12.1 Catégories et libellés

**Direction générale et administration**
- Directeur Général → `DG_USER` (consultation)
- Directeur DPMG → `DPMG_MANAGER`
- Administrateur technique → `TECHNICAL_ADMIN`
- Super administrateur → `SUPER_ADMIN`

**Directions et services**
- Directeur Régional → `HIERARCHICAL_MANAGER`
- Responsable de département → `DEPARTMENT_MANAGER`
- Contrôleur financier DFC → `DFC_CONTROLLER`
- Responsable CPMP → `CPMP_USER` (consultation)

**Opérations**
- Receveur d'agence → `EMPLOYEE`
- Agent d'exécution → `EXECUTION_AGENT`

**Délégations**
- Représentant délégué → `DELEGATED_REPRESENTATIVE`
- Délégué départemental → `DEPARTMENT_DELEGATE`
- Délégué DPMG → `DPMG_DELEGATE`

### 12.2 Champs du formulaire

- Sélection du rôle (groupé par catégorie).
- Sélection de la structure (obligatoire sauf `TECHNICAL_ADMIN`/`SUPER_ADMIN`).
- Champ "Périmètre" (texte libre, avec hint par rôle).
- Dates de début et de fin (pour les délégations).
- Champ `delegatedFromUserId` (pour les délégations, sélecteur d'utilisateur).
- Avertissements pour les affectations incomplètes.

### 12.3 Règles d'affichage

- La catégorie d'affichage ne remplace jamais le rôle technique enregistré en base.
- Le formulaire conserve les champs structure, périmètre, dates.
- Le formulaire signale les affectations incomplètes.
- Le formulaire préserve les autres affectations lors d'une modification.

---

## 13. Fonctionnalités backend existantes et manquantes

### Existantes
- Validation hiérarchique (`validation.service.ts`).
- Avis départemental (`demande.service.ts`).
- Décision DPMG (`demande.service.ts`).
- Contrôle financier DFC (`controlDfcDemande`).
- Exécution et clôture (`demande.service.ts`).
- Consolidations (`consolidation.service.ts`).
- Observations DG/CPMP (`consolidation-observation.service.ts`).
- Délégations (`validation.service.ts`, `demande.service.ts`).
- Notifications (`notification.service.ts`).

### Manquantes
- Décision DG (observation uniquement dans le code actuel).
- Décision CPMP (observation uniquement dans le code actuel).
- Gestion des prestataires (aucun modèle, aucune route).
- Notification d'expiration de délégation.
- Prévention des délégations circulaires.
- Validation explicite du nombre de directions régionales (retour silencieux).
- Affectation de `delegatedFromUserId` depuis l'UI.

---

## 14. Analyse de la migration non appliquée

Migration `20261114000000_add_demande_en_attente_analyse_notification` :
- Contenu : `ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'DEMANDE_EN_ATTENTE_ANALYSE';`.
- Le type `DEMANDE_EN_ATTENTE_ANALYSE` est déjà présent dans l'enum `NotificationType` du schéma Prisma (ligne 293).
- La migration est donc redondante.
- Elle n'est pas appliquée à la base `dpmg` (absente de `_prisma_migrations`).
- Risque : aucun (la valeur existe déjà).
- Recommandation : l'appliquer pour la cohérence de l'historique des migrations, mais ce n'est pas bloquant.

---

## 15. Plan de développement par lots

### Lot 1 : Amélioration de l'interface (`UtilisateurForm.tsx`)
- Objectif : exposer les 13 rôles avec libellés et catégories.
- Fichiers : `apps/web/src/pages/utilisateurs/UtilisateurForm.tsx`.
- Risque : tests web existants à mettre à jour.

### Lot 2 : Extension du filtre (`UtilisateursPage.tsx`)
- Objectif : filtrer par les 13 rôles.
- Fichiers : `apps/web/src/pages/utilisateurs/UtilisateursPage.tsx`.

### Lot 3 : Alignement frontend/backend (`DemandeDetailPage.tsx`)
- Objectif : inclure `DELEGATED_REPRESENTATIVE` dans `canValidate`.
- Fichiers : `apps/web/src/pages/demandes/DemandeDetailPage.tsx`.

### Lot 4 : Création de délégations dans l'UI
- Objectif : champ `delegatedFromUserId` dans le formulaire.
- Fichiers : `apps/web/src/pages/utilisateurs/UtilisateurForm.tsx`.
- Dépendance : Lot 1.

### Lot 5 : Validation backend du Directeur Régional unique
- Objectif : ajouter une validation explicite dans `assignUserRole`.
- Fichiers : `apps/api/src/services/user.service.ts`.
- Risque : modification des règles d'attribution.

### Lot 6 : Fonctionnalité CPMP de gestion des prestataires
- Objectif : créer le modèle, les routes et l'interface pour les prestataires.
- Fichiers : `database/prisma/schema.prisma`, `apps/api/src/routes/`, `apps/api/src/services/`, `apps/web/src/pages/`.
- Dépendance : aucune.

### Lot 7 : Contrôle financier DFC
- Objectif : adapter le contrôle financier pour prendre en compte les prestataires.
- Fichiers : `apps/api/src/services/demande.service.ts`.
- Dépendance : Lot 6.

### Lot 8 : Consultation DG
- Objectif : vérifier et documenter les droits de consultation du DG.
- Fichiers : `apps/api/src/services/consolidation-observation.service.ts`.
- Dépendance : aucune.

### Lot 9 : Tests
- Objectif : mettre à jour et exécuter les tests web et API.
- Fichiers : `apps/web/tests/utilisateurs.test.tsx`, `apps/api/src/users.test.ts`.

---

## 16. Tests et critères d'acceptation

### Directeur Régional
- Affectation à une seule Direction Régionale : acceptée.
- Affectation à deux Directions Régionales actives : refusée.
- Accès aux agences de sa Direction Régionale : autorisé.
- Accès aux agences d'une autre Direction Régionale : refusé.
- Désactivation de l'ancienne affectation avant changement : acceptée.
- Affectation sur une structure non régionale : aucun droit régional.

### DPMG
- `DPMG_MANAGER` avec scope null : non opérationnel.
- `DPMG_MANAGER` avec scope département : périmètre limité.
- `DPMG_MANAGER` avec scope `*` : permissions contrôlées selon la matrice.

### Département
- `DEPARTMENT_MANAGER` avec scope null et structure correspondante : accès autorisé.
- Structure non correspondante : accès refusé.
- Scope `*` : aucun accès départemental global implicite.

### DG, DFC et CPMP
- Vérifier les droits de consultation.
- Vérifier les actions autorisées et interdites.
- Vérifier le respect du workflow V1.

### Délégations
- Délégation active.
- Délégation expirée.
- Délégation révoquée.
- Délégant désactivé.
- Périmètre supérieur au délégant.
- Traçabilité des actions.

---

## 17. Risques et dépendances

- Tests web existants peuvent attendre l'ancienne liste de 7 options.
- L'ajout de `DELEGATED_REPRESENTATIVE` à `canValidate` peut changer l'affichage.
- Sur-attribution possible si un administrateur attribue `DPMG_MANAGER` avec `scope="*"` sans comprendre l'impact.
- La décision DG n'est pas implémentée dans le code actuel (fonctionnalité manquante).
- La migration `20261114000000` n'est pas appliquée à la base `dpmg`.
- La fonctionnalité de gestion des prestataires est entièrement à développer.

---

## 18. Statut des six réserves

| Réserve | Statut |
|---|---|
| 1 — Surcharge de `HIERARCHICAL_MANAGER` | RÉSOLUE SOUS CONDITION |
| 2 — `DPMG_MANAGER` avec scope null | RÉSOLUE SOUS CONDITION |
| 3 — `DG_USER` et `CPMP_USER` | RÉSOLUE SOUS CONDITION |
| 4 — Règle "exactement une Direction Régionale" | RÉSOLUE |
| 5 — Affectations CPMP et DFC incohérentes | RÉSOLUE SOUS CONDITION |
| 6 — `DEPARTMENT_MANAGER` avec scope null | RÉSOLUE |

---

## Conclusion obligatoire

**PLAN FINAL VALIDABLE SOUS RÉSERVE** : corrections préalables identifiées (surcharge de `HIERARCHICAL_MANAGER`, `DPMG_MANAGER` scope null, décision DG non implémentée, données incohérentes en production, fonctionnalité de gestion des prestataires entièrement à développer).

Le plan peut être mis en œuvre après intégration des corrections listées.

---

Aucun code ni donnée n'a été modifié. En attente de votre validation explicite avant de commencer le développement.