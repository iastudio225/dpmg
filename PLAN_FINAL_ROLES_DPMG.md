# PLAN FINAL DES RÔLES DPMG

Phase d'analyse et de conception uniquement. Aucun code ni donnée n'a été modifié.

---

## 1. Les six réserves et leur résolution proposée

### Réserve 1 — Surcharge de `HIERARCHICAL_MANAGER` : LEVÉE SOUS CONDITION

**Constat** : `seed-demo.ts` (lignes 56-64) attribue `HIERARCHICAL_MANAGER` scope `*` à `directeur@dpmg.local` (Directeur DPMG), tandis que le backend utilise `HIERARCHICAL_MANAGER` sur une structure `REGIONAL_DIRECTION` pour le Directeur Régional (`demande.service.ts`, lignes 236-280).

**Résolution** :
- **Directeur DPMG** = `DPMG_MANAGER` (droits de décision DPMG, consolidation, clôture).
- **Directeur Régional (DCR)** = `HIERARCHICAL_MANAGER` sur une structure `REGIONAL_DIRECTION`.
- Ne pas utiliser `HIERARCHICAL_MANAGER` pour représenter le Directeur DPMG.
- Le seed de démonstration est incohérent : `directeur@dpmg.local` devrait avoir `DPMG_MANAGER` (et éventuellement `HIERARCHICAL_MANAGER` sur la structure DPMG pour la validation hiérarchique globale, mais ce n'est pas le mécanisme prévu pour les droits régionaux).
- Les permissions backend respectent la séparation : `resolveRegionalAgencyAuthorIds` (`demande.service.ts`, lignes 236-280) exige `structure.type === "REGIONAL_DIRECTION"`. Un `HIERARCHICAL_MANAGER` sur la structure DPMG ne donne aucun droit régional.
- Les deux rôles peuvent coexister pour un même utilisateur (comme `admin@dpmg.local` dans le seed).

### Réserve 2 — `DPMG_MANAGER` avec `scope = null` : LEVÉE SOUS CONDITION

**Constat** : `koua.alexis@laposte.ci` a `DPMG_MANAGER` avec `scope = null`. Or `dpmgScopeCovers` (`demande.service.ts`, ligne 1010) retourne `false` pour un scope null.

**Résolution** :
- Règle définitive : un `DPMG_MANAGER` doit avoir un scope non null (`*` ou code département) pour être opérationnel.
- `scope = null` = affectation incomplète, non opérationnelle.
- `scope = "*"` = accès global à tous les départements.
- `scope = code département` = accès limité à ce département.
- Ne jamais attribuer automatiquement `scope = "*"`.
- Le formulaire doit afficher un avertissement explicite si le scope est vide.
- Les utilisateurs existants avec `scope = null` doivent être régularisés (mission séparée).

### Réserve 3 — `DG_USER` et `CPMP_USER` : LEVÉE

**Constat** : Ces deux rôles sont destinés à l'observation et à la consultation, et non à la décision.

**Résolution** :
- `DG_USER` : consultation et observation des consolidations transmises au DG, sans décision départementale ni DPMG. Libellé français : "Directeur Général (consultation)".
- `CPMP_USER` : consultation et observation dans le périmètre CPMP, sans décision DPMG. Libellé français : "Responsable CPMP (consultation)".
- `DFC_CONTROLLER` : contrôle financier (disponible/indisponible). Libellé français : "Contrôleur financier DFC". Responsabilités effectivement prévues par le code (`controlDfcDemande`, `demande.service.ts` lignes 1487-1618).
- Le workflow mentionne le DG dans le circuit de décision, mais le code ne l'implémente pas (observation uniquement). C'est une fonctionnalité manquante à signaler, pas une incohérence du plan.

### Réserve 4 — Règle "exactement une Direction Régionale" : LEVÉE SOUS CONDITION

**Constat** : `resolveRegionalAgencyAuthorIds` (`demande.service.ts`, lignes 236-280) exige `regionalStructureIds.length !== 1` pour retourner des résultats.

**Résolution** :
- Fonctions concernées : `resolveRegionalAgencyAuthorIds` (lignes 236-280) et `buildDemandeVisibilityWhere` (lignes 282-352).
- La règle existe pour éviter l'ambiguïté : si un utilisateur est Directeur Régional de plusieurs régions, le code ne sait pas laquelle choisir et refuse l'accès.
- C'est une **contrainte technique accidentelle**, pas une règle métier.
- Comportement avec plusieurs régions : aucun droit régional n'est accordé.
- Proposition : modifier `resolveRegionalAgencyAuthorIds` pour unionner les agences de toutes les directions régionales actives de l'utilisateur (plusieurs `REGIONAL_DIRECTION`).
- Ne pas modifier cette logique pendant l'audit.

### Réserve 5 — Affectations CPMP et DFC incohérentes : LEVÉE SOUS CONDITION

**Constat** : En base `dpmg`, `ossiri.simon@laposte.ci` a `DEPARTMENT_MANAGER` sur la structure CPMP et `theodore.kouame@laposte.ci` a `DEPARTMENT_MANAGER` sur la structure DFC. Ces rôles ne leur confèrent pas les droits CPMP/DFC.

**Résolution** :
- Affectations concernées (lecture seule) :
  - `ossiri.simon@laposte.ci` → structure `CPMP` → rôle attendu : `CPMP_USER`.
  - `theodore.kouame@laposte.ci` → structure `DFC` → rôle attendu : `DFC_CONTROLLER`.
- La régularisation doit faire l'objet d'une mission séparée avec autorisation explicite.
- Aucune correction n'est autorisée dans le cadre de cet audit.
- Impact : les utilisateurs concernés n'ont actuellement aucun droit CPMP/DFC via leur rôle actuel.

### Réserve 6 — `DEPARTMENT_MANAGER` avec `scope = null` : LEVÉE

**Constat** : `targetsDepartment` (`demande.service.ts`, lignes 848-858) retourne `true` si `scope === null` et `target.structureId === department.structureId`.

**Résolution** :
- Règle formalisée : `DEPARTMENT_MANAGER` avec `scope = null` a accès au département dont la structure est rattachée (`Department.structureId === UserStructureRole.structureId`).
- Si la structure ne correspond pas au département, aucun accès.
- `scope = "*"` n'accorde aucun droit départemental (ligne 853).
- `scope = code département` accorde l'accès à ce département.
- Aucun accès global implicite.
- Tests à prévoir pour INFRA, LOGISTIQUE et MAGASIN.

---

## 2. Les règles définitives d'utilisation des 13 rôles

| Rôle | Fonction administrative | Type d'accès | Condition d'opération |
|---|---|---|---|
| `EMPLOYEE` | Receveur d'agence | Aucune permission de workflow | Toujours |
| `HIERARCHICAL_MANAGER` | Directeur Régional (DCR) / validateur hiérarchique | Validation hiérarchique + visibilité régionale | Structure = `REGIONAL_DIRECTION` pour les droits régionaux |
| `DELEGATED_REPRESENTATIVE` | Représentant délégué (validation) | Remplace le délégant | Délégation valide (dates + délégant actif) |
| `DEPARTMENT_MANAGER` | Responsable de département | Avis, exécution, visibilité | Scope = code ou rattachement structurel |
| `DEPARTMENT_DELEGATE` | Délégué départemental | Remplace le délégant | Délégation valide |
| `DPMG_MANAGER` | Décideur DPMG | Décision, consolidation, clôture | Scope non null (`*` ou code) |
| `DPMG_DELEGATE` | Délégué DPMG | Remplace le délégant | Délégation valide |
| `DFC_CONTROLLER` | Contrôleur financier DFC | Contrôle financier | Scope = `*` ou code département |
| `CPMP_USER` | CPMP | Observation sur consolidations | Scope = `*` ou code département |
| `DG_USER` | Directeur Général | Observation sur consolidations | Scope = `*` ou code département |
| `EXECUTION_AGENT` | Agent d'exécution | Prise en charge exécution | Scope = `*` ou code département |
| `TECHNICAL_ADMIN` | Administrateur technique | Gestion complète | Global (scope `*`, structure null) |
| `SUPER_ADMIN` | Super administrateur | Gestion complète + privilèges | Global (scope `*`, structure null) |

---

## 3. Matrice fonction / rôle / structure / scope

| Fonction administrative | Rôle technique | Structure attendue | Scope attendu |
|---|---|---|---|
| Directeur DPMG | `DPMG_MANAGER` | DPMG (ou null si global) | `*` ou code département |
| Responsable Infrastructure | `DEPARTMENT_MANAGER` | INFRA | `INFRA` ou null (si structure correspond) |
| Responsable Logistique | `DEPARTMENT_MANAGER` | LOGIS | `LOGISTIQUE` ou null (si structure correspond) |
| Responsable Magasin | `DEPARTMENT_MANAGER` | MAGASIN | `MAGASIN` ou null (si structure correspond) |
| Directeur Régional (DCR) | `HIERARCHICAL_MANAGER` | `REGIONAL_DIRECTION` | (non utilisé pour les droits régionaux) |
| Receveur d'agence | `EMPLOYEE` | Agence | (aucun) |
| Contrôleur financier DFC | `DFC_CONTROLLER` | DFC | `*` ou code département |
| Responsable CPMP | `CPMP_USER` | CPMP | `*` ou code département |
| Directeur Général | `DG_USER` | (global) | `*` ou code département |
| Agent d'exécution | `EXECUTION_AGENT` | Département | `*` ou code département |
| Représentant délégué | `DELEGATED_REPRESENTATIVE` | Même structure que le délégant | ≤ délégant |
| Délégué départemental | `DEPARTMENT_DELEGATE` | Même département | = délégant |
| Délégué DPMG | `DPMG_DELEGATE` | Même périmètre DPMG | = délégant |
| Administrateur technique | `TECHNICAL_ADMIN` | (null) | `*` |
| Super administrateur | `SUPER_ADMIN` | (null) | `*` |

---

## 4. Les règles de permissions par acteur

### Directeur DPMG (`DPMG_MANAGER`)
- Décision DPMG (approbation, refus, retour) sur les demandes en attente de décision.
- Création, modification, transmission et suppression de consolidations.
- Clôture des demandes satisfaites.
- Visibilité sur le pipeline DPMG (décision, analyse, financement, exécution, satisfaction, clôture).
- Condition : scope non null.

### Directeur Régional (`HIERARCHICAL_MANAGER` sur `REGIONAL_DIRECTION`)
- Validation hiérarchique des demandes des agences de sa région.
- Visibilité sur les demandes des agences de sa région (validation, analyse, refus, clôture).
- Condition : exactement une structure `REGIONAL_DIRECTION` active (limitation technique).

### Receveur d'agence (`EMPLOYEE`)
- Création, modification et soumission de ses propres demandes.
- Aucune permission de workflow.
- Visibilité limitée à ses propres demandes.

### Responsable de département (`DEPARTMENT_MANAGER`)
- Avis départemental sur les demandes en attente d'analyse.
- Prise en charge exécution.
- Visibilité sur les demandes de son département.
- Condition : scope = code département ou rattachement structurel.

### Contrôleur financier DFC (`DFC_CONTROLLER`)
- Contrôle financier (disponible/indisponible) sur les demandes en attente de financement.
- Visibilité sur les demandes en financement/exécution de son périmètre.
- Condition : scope = `*` ou code département.

### Responsable CPMP (`CPMP_USER`)
- Observation sur les consolidations transmises.
- Consultation uniquement, pas de décision.
- Condition : scope = `*` ou code département.

### Directeur Général (`DG_USER`)
- Observation sur les consolidations transmises.
- Consultation uniquement, pas de décision.
- Condition : scope = `*` ou code département.

### Agent d'exécution (`EXECUTION_AGENT`)
- Prise en charge exécution des demandes.
- Visibilité sur les demandes en exécution/satisfaction/clôture.
- Condition : scope = `*` ou code département.

---

## 5. Les règles de délégation

- `DELEGATED_REPRESENTATIVE` : remplace le délégant dans la validation hiérarchique. Le délégant doit être un `HIERARCHICAL_MANAGER` actif et habilité sur le même périmètre. Le délégué ne reçoit jamais un périmètre plus large que le délégant.
- `DEPARTMENT_DELEGATE` : remplace le délégant pour l'avis départemental et l'exécution. Le délégant doit être un `DEPARTMENT_MANAGER` actif.
- `DPMG_DELEGATE` : remplace le délégant pour la décision DPMG. Le délégant doit être un `DPMG_MANAGER` actif.
- Dans tous les cas : période bornée (`startDate`/`endDate`), délégant actif à la date du jour, périmètre du délégué ≤ périmètre du délégant.

---

## 6. Les règles de gestion des affectations incomplètes

- `DPMG_MANAGER` avec `scope = null` : non opérationnel. Avertissement dans le formulaire.
- `HIERARCHICAL_MANAGER` sur une structure non `REGIONAL_DIRECTION` : pas de droits régionaux. Avertissement dans le formulaire.
- `DEPARTMENT_MANAGER` avec `scope = null` et structure ne correspondant pas au département : aucun accès. Avertissement dans le formulaire.
- Le formulaire doit signaler toute affectation incomplète sans l'interdire (l'administrateur peut vouloir créer une affectation incomplète temporairement).

