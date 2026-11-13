# PLAN FINAL DES RÔLES DPMG — V4.4

Version : 4.4
Date : 2026-11-12
Statut : DOCUMENTAIRE — EN ATTENTE DE VALIDATION EXPLICITE

Phase d'analyse et de conception uniquement. Aucun code ni donnée n'a été modifié. Document correctif et consolidé de `PLAN_FINAL_ROLES_DPMG_V4.3.md`.

---

## 1. Résumé exécutif

Le plan V4.4 corrige trois incohérences documentaires identifiées lors de l'audit final de la V4.3.

**Corrections apportées :**

1. **EXECUTION_AGENT et scope="*"** : la matrice des 13 rôles indique désormais que `scope = "*"` est à valider par le responsable métier, sans présenter cette configuration comme opérationnelle confirmée ni comme sans effet. `scope = code département` correspond au périmètre limité. `scope = null` reste non opérationnel.

2. **Migration 20261114000000** : toutes les mentions affirmant que la migration est « non appliquée » ont été remplacées par « état réel dans la base d'exploitation non vérifié ». L'anomalie chronologique et la nécessité d'une mission distincte sont conservées.

3. **Dates des délégations** : clarification des règles pour les nouvelles délégations (dates obligatoires) et les délégations historiques (tolérance de `endDate = null`). La règle générale d'activation distingue clairement les deux cas.

Les 13 rôles existants sont conservés. Aucun nouveau rôle n'est créé. Le workflow V1 est respecté.

---

## 2. Décisions métier définitives

### 2.1 Workflow opérationnel V1

- Mercredi : les directions transmettent leurs synthèses à la DPMG.
- Jeudi : la DPMG consolide les informations et transmet la consolidation au DG.
- La DFC et la CPMP interviennent dans le workflow global selon leurs responsabilités respectives.
- Le DG consulte la consolidation transmise par la DPMG. Il ne prend aucune décision dans l'application.
- La CPMP recherche et identifie le prestataire, enregistre les informations du prestataire dans le dossier de demande, ajoute les devis et justificatifs, puis transmet le dossier à la DFC.
- La DFC effectue le contrôle et la validation financière, avec observations.
- La DPMG conserve les responsabilités de décision DPMG, de consolidation et de clôture.
- Les avis départementaux restent distincts des décisions finales de la DPMG.

### 2.2 Directeur Régional — Option A (une seule Direction Régionale)

Un utilisateur ayant le rôle `HIERARCHICAL_MANAGER` en qualité de Directeur Régional ne peut être affecté qu'à une seule structure active de type `REGIONAL_DIRECTION`. Les agences rattachées à cette Direction Régionale constituent son périmètre. Une deuxième affectation régionale active doit être refusée. En cas de changement, l'ancienne affectation doit être désactivée avant l'activation de la nouvelle. Une affectation sur une structure non régionale ne donne aucun droit régional. Cette règle est une contrainte métier explicite.

### 2.3 Directeur DPMG

Directeur DPMG = `DPMG_MANAGER`. Ne pas utiliser `HIERARCHICAL_MANAGER` pour le représenter. `scope = null` = affectation incomplète et non opérationnelle. `scope = "*"` = accès global DPMG. `scope = code département` = périmètre limité. Ne jamais attribuer automatiquement `scope = "*"`.

### 2.4 Directeur Général — consultation uniquement

Le DG consulte simplement la consolidation transmise par la DPMG. Rôle technique : `DG_USER`. Permissions : consulter les consolidations transmises, consulter les informations nécessaires à sa mission. Interdictions : modifier les consolidations, approuver ou refuser les demandes, effectuer une validation départementale, effectuer une décision DPMG, effectuer une validation financière, accéder aux demandes individuelles.

### 2.5 CPMP — recherche et enregistrement du prestataire

La CPMP recherche le prestataire et enregistre directement dans DPMG les informations du prestataire identifié. Rôle technique : `CPMP_USER`. La CPMP peut consulter les consolidations et les demandes individuelles de son périmètre, rechercher et identifier un prestataire, enregistrer un prestataire dans le dossier de la demande, ajouter ou modifier les informations du prestataire, joindre plusieurs devis et documents justificatifs, ajouter des observations, transmettre les informations du prestataire à la DFC. La CPMP ne peut pas valider la disponibilité financière, refuser ou approuver le contrôle financier à la place de la DFC, modifier une décision financière de la DFC, effectuer une décision DPMG.

### 2.6 DFC — contrôle et validation financière

Rôle technique : `DFC_CONTROLLER`. La DFC est responsable de la validation financière. Elle intervient après la recherche et l'enregistrement du prestataire par la CPMP. La DFC peut consulter les informations du prestataire enregistrées par la CPMP, consulter les devis et documents justificatifs, examiner le montant proposé, effectuer le contrôle financier, enregistrer une validation ou un refus financier avec observations, consulter l'historique. La DFC ne peut pas modifier les informations du prestataire à la place de la CPMP, effectuer la recherche du prestataire, prendre une décision DPMG.

### 2.7 Chaîne de traitement CPMP / DFC

1. La CPMP identifie un prestataire. 2. La CPMP enregistre ses informations dans le dossier de la demande. 3. La CPMP joint le devis et les justificatifs disponibles. 4. La CPMP transmet le dossier à la DFC. 5. La DFC examine le prestataire, le montant et les documents. 6. La DFC effectue le contrôle financier. 7. La DFC enregistre sa validation ou son refus avec ses observations. 8. Le résultat du contrôle est disponible pour la suite du workflow DPMG.