---

## 7. Les règles de rattachement des structures

- Le type `REGIONAL_DIRECTION` est déjà pris en charge (enum `StructureType`, `schema.prisma` ligne 18 ; migration `20261113000000`).
- Les agences sont rattachées à leur direction régionale via `parentId`.
- Les départements sont rattachés à leur structure via `Department.structureId`.
- Les structures départementales (INFRA, LOGIS, MAGASIN) sont de type `OTHER`.

---

## 8. La présentation définitive du formulaire

### Direction générale et administration
- Directeur Général → `DG_USER` (consultation)
- Directeur DPMG → `DPMG_MANAGER`
- Administrateur technique → `TECHNICAL_ADMIN`
- Super administrateur → `SUPER_ADMIN`

### Directions et services
- Directeur Régional → `HIERARCHICAL_MANAGER`
- Responsable de département → `DEPARTMENT_MANAGER`
- Contrôleur financier DFC → `DFC_CONTROLLER`
- Responsable CPMP → `CPMP_USER` (consultation)

### Opérations
- Receveur d'agence → `EMPLOYEE`
- Agent d'exécution → `EXECUTION_AGENT`

### Délégations
- Représentant délégué → `DELEGATED_REPRESENTATIVE`
- Délégué départemental → `DEPARTMENT_DELEGATE`
- Délégué DPMG → `DPMG_DELEGATE`

### Règles d'affichage
- La catégorie d'affichage ne remplace jamais le rôle technique enregistré en base.
- Le formulaire conserve les champs structure, périmètre, dates.
- Le formulaire signale les affectations incomplètes.
- Le formulaire préserve les autres affectations lors d'une modification.

---

## 9. Proposition de régularisation des données de production

**Aucune modification n'est autorisée dans le cadre de cet audit.**

Proposition pour une mission séparée :

| Utilisateur | Affectation actuelle | Affectation proposée | Justification |
|---|---|---|---|
| `ossiri.simon@laposte.ci` | `DEPARTMENT_MANAGER` sur CPMP | Ajouter `CPMP_USER` sur CPMP | Accès CPMP |
| `theodore.kouame@laposte.ci` | `DEPARTMENT_MANAGER` sur DFC | Ajouter `DFC_CONTROLLER` sur DFC | Accès DFC |
| `koua.alexis@laposte.ci` | `DPMG_MANAGER` scope null | Modifier scope en `*` ou code | Opérationnalité |

---

## 10. Plan de développement découpé en lots

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

### Lot 5 : Tests
- Objectif : mettre à jour et exécuter les tests web et API.
- Fichiers : `apps/web/tests/utilisateurs.test.tsx`, `apps/api/src/users.test.ts`.