---

## 3. Vérification de l'architecture des structures

### 3.1 Enum StructureType

`database/prisma/schema.prisma` (lignes 16-22) : `DIRECTION`, `REGIONAL_DIRECTION`, `AGENCY`, `POINT_OF_SALE`, `OTHER`. `REGIONAL_DIRECTION` est présent dans le schéma. ✓

### 3.2 Migration 20261113000000

Nom : `20261113000000_add_regional_direction_structure_type`. Selon un rapport antérieur, cette migration a été appliquée le 10/11/2026. Cette information provient d'un rapport antérieur, non vérifiée directement dans le cadre de cette mission (aucune connexion à la base n'a été effectuée).

### 3.3 Migration 20261114000000

Contenu vérifié dans le fichier : `ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'DEMANDE_EN_ATTENTE_ANALYSE';`. Le type `DEMANDE_EN_ATTENTE_ANALYSE` est déjà présent dans l'enum `NotificationType` du schéma Prisma (ligne 293). La migration est donc redondante au niveau du schéma. Son état réel dans la base `dpmg` n'a pas été vérifié (aucune connexion à la base dans le cadre de cette mission). Le schéma Prisma ne suffit pas à prouver l'état réel de l'enum en base.

Anomalie chronologique : le nom de la migration indique le 14/11/2026, le dossier est daté du 11/11/2026, et la date du jour est le 12/11/2026.

Recommandation : mission distincte de vérification avec autorisation explicite avant toute décision. Aucune opération sur la base de production ne doit être déclenchée par ce plan. Ne pas inclure son exécution dans les lots de développement.

### 3.4 Modèle Structure et Department

`Structure` : `id`, `code`, `name`, `type`, `parentId`, `status`. `Department` : `id`, `name`, `code`, `structureId` (unique, nullable). Relation `parent`/`children` pour la hiérarchie. Les agences sont rattachées à leur direction régionale via `parentId`. Les départements sont rattachés à leur structure via `Department.structureId`.

### 3.5 Écarts entre code et conception

| Élément | Code existant | Conception souhaitée | Écart |
|---|---|---|---|
| `REGIONAL_DIRECTION` | Présent dans le schéma | Présent | Aucun |
| Rattachement agences → direction régionale | `parentId` | `parentId` | Aucun |
| Rattachement département → structure | `Department.structureId` | `Department.structureId` | Aucun |
| Migration `20261114000000` | Non vérifié (aucune connexion DB) | Appliquée | À vérifier (mission distincte) |

---

## 4. Matrice des 13 rôles

| # | Rôle | Fonction administrative | Structure d'affectation | Scope | Périmètre de visibilité | Permissions autorisées | Permissions interdites | Conditions d'opérationnalité | Comportement si incomplet |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `EMPLOYEE` | Receveur d'agence | Agence | (aucun) | Ses propres demandes | Créer/modifier/soumettre ses demandes | Aucune permission de workflow | Toujours | N/A |
| 2 | `HIERARCHICAL_MANAGER` | Directeur Régional (DCR) | `REGIONAL_DIRECTION` | (non utilisé) | Demandes des agences de sa région | Validation hiérarchique (approuver/refuser/retourner) | Accès aux autres régions | Exactement une `REGIONAL_DIRECTION` active | Aucun droit régional |
| 3 | `DELEGATED_REPRESENTATIVE` | Représentant délégué (validation) | Même structure que le délégant | ≤ délégant | Idem délégant | Validation hiérarchique (remplace le délégant) | Périmètre supérieur au délégant | Délégation valide (dates + délégant actif) | Non opérationnel |
| 4 | `DEPARTMENT_MANAGER` | Responsable de département | Département | Code ou null | Demandes de son département | Avis départemental, exécution, visibilité | Accès aux autres départements | Scope = code ou rattachement structurel | Accès refusé si structure non correspondante |
| 5 | `DEPARTMENT_DELEGATE` | Délégué départemental | Même département | = délégant | Idem délégant | Avis, exécution (remplace le délégant) | Périmètre supérieur au délégant | Délégation valide | Non opérationnel |
| 6 | `DPMG_MANAGER` | Décideur DPMG | DPMG | `*` ou code | Pipeline DPMG | Décision, consolidation, clôture | Décision sur départements non couverts | Scope non null | Non opérationnel si scope null |
| 7 | `DPMG_DELEGATE` | Délégué DPMG | Même périmètre DPMG | = délégant | Idem délégant | Décision DPMG (remplace le délégant) | Périmètre supérieur au délégant | Délégation valide | Non opérationnel |
| 8 | `DFC_CONTROLLER` | Contrôleur financier DFC | DFC | `*` ou code | Demandes en financement/exécution de son périmètre | Contrôle financier (disponible/indisponible), consultation des dossiers individuels de son périmètre | Recherche prestataire, décision DPMG | Scope = `*` ou code | Non opérationnel si scope null |
| 9 | `CPMP_USER` | Responsable CPMP | CPMP | `*` ou code | Consolidations transmises + demandes individuelles de son périmètre | Observation, recherche et enregistrement de prestataire, consultation des dossiers individuels de son périmètre | Validation financière, décision DPMG | Scope = `*` ou code | Non opérationnel si scope null |
| 10 | `DG_USER` | Directeur Général | (global) | `*` ou code | Consolidations transmises uniquement | Consultation uniquement | Toute modification, décision, validation, accès aux demandes individuelles | Scope = `*` ou code | Non opérationnel si scope null |
| 11 | `EXECUTION_AGENT` | Agent d'exécution | Département | `*` ou code | Demandes en exécution/satisfaction/clôture | Prise en charge exécution | Décision DPMG | Scope = `*` (à valider) ou code | Non opérationnel si scope null |
| 12 | `TECHNICAL_ADMIN` | Administrateur technique | (null) | `*` | Global | Gestion complète | Aucune (sauf protection dernier admin) | Toujours | N/A |
| 13 | `SUPER_ADMIN` | Super administrateur | (null) | `*` | Global | Gestion complète + privilèges | Aucune (sauf protection dernier admin) | Toujours | N/A |