---

## 11. Tests et critères d'acceptation

- Sélection de chaque rôle dans `UtilisateurForm` → envoi du bon identifiant technique.
- Rechargement → rôle correctement restitué.
- Préservation des autres affectations lors de l'ajout/suppression.
- `DPMG_MANAGER` avec scope null → avertissement affiché.
- `HIERARCHICAL_MANAGER` sur non-`REGIONAL_DIRECTION` → avertissement affiché.
- `DEPARTMENT_MANAGER` scope null + structure correspondante → accès au département.
- `DEPARTMENT_MANAGER` scope null + structure non correspondante → aucun accès.
- Tests API existants passent (`users.test.ts`).

---

## 12. Risques et dépendances

- Tests web existants peuvent attendre l'ancienne liste de 7 options.
- L'ajout de `DELEGATED_REPRESENTATIVE` à `canValidate` peut changer l'affichage.
- Sur-attribution possible si un administrateur attribue `DPMG_MANAGER` avec `scope="*"` sans comprendre l'impact.
- La règle "exactement une direction régionale" est une limitation technique à assouplir ultérieurement.

---

## Conclusion obligatoire

### Statut des réserves
- Réserve 1 : LEVÉE SOUS CONDITION
- Réserve 2 : LEVÉE SOUS CONDITION
- Réserve 3 : LEVÉE
- Réserve 4 : LEVÉE SOUS CONDITION
- Réserve 5 : LEVÉE SOUS CONDITION
- Réserve 6 : LEVÉE

### Conclusion globale
**PLAN FINAL VALIDABLE SOUS RÉSERVE** : corrections préalables identifiées (surcharge de `HIERARCHICAL_MANAGER`, `DPMG_MANAGER` scope null, règle "exactement une direction régionale", données incohérentes en production).

Le plan peut être mis en œuvre après intégration des corrections listées.

---

Aucun code ni donnée n'a été modifié. En attente de votre validation explicite avant de commencer le développement.