---

## 5. Matrice fonction / rôle / structure / scope / permissions

### 5.1 Règles de scope par rôle

| Rôle | `scope = null` | `scope = "*"` | `scope = code département` | Structure absente ou incorrecte |
|---|---|---|---|---|
| `EMPLOYEE` | Aucun impact (pas de permissions de workflow) | Aucun impact | Aucun impact | Aucun impact |
| `HIERARCHICAL_MANAGER` | Aucun droit régional | Aucun droit régional (sauf si structure = `REGIONAL_DIRECTION`, mais scope non utilisé) | Aucun droit régional | Aucun droit régional |
| `DELEGATED_REPRESENTATIVE` | Hérite du délégant | Hérite du délégant | Hérite du délégant | Non opérationnel |
| `DEPARTMENT_MANAGER` | Accès si structure correspond au département | Aucun accès départemental global | Accès au département correspondant | Aucun accès |
| `DEPARTMENT_DELEGATE` | Hérite du délégant | Hérite du délégant | Hérite du délégant | Non opérationnel |
| `DPMG_MANAGER` | Non opérationnel | Accès global DPMG | Accès limité au département | Non opérationnel |
| `DPMG_DELEGATE` | Hérite du délégant | Hérite du délégant | Hérite du délégant | Non opérationnel |
| `DFC_CONTROLLER` | Non opérationnel | Accès global DFC (selon `dfcScopeCovers`) | Accès limité au département | Non opérationnel |
| `CPMP_USER` | Non opérationnel | Accès global CPMP (selon `cpmpScopeCovers`) | Accès limité au département | Non opérationnel |
| `DG_USER` | Non opérationnel | Accès global (consolidations) (selon `dgScopeCovers`) | Accès limité au département | Non opérationnel |
| `EXECUTION_AGENT` | Non opérationnel | Comportement à valider (voir note ci-dessous) | Accès limité au département | Non opérationnel |
| `TECHNICAL_ADMIN` | N/A (structure null) | Global | N/A | N/A |
| `SUPER_ADMIN` | N/A (structure null) | Global | N/A | N/A |

### 5.2 Points clés

- `scope = "*"` pour `DPMG_MANAGER` = accès global à tous les départements.
- `scope = "*"` pour `DEPARTMENT_MANAGER` = aucun droit (selon `targetsDepartment`, ligne 853).
- `scope = "*"` pour `DFC_CONTROLLER` / `CPMP_USER` / `DG_USER` = accès global selon les fonctions `dfcScopeCovers` / `cpmpScopeCovers` / `dgScopeCovers` (vérifié dans le code).
- `scope = "*"` pour `EXECUTION_AGENT` : la fonction `departmentExecutionScopeCovers` retourne `true` pour `scope = "*"`. Cependant, les contrôles complémentaires appliqués par les autres fonctions backend ne permettent pas de conclure définitivement sur le périmètre d'accès réellement obtenu. **Ce comportement est présenté comme une réserve à valider par le responsable métier.** La référence précise est `departmentExecutionScopeCovers` (`demande.service.ts`, ligne 1702).
- `scope = null` pour `DEPARTMENT_MANAGER` = droit si structure correspond au département.
- `scope = null` pour `DPMG_MANAGER` = aucun droit.
- Délégations : périmètre ≤ délégant, période bornée.

**Note** : Les éléments de code disponibles montrent que `dfcScopeCovers`, `cpmpScopeCovers` et `dgScopeCovers` traitent `scope = "*"` comme un accès global. En revanche, `targetsDepartment` (pour `DEPARTMENT_MANAGER`) retourne `false` pour `*`. Pour `EXECUTION_AGENT`, `departmentExecutionScopeCovers` retourne `true` pour `*`, mais les contrôles complémentaires ne permettent pas de conclure définitivement. Cette différence de comportement est documentée telle quelle, sans interprétation. La règle métier définitive pour chaque rôle doit être validée par le responsable métier.

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

### 6.6 CPMP
- Visibilité sur les consolidations transmises.
- Visibilité sur les demandes individuelles de son périmètre (pour la recherche et l'enregistrement du prestataire).

### 6.7 Directeur Général
- Visibilité sur les consolidations transmises uniquement.
- Pas de visibilité sur les demandes individuelles.

### 6.8 Agent d'exécution
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
- Aucune protection transactionnelle contre les affectations concurrentes (deux administrateurs créant simultanément une deuxième affectation).

### 7.3 Contrôles manquants

**Backend** : Ajouter une validation dans `assignUserRole` (`user.service.ts`) : si le rôle est `HIERARCHICAL_MANAGER` et la structure est de type `REGIONAL_DIRECTION`, vérifier qu'il n'existe pas déjà une affectation active du même utilisateur sur une autre `REGIONAL_DIRECTION`. Si oui, refuser avec une erreur explicite. Protection transactionnelle contre les affectations concurrentes (verrou ou contrainte unique).

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
- Pas d'accès aux demandes individuelles.
- Le workflow V1 prévoit le DG dans le circuit de consultation (jeudi : consolidation transmise au DG).

### 8.2 Responsable CPMP (`CPMP_USER`)

- Consultation des consolidations et demandes individuelles de son périmètre.
- Recherche et identification d'un prestataire.
- Enregistrement du prestataire dans le dossier de la demande.
- Ajout de plusieurs devis et documents justificatifs.
- Ajout d'observations.
- Transmission à la DFC.
- Pas de validation financière, pas de décision DPMG.

### 8.3 Contrôleur financier DFC (`DFC_CONTROLLER`)

- Consultation des informations du prestataire enregistrées par la CPMP.
- Consultation des devis et documents justificatifs.
- Contrôle financier (disponible/indisponible).
- Enregistrement d'une validation ou d'un refus financier avec observations.
- Retour possible à la CPMP pour correction (si compatible avec les statuts existants).
- Pas de modification du prestataire, pas de recherche de prestataire, pas de décision DPMG.

---

## 9. Fonctionnalité de gestion des prestataires

### 9.1 Parcours utilisateur

1. La CPMP accède au dossier de la demande (consolidation transmise).
2. La CPMP recherche et identifie un prestataire.
3. La CPMP enregistre les informations du prestataire dans le dossier.
4. La CPMP joint plusieurs devis et documents justificatifs.
5. La CPMP ajoute ses observations.
6. La CPMP transmet le dossier à la DFC.
7. La DFC consulte le dossier et effectue le contrôle financier.
8. La DFC enregistre sa validation ou son refus.
9. La DFC peut retourner le dossier à la CPMP pour correction.

### 9.2 Données à prévoir

**Modèle Prestataire (rattaché à la demande) :**

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
| `observations` | String? | Non | Observations de la CPMP |
| `createdById` | String (FK User) | Oui | Utilisateur CPMP responsable |
| `createdAt` | DateTime | Oui | Date d'enregistrement |
| `updatedAt` | DateTime | Oui | Date de dernière modification |

**Modèle Document (gestion documentaire) :**

| Champ | Type | Obligatoire | Description |
|---|---|---|---|
| `id` | String (cuid) | Oui | Identifiant unique |
| `demandeId` | String (FK) | Oui | Demande associée |
| `prestataireId` | String? (FK) | Non | Prestataire associé (optionnel) |
| `type` | Enum | Oui | Type de document (DEVIS, JUSTIFICATIF, AUTRE) |
| `nomOriginal` | String | Oui | Nom original du fichier |
| `cheminStockage` | String | Oui | Chemin ou identifiant de stockage sécurisé |
| `typeMime` | String | Oui | Type MIME du fichier |
| `taille` | Int | Oui | Taille en octets |
| `version` | Int | Oui | Numéro de version |
| `uploadedById` | String (FK User) | Oui | Auteur du dépôt |
| `createdAt` | DateTime | Oui | Date de dépôt |
| `remplaceId` | String? (FK) | Non | Document remplacé (traçabilité) |

La liaison directe à une demande est suffisante (pas besoin d'un référentiel global de prestataires).

### 9.3 Contrôle financier DFC

- Consultation du dossier transmis par la CPMP.
- Consultation des pièces jointes (selon droits).
- Contrôle du montant.
- Décision financière (disponible/indisponible) avec observations.
- Historique et auteur de la validation.
- Retour possible à la CPMP pour correction.

**Terminologie** : Le contrôle financier produit un résultat métier (disponible/indisponible). Le statut technique éventuellement enregistré dans le système (par exemple `DECISION_DFC_DISPONIBLE` / `DECISION_DFC_INDISPONIBLE` dans l'enum `DemandeDecisionType`) est distinct du résultat métier. Ne pas créer de nouveaux statuts sans validation métier.

### 9.4 Sécurité documentaire

- Validation du type MIME réel.
- Contrôle de taille.
- Liste des formats autorisés à définir.
- Stockage privé (pas d'exposition directe).
- Accès contrôlé par le backend (vérification des droits sur le dossier avant chaque accès).
- URL temporaire ou mécanisme sécurisé de téléchargement.
- Interdiction d'exposer directement des fichiers sensibles publiquement.
- Traçabilité des accès et modifications.

### 9.5 Vérification du code existant

Aucun modèle `Prestataire` ou `Provider` n'existe dans le schéma Prisma. Aucune route ni service ne gère les prestataires. Cette fonctionnalité est entièrement à développer.

### 9.6 Cycle de vie documentaire

**États du dossier prestataire :**
- `EN_PREPARATION` : la CPMP enrichit le dossier.
- `TRANSMIS_DFC` : le dossier est transmis à la DFC, verrouillé contre les modifications ordinaires de la CPMP.
- `RETOUR_CPMP` : le dossier est retourné à la CPMP pour correction, nouvelle modification autorisée.
- `CONTROLE_EFFECTUE` : le contrôle financier a été effectué.

**Transitions autorisées :**
- `EN_PREPARATION` → `TRANSMIS_DFC` : par la CPMP.
- `TRANSMIS_DFC` → `RETOUR_CPMP` : par la DFC (si compatible avec les statuts existants).
- `RETOUR_CPMP` → `TRANSMIS_DFC` : par la CPMP.
- `TRANSMIS_DFC` → `CONTROLE_EFFECTUE` : par la DFC.

**Règles de documents :**
- Les documents remplacés restent traçables (champ `remplaceId`).
- L'historique des modifications est conservé (audit log).
- Les documents ne sont pas supprimés, seulement versionnés.

**Cardinalité des prestataires :**
Le nombre de prestataires par demande n'est pas tranché. Deux options :
- Option A : un seul prestataire par demande (modèle simple).
- Option B : plusieurs prestataires (modèle plus complexe, permettant la comparaison de devis).
Cette décision est à valider par le responsable métier.

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

**Nouvelles délégations :**
- Date de début : obligatoire. `startDate = now()` est une valeur automatique autorisée si l'utilisateur ne renseigne pas la date.
- Date de fin : obligatoire. Strictement postérieure à la date de début.
- Bornes inclusives : `startDate <= now` et (`endDate` null ou `endDate >= now`).

**Délégations historiques :**
- Les anciennes délégations sans date de fin restent traitées séparément.
- Aucune conversion automatique de leurs dates.
- Aucune migration sans analyse et autorisation distinctes.

### 10.5 Activation automatique selon les dates

- Pour les nouvelles délégations : le rôle est actif si `startDate <= now` et `endDate >= now` (les deux dates étant obligatoires).
- Pour les délégations historiques : le rôle est actif si `startDate <= now` et (`endDate` null ou `endDate >= now`).
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
- Directeur Général → `DG_USER`
- Directeur DPMG → `DPMG_MANAGER`
- Administrateur technique → `TECHNICAL_ADMIN`
- Super administrateur → `SUPER_ADMIN`

**Directions et services**
- Directeur Régional → `HIERARCHICAL_MANAGER`
- Responsable de département → `DEPARTMENT_MANAGER`
- Contrôleur financier DFC → `DFC_CONTROLLER`
- Responsable CPMP → `CPMP_USER`

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
- Gestion des prestataires (aucun modèle, aucune route).
- Notification d'expiration de délégation.
- Prévention des délégations circulaires.
- Validation explicite du nombre de directions régionales (retour silencieux).
- Affectation de `delegatedFromUserId` depuis l'UI.

---

## 14. Analyse de la migration — état réel non vérifié

Migration `20261114000000_add_demande_en_attente_analyse_notification` :
- Contenu vérifié : `ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'DEMANDE_EN_ATTENTE_ANALYSE';`.
- Le type `DEMANDE_EN_ATTENTE_ANALYSE` est déjà présent dans l'enum `NotificationType` du schéma Prisma (ligne 293).
- La migration est donc redondante au niveau du schéma.
- Son état réel dans la base `dpmg` n'a pas été vérifié (aucune connexion à la base dans le cadre de cette mission).
- Le schéma Prisma ne suffit pas à prouver l'état réel de l'enum en base.
- Anomalie chronologique : le nom de la migration indique le 14/11/2026, le dossier est daté du 11/11/2026, et la date du jour est le 12/11/2026.
- Recommandation : mission distincte de vérification avec autorisation explicite avant toute décision. Aucune opération sur la base de production ne doit être déclenchée par ce plan. Ne pas inclure son exécution dans les lots de développement.

---

## 15. Plan de développement par lots

### Lot A : Autorisations et scopes
- Objectif : centraliser les contrôles d'accès, vérifier systématiquement côté backend, assurer la cohérence frontend/backend.
- Fichiers : `apps/api/src/middleware/auth.ts`, `apps/api/src/services/demande.service.ts`, `apps/api/src/services/user.service.ts`.
- Risque : modification des règles d'attribution.

### Lot B : Hiérarchie régionale
- Objectif : valider la structure `REGIONAL_DIRECTION`, la relation direction régionale/agences, la règle d'unique affectation active, le contrôle des affectations concurrentes.
- Fichiers : `apps/api/src/services/user.service.ts`, `apps/api/src/services/demande.service.ts`, `apps/web/src/pages/utilisateurs/UtilisateurForm.tsx`.
- Risque : modification des règles d'attribution.

### Lot C : Délégations
- Objectif : création, activation, expiration, révocation, traçabilité, prévention des cycles.
- Fichiers : `apps/api/src/services/validation.service.ts`, `apps/api/src/services/demande.service.ts`, `apps/api/src/services/user.service.ts`.
- Risque : modification des règles de délégation.

### Lot D : Fonctionnalités CPMP
- Objectif : accès aux dossiers individuels autorisés, enregistrement du prestataire, plusieurs devis et justificatifs, observations, transmission à la DFC, retour pour correction.
- Fichiers : `database/prisma/schema.prisma`, `apps/api/src/routes/`, `apps/api/src/services/`, `apps/web/src/pages/`.
- Dépendance : aucune.

### Lot E : Fonctionnalités DFC
- Objectif : consultation du dossier transmis, consultation des documents autorisés, contrôle financier, validation ou refus, observations, retour éventuel à la CPMP.
- Fichiers : `apps/api/src/services/demande.service.ts`.
- Dépendance : Lot D.

### Lot F : Consultation DG
- Objectif : vérifier et documenter les droits de consultation du DG, vérification des restrictions, tests d'interdiction de modification et de décision, absence d'accès général aux demandes individuelles.
- Fichiers : `apps/api/src/services/consolidation-observation.service.ts`.
- Dépendance : aucune.

### Lot G : Gestion documentaire sécurisée
- Objectif : stockage privé, contrôle des fichiers, gestion des versions, autorisations, traçabilité, tests d'accès non autorisé.
- Fichiers : `database/prisma/schema.prisma`, `apps/api/src/routes/`, `apps/api/src/services/`, `apps/web/src/pages/`.
- Dépendance : Lot D.

### Lot H : Tests transversaux et non-régression
- Objectif : matrice des 13 rôles, tests des scopes, tests multi-structures, tests multi-départements, tests des délégations, tests de concurrence, tests de cloisonnement, tests du workflow métier validé.
- Fichiers : `apps/web/tests/`, `apps/api/src/*.test.ts`.
- Dépendance : Lots A-G.

### Lot I : Harmonisation de l'interface et des intitulés par rôle
- Objectif : centraliser les libellés des 13 rôles, construire les intitulés dynamiques selon les structures et départements, adapter les tableaux de bord, menus et actions à chaque rôle.
- Fichiers : `apps/web/src/pages/utilisateurs/UtilisateurForm.tsx`, `apps/web/src/pages/dashboard/Dashboard.tsx`, `apps/web/src/components/AuthenticatedLayout.tsx`, `packages/shared/src/zod.ts` (optionnel).
- Dépendance : validation des rôles, scopes et permissions (Lots A-G).

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
- La fonctionnalité de gestion des prestataires est entièrement à développer.
- La migration `20261114000000` : état réel dans la base d'exploitation non vérifié.
- Le seed de démonstration est incohérent (Directeur DPMG = `HIERARCHICAL_MANAGER` au lieu de `DPMG_MANAGER`).
- Les données de production incohérentes nécessitent une mission de régularisation distincte.
- Les règles de scope pour `DFC_CONTROLLER`, `CPMP_USER`, `DG_USER` et `EXECUTION_AGENT` sont basées sur le comportement du code existant, sans validation métier définitive pour tous les cas.
- Le comportement de `departmentExecutionScopeCovers` pour `scope = "*"` retourne `true`, mais les contrôles complémentaires ne permettent pas de conclure définitivement sur le périmètre d'accès réellement obtenu. Ce point est une réserve à valider par le responsable métier.

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

## 19. Points restant à valider par le métier

1. Les données de production incohérentes (`ossiri.simon@laposte.ci`, `theodore.kouame@laposte.ci`, `koua.alexis@laposte.ci`) nécessitent une mission de régularisation distincte.
2. La gestion des prestataires est entièrement à développer. Confirmer les champs obligatoires et facultatifs.
3. La gestion documentaire (plusieurs devis, versions) est à développer. Confirmer les formats autorisés et la taille maximale.
4. Le retour à la CPMP pour correction (DFC) est à vérifier pour compatibilité avec les statuts existants.
5. La cardinalité des prestataires par demande (un seul vs plusieurs) est à trancher.
6. Les intitulés proposés correspondent-ils à l'organisation administrative réelle ?
7. Le comportement de `scope = "*"` pour `DFC_CONTROLLER`, `CPMP_USER`, `DG_USER` et `EXECUTION_AGENT` est basé sur le code existant. La règle métier définitive doit être validée pour chaque rôle.
8. Le comportement de `departmentExecutionScopeCovers` pour `scope = "*"` retourne `true`, mais les contrôles complémentaires ne permettent pas de conclure définitivement. Ce point est une réserve à valider par le responsable métier.

---

## 20. Conditions préalables à l'autorisation de développement

1. Validation explicite de ce document par le responsable métier.
2. Confirmation des champs obligatoires et facultatifs pour les prestataires.
3. Confirmation des formats de documents autorisés.
4. Confirmation de la règle d'unicité du Directeur Régional (Option A).
5. Confirmation de la consultation uniquement pour le DG.
6. Mission de régularisation des données de production (séparée).
7. Mission de vérification de la migration `20261114000000` (séparée).
8. Validation des règles de scope pour `DFC_CONTROLLER`, `CPMP_USER`, `DG_USER` et `EXECUTION_AGENT`.

---

## 21. Harmonisation des intitulés et de l'interface selon les rôles

### 21.1 Référentiel officiel des 13 intitulés

| Identifiant technique | Intitulé proposé dans l'interface |
|---|---|
| `EMPLOYEE` | Agent |
| `HIERARCHICAL_MANAGER` | Directeur régional |
| `DELEGATED_REPRESENTATIVE` | Représentant délégué |
| `DEPARTMENT_MANAGER` | Responsable de département |
| `DEPARTMENT_DELEGATE` | Délégué de département |
| `DPMG_MANAGER` | Directeur DPMG |
| `DPMG_DELEGATE` | Délégué DPMG |
| `DFC_CONTROLLER` | Contrôleur financier (DFC) |
| `CPMP_USER` | Agent CPMP (ou Responsable CPMP — à valider) |
| `DG_USER` | Directeur général (DG) |
| `EXECUTION_AGENT` | Agent d'exécution |
| `TECHNICAL_ADMIN` | Administrateur technique |
| `SUPER_ADMIN` | Super administrateur |

### 21.2 Correspondance rôle technique / intitulé métier

| Rôle technique | Intitulé métier | Fonction administrative |
|---|---|---|
| `EMPLOYEE` | Agent | Receveur d'agence |
| `HIERARCHICAL_MANAGER` | Directeur régional | Directeur Régional (DCR) |
| `DELEGATED_REPRESENTATIVE` | Représentant délégué | Représentant délégué (validation) |
| `DEPARTMENT_MANAGER` | Responsable de département | Responsable de département (Infra/Logistique/Magasin) |
| `DEPARTMENT_DELEGATE` | Délégué de département | Délégué départemental |
| `DPMG_MANAGER` | Directeur DPMG | Décideur DPMG |
| `DPMG_DELEGATE` | Délégué DPMG | Délégué DPMG |
| `DFC_CONTROLLER` | Contrôleur financier (DFC) | Contrôleur financier DFC |
| `CPMP_USER` | Agent CPMP (ou Responsable CPMP) | Responsable CPMP |
| `DG_USER` | Directeur général (DG) | Directeur Général (consultation) |
| `EXECUTION_AGENT` | Agent d'exécution | Agent d'exécution |
| `TECHNICAL_ADMIN` | Administrateur technique | Administrateur technique |
| `SUPER_ADMIN` | Super administrateur | Super administrateur |

### 21.3 Règles de construction des intitulés dynamiques

L'intitulé affiché doit tenir compte de l'affectation réelle de l'utilisateur.

Exemples :
- `DEPARTMENT_MANAGER` + département Infrastructure : « Responsable du département Infrastructure et Moyens Généraux ».
- `DEPARTMENT_MANAGER` + département Logistique : « Responsable du département Logistique et Gestion des Stocks ».
- `DEPARTMENT_MANAGER` + département Magasin : « Responsable du Magasin ».
- `HIERARCHICAL_MANAGER` + structure `REGIONAL_DIRECTION` : « Directeur régional », avec le nom de sa direction régionale.
- `EMPLOYEE` + agence : « Agent de l'agence [nom de l'agence] ».

Ces intitulés doivent être construits à partir des données d'affectation disponibles et autorisées. Ne pas coder en dur le nom d'une région ou d'une agence lorsqu'il doit provenir de la structure d'affectation.

Si un utilisateur possède plusieurs affectations, l'interface doit identifier son contexte actif. Le mécanisme existant (`req.userRoles` dans le middleware auth, `apps/api/src/middleware/auth.ts` lignes 60-71) expose toutes les affectations actives. Le frontend doit déterminer le contexte actif selon les règles définies par le backend. La sélection d'un contexte dans le frontend ne doit jamais permettre d'élargir les permissions.

### 21.4 Matrice rôle / tableau de bord / menus / actions

| Rôle | Tableau de bord | Menus principaux | Actions visibles | Actions interdites |
|---|---|---|---|---|
| `EMPLOYEE` | Ses demandes | Demandes | Créer, modifier, soumettre | Validation, décision |
| `HIERARCHICAL_MANAGER` | Tableau de bord régional, suivi des agences | Demandes, Validation | Validation hiérarchique | Décision DPMG, contrôle financier |
| `DELEGATED_REPRESENTATIVE` | Identique au délégant (selon périmètre) | Demandes, Validation | Validation hiérarchique (remplace le délégant) | Périmètre supérieur au délégant |
| `DEPARTMENT_MANAGER` | Tableau de bord du département | Demandes, Avis, Exécution | Avis départemental, exécution | Décision DPMG, contrôle financier |
| `DEPARTMENT_DELEGATE` | Identique au délégant (selon périmètre) | Demandes, Avis, Exécution | Avis, exécution (remplace le délégant) | Périmètre supérieur au délégant |
| `DPMG_MANAGER` | Pilotage DPMG, consolidation, suivi des départements | Demandes, Consolidations, Décisions | Décision DPMG, consolidation, clôture | Contrôle financier, recherche prestataire |
| `DPMG_DELEGATE` | Identique au délégant (selon périmètre) | Demandes, Consolidations, Décisions | Décision DPMG (remplace le délégant) | Périmètre supérieur au délégant |
| `DFC_CONTROLLER` | Dossiers transmis par la CPMP | Consolidations, Contrôle financier | Consultation dossier, contrôle financier, validation/refus | Recherche prestataire, décision DPMG |
| `CPMP_USER` | Dossiers à traiter, identification prestataires | Consolidations, Prestataires | Enregistrement prestataire, ajout devis, observations, transmission DFC | Validation financière, décision DPMG |
| `DG_USER` | Consolidations transmises | Consolidations | Consultation uniquement | Modification, décision, validation, accès aux demandes individuelles |
| `EXECUTION_AGENT` | Demandes en exécution | Demandes, Exécution | Prise en charge exécution | Décision DPMG |
| `TECHNICAL_ADMIN` | Administration | Utilisateurs, Structures, Départements, Base | Gestion complète | Aucune (sauf protection dernier admin) |
| `SUPER_ADMIN` | Administration | Utilisateurs, Structures, Départements, Base | Gestion complète + privilèges | Aucune (sauf protection dernier admin) |

### 21.5 Règles d'affichage selon les structures et départements

- Les noms des personnes, structures, directions et départements doivent rester distincts des intitulés de rôles.
- Un menu ou un bouton visible ne constitue jamais une autorisation suffisante.
- Les permissions doivent être vérifiées côté backend.
- Le frontend doit refléter les permissions réellement accordées.
- Un utilisateur ne doit pas pouvoir contourner les restrictions en appelant directement une route API.
- Un accès en consultation ne doit pas afficher des actions de modification.
- Une action interdite ne doit pas être présentée comme disponible.
- L'adaptation de l'interface ne doit jamais élargir les droits d'accès définis par les scopes.

### 21.6 Audit des libellés frontend existants

**Fichiers concernés :**

1. `apps/web/src/pages/utilisateurs/UtilisateurForm.tsx` (lignes 25-37) : `ROLE_LABELS` contient 11 libellés sur 13. Manquent `DELEGATED_REPRESENTATIVE` et `DEPARTMENT_DELEGATE`. Libellés incohérents avec la nomenclature proposée.
2. `apps/web/src/pages/dashboard/Dashboard.tsx` (lignes 13-27) : `ROLE_LABELS` contient les 13 libellés. Mêmes incohérences.
3. `apps/web/src/pages/utilisateurs/UtilisateursPage.tsx` : filtre de rôle limité à 3 valeurs (lignes 247-251).

### 21.7 Liste des incohérences constatées

| # | Incohérence | Fichier:ligne | Correction proposée |
|---|---|---|---|
| 1 | `ROLE_LABELS` incomplet (11/13) | `UtilisateurForm.tsx` lignes 25-37 | Ajouter les 2 libellés manquants |
| 2 | Libellés incohérents entre les deux fichiers | `UtilisateurForm.tsx` et `Dashboard.tsx` | Centraliser dans un référentiel unique |
| 3 | Filtre de rôle limité à 3 valeurs | `UtilisateursPage.tsx` lignes 247-251 | Étendre à 13 |
| 4 | Libellés codés en dur dans chaque composant | Multiples fichiers | Centraliser dans `packages/shared` ou un fichier dédié |
| 5 | `ROLE_LABELS` utilise `Record<string, string>` au lieu de `Record<RoleType, string>` | `UtilisateurForm.tsx` ligne 25 | Utiliser `Record<RoleType, string>` pour la complétude |

### 21.8 Recommandations de centralisation des libellés

1. Créer un référentiel unique des libellés dans `packages/shared/src/zod.ts` (comme `structureTypeLabelFr` existant, ligne 35).
2. Exporter `roleTypeLabelFr: Record<RoleType, string>` depuis le package shared.
3. Remplacer les `ROLE_LABELS` locaux par l'import du référentiel centralisé.
4. Ajouter les intitulés dynamiques (avec structure/département) dans un helper frontend dédié.

### 21.9 Tests de cohérence frontend/backend

- Vérifier que chaque rôle affiché dans l'interface correspond à un identifiant technique valide.
- Vérifier que les libellés sont cohérents entre les pages.
- Vérifier que les menus et boutons visibles correspondent aux permissions réelles.
- Vérifier que le DG ne voit aucun bouton de décision.
- Vérifier que la CPMP ne voit pas les actions de validation financière.
- Vérifier que la DFC ne voit pas les actions de recherche de prestataire.

### 21.10 Points restant à valider par le responsable métier

1. Les intitulés proposés correspondent-ils à l'organisation administrative réelle ?
2. Le terme "Agent" pour `EMPLOYEE` est-il approprié (vs "Receveur d'agence") ?
3. Le terme "Agent CPMP" pour `CPMP_USER` est-il approprié (vs "Responsable CPMP") ?
4. Les intitulés dynamiques doivent-ils inclure le nom de la structure ?

---

## 22. Contexte actif et gestion des affectations multiples

Le middleware `requireAuth` (`apps/api/src/middleware/auth.ts`, lignes 46-71) charge toutes les affectations actives de l'utilisateur dans `req.userRoles`. Le frontend reçoit ces affectations via `/api/auth/me`.

La sélection du contexte actif doit être déterminée par le frontend selon les règles définies par le backend. Le backend vérifie toujours le contexte lors des appels API via `requireAuth` et les fonctions de résolution (`resolveDpmgDecisionDepartmentIds`, etc.).

La sélection d'un contexte dans le frontend ne doit jamais permettre d'élargir les permissions. Le backend reste l'autorité.

---

## 23. Conclusion

**PLAN FINAL VALIDABLE SOUS RÉSERVE** : corrections préalables identifiées (surcharge de `HIERARCHICAL_MANAGER`, `DPMG_MANAGER` scope null, données incohérentes en production, fonctionnalité de gestion des prestataires entièrement à développer, migration de notification non vérifiée, intitulés à valider, comportement de `departmentExecutionScopeCovers` pour `scope = "*"` à valider).

Le plan peut être mis en œuvre après intégration des corrections listées.

---

Aucun code ni donnée n'a été modifié. Aucune base de données n'a été consultée. Aucune migration, seed, worker ou déploiement n'a été exécuté. En attente de votre validation explicite avant de commencer le développement.

**STATUT : V4.4 DOCUMENTAIRE PRODUITE — EN ATTENTE DE VALIDATION EXPLICITE.**

**AUCUN DÉVELOPPEMENT N'EST AUTORISÉ PAR CETTE MISSION.**