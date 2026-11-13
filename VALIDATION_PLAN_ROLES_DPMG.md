# VALIDATION DU PLAN D'AMÉLIORATION DES RÔLES — DPMG

Phase de revue et de validation uniquement. Aucun code ni donnée n'a été modifié.

---

## 1. Résumé de la revue

Le plan initial (`PLAN_AMELIORATION_ROLES_DPMG.md`) est globalement cohérent avec le schéma Prisma, les validations Zod et les services backend. Il propose une amélioration utile de l'interface sans créer de nouveaux rôles.

Cependant, la revue a identifié des incohérences importantes à corriger avant le développement, notamment :

- La surcharge fonctionnelle de `HIERARCHICAL_MANAGER` (Directeur Régional ET Directeur DPMG dans le seed de démonstration).
- La correspondance "Directeur DPMG → `DPMG_MANAGER`" n'est pas confirmée explicitement dans le code (le seed de démonstration attribue `HIERARCHICAL_MANAGER` scope `*` au "Directeur DPMG").
- `DG_USER` et `CPMP_USER` sont des rôles d'observation uniquement, pas de décision — le plan doit le préciser.
- `DPMG_MANAGER` avec `scope = null` (cas réel : `koua.alexis@laposte.ci`) ne confère aucun droit DPMG.
- La règle "exactement une direction régionale active" pour `HIERARCHICAL_MANAGER` n'est pas documentée dans le plan.
- Les données réelles montrent des `DEPARTMENT_MANAGER` sur les structures CPMP et DFC, qui ne leur confèrent pas les droits CPMP/DFC.

---

## 2. Points du plan initial validés

- Conservation des 13 rôles existants, aucun nouveau rôle créé. ✓
- Correspondances administratives pour `DEPARTMENT_MANAGER`, `DFC_CONTROLLER`, `CPMP_USER`, `EXECUTION_AGENT`, `TECHNICAL_ADMIN`, `SUPER_ADMIN`, et les rôles de délégation. ✓
- Présentation groupée par catégories (Direction générale et administration, Directions et services, Opérations, Délégations). ✓
- Conservation du champ "Périmètre" en texte libre avec hint. ✓
- Règle "ne pas attribuer automatiquement `scope="*"`". ✓
- Règle "ne pas écraser les autres rôles lors d'une modification". ✓ (le `handleSubmit` en édition ne touche pas aux rôles)
- Distinction catégorie d'affichage / rôle technique enregistré. ✓
- Plan par lots avec dépendances. ✓

---

## 3. Points à corriger

### 3.1 Surcharge fonctionnelle de `HIERARCHICAL_MANAGER`

**Constat** : Le seed de démonstration (`apps/api/src/scripts/seed-demo.ts`, lignes 56-64) attribue `HIERARCHICAL_MANAGER` scope `*` à `directeur@dpmg.local` (Directeur DPMG), tandis que le code backend (`demande.service.ts`, lignes 236-280) utilise `HIERARCHICAL_MANAGER` sur une structure `REGIONAL_DIRECTION` pour le Directeur Régional.

**Correction** : Clarifier dans le plan que `HIERARCHICAL_MANAGER` a deux usages distincts selon la structure de rattachement :
- Sur `REGIONAL_DIRECTION` → Directeur Régional (portée régionale via `resolveRegionalAgencyAuthorIds`).
- Sur `DIRECTION` (DPMG) avec scope `*` → utilisé comme validateur hiérarchique global (cas du Directeur DPMG dans le seed de démo).

Le plan doit préciser que la correspondance "Directeur DPMG → `DPMG_MANAGER`" est basée sur les droits de décision DPMG, tandis que le seed de démo utilise `HIERARCHICAL_MANAGER` pour la validation hiérarchique. Ces deux rôles peuvent coexister pour un même utilisateur (comme `admin@dpmg.local` qui a les deux).

### 3.2 `DPMG_MANAGER` avec `scope = null`

**Constat** : En base réelle, `koua.alexis@laposte.ci` a `DPMG_MANAGER` avec `scope = null`. Or `dpmgScopeCovers` (`demande.service.ts`, ligne 1010) retourne `false` pour un scope null. Ce rôle est donc déclaré mais non opérationnel pour cet utilisateur.

**Correction** : Le plan doit ajouter une règle : un `DPMG_MANAGER` doit avoir un scope non null (`*` ou code département) pour être opérationnel. Le formulaire doit afficher un avertissement si le scope est vide.

### 3.3 `DG_USER` et `CPMP_USER` = observation uniquement

**Constat** : `DG_USER` et `CPMP_USER` n'ont que des droits d'observation sur les consolidations transmises (`consolidation-observation.service.ts`, lignes 84-95). Ils n'ont aucun droit de décision dans le code actuel. Le workflow mentionne le DG dans le circuit de décision, mais le code ne l'implémente pas.

**Correction** : Le plan doit préciser que ces rôles sont des rôles d'observation/consultation, et que la décision DG n'est pas encore implémentée. Le libellé "Directeur Général" pour `DG_USER` doit être accompagné d'une note "consultation uniquement".

### 3.4 Règle "exactement une direction régionale"

**Constat** : `resolveRegionalAgencyAuthorIds` (`demande.service.ts`, lignes 252-254) exige `regionalStructureIds.length !== 1` pour retourner des résultats. Si un utilisateur a deux rôles `HIERARCHICAL_MANAGER` sur deux directions régionales, il n'a aucun droit régional.

**Correction** : Le plan doit documenter cette règle et prévoir un avertissement dans l'interface.

### 3.5 Données réelles incohérentes

**Constat** : En base `dpmg`, `ossiri.simon@laposte.ci` et `theodore.kouame@laposte.ci` ont `DEPARTMENT_MANAGER` sur les structures CPMP et DFC respectivement. Ces rôles ne leur confèrent pas les droits CPMP/DFC.

**Correction** : Le plan doit inclure une étape de vérification/correction des données (hors développement) pour attribuer les bons rôles (`CPMP_USER`, `DFC_CONTROLLER`).

### 3.6 `DEPARTMENT_MANAGER` avec scope null

**Constat** : `targetsDepartment` (`demande.service.ts`, lignes 848-858) retourne `true` si `scope === null` et `structureId === department.structureId`. Donc le rattachement structurel suffit. Le plan mentionne "scope = code ou rattachement structurel" mais ne précise pas que `scope = null` est acceptable si la structure correspond.

**Correction** : Clarifier dans le plan que `scope = null` est valide pour `DEPARTMENT_MANAGER` si la structure correspond au département.

---

## 4. Incohérences détectées

| # | Incohérence | Fichier:ligne | Impact |
|---|---|---|---|
| 1 | `HIERARCHICAL_MANAGER` utilisé à la fois pour Directeur Régional et Directeur DPMG (seed de démo) | `seed-demo.ts` lignes 56-64 | Confusion fonctionnelle |
| 2 | `DPMG_MANAGER` scope null = non opérationnel | `demande.service.ts` ligne 1010 | Rôle déclaré mais inactif |
| 3 | `DG_USER` et `CPMP_USER` = observation uniquement, pas de décision | `consolidation-observation.service.ts` lignes 84-95 | Sur-estimation des capacités |
| 4 | Règle "exactement une direction régionale" non documentée | `demande.service.ts` lignes 252-254 | Comportement inattendu |
| 5 | Données réelles : `DEPARTMENT_MANAGER` sur CPMP/DFC | base `dpmg` | Mauvais droits |
| 6 | `DEPARTMENT_MANAGER` scope null acceptable si structure correspond | `demande.service.ts` lignes 848-858 | Clarification nécessaire |

---

## 5. Correspondance définitive des 13 rôles

| Rôle | Fonction administrative | Type d'accès | Statut |
|---|---|---|---|
| `EMPLOYEE` | Receveur d'agence | Aucune permission de workflow | Opérationnel |
| `HIERARCHICAL_MANAGER` | Directeur Régional (DCR) / validateur hiérarchique | Validation hiérarchique + visibilité régionale | Opérationnel (si structure = `REGIONAL_DIRECTION`) |
| `DELEGATED_REPRESENTATIVE` | Représentant délégué (validation) | Remplace le délégant | Opérationnel (si délégation valide) |
| `DEPARTMENT_MANAGER` | Responsable de département (Infra/Logistique/Magasin) | Avis, exécution, visibilité | Opérationnel |
| `DEPARTMENT_DELEGATE` | Délégué départemental | Remplace le délégant | Opérationnel (si délégation valide) |
| `DPMG_MANAGER` | Décideur DPMG | Décision, consolidation, clôture | Opérationnel (si scope non null) |
| `DPMG_DELEGATE` | Délégué DPMG | Remplace le délégant | Opérationnel (si délégation valide) |
| `DFC_CONTROLLER` | Contrôle financier DFC | Contrôle financier | Opérationnel |
| `CPMP_USER` | CPMP | Observation sur consolidations | Opérationnel (consultation uniquement) |
| `DG_USER` | Directeur Général | Observation sur consolidations | Opérationnel (consultation uniquement) |
| `EXECUTION_AGENT` | Agent d'exécution | Prise en charge exécution | Opérationnel |
| `TECHNICAL_ADMIN` | Administrateur technique | Gestion complète | Opérationnel |
| `SUPER_ADMIN` | Super administrateur | Gestion complète + privilèges | Opérationnel (aucun compte en base) |

---

## 6. Matrice des permissions et périmètres

Voir section 2 du plan initial pour le détail. Points clés :

- `scope="*"` pour `DPMG_MANAGER` = accès global à tous les départements.
- `scope="*"` pour `DEPARTMENT_MANAGER` / `DFC_CONTROLLER` / `CPMP_USER` / `DG_USER` / `EXECUTION_AGENT` = aucun droit (selon `targetsDepartment`, `dfcScopeCovers`, etc.).
- `scope=null` pour `DEPARTMENT_MANAGER` = droit si structure correspond au département.
- `scope=null` pour `DPMG_MANAGER` = aucun droit.
- Délégations : périmètre ≤ délégant, période bornée.

---

## 7. Organisation des structures

Le type `REGIONAL_DIRECTION` est déjà pris en charge :

- `StructureType` enum dans `schema.prisma` (ligne 18) : `REGIONAL_DIRECTION`.
- Migration `20261113000000_add_regional_direction_structure_type` appliquée.
- Frontend `structureTypeSchema` dans `zod.ts` (ligne 32) : `REGIONAL_DIRECTION`.
- `structureTypeLabelFr` (ligne 37) : "Direction Régionale".

La cible organisationnelle est donc déjà représentable dans le modèle actuel. Aucune modification de schéma nécessaire.

---

## 8. Présentation recommandée du formulaire

La présentation groupée proposée dans le plan est validée, avec les corrections suivantes :

- `DG_USER` → libellé "Directeur Général (consultation)" pour éviter la confusion.
- `CPMP_USER` → libellé "Responsable CPMP (consultation)".
- `DPMG_MANAGER` → hint "Scope obligatoire : `*` pour global ou code département".
- `HIERARCHICAL_MANAGER` → hint "Doit être rattaché à une Direction Régionale pour les droits régionaux".
- `DEPARTMENT_MANAGER` → hint "Scope = code département ou laisser vide si la structure correspond".

---

## 9. Plan de développement réorganisé par lots

### Lot 1 : Correction des données (hors code)
- Objectif : attribuer les bons rôles aux utilisateurs réels.
- Fichiers : aucune modification de code ; requêtes `UPDATE` sur `dpmg` (hors scope de ce plan, à faire séparément).
- Risque : modification de données de production.

### Lot 2 : Amélioration de l'interface (`UtilisateurForm.tsx`)
- Objectif : exposer les 13 rôles avec libellés et catégories.
- Fichiers : `apps/web/src/pages/utilisateurs/UtilisateurForm.tsx`.
- Risque : tests web existants à mettre à jour.

### Lot 3 : Extension du filtre (`UtilisateursPage.tsx`)
- Objectif : filtrer par les 13 rôles.
- Fichiers : `apps/web/src/pages/utilisateurs/UtilisateursPage.tsx`.

### Lot 4 : Alignement frontend/backend (`DemandeDetailPage.tsx`)
- Objectif : inclure `DELEGATED_REPRESENTATIVE` dans `canValidate`.
- Fichiers : `apps/web/src/pages/demandes/DemandeDetailPage.tsx`.

### Lot 5 : Création de délégations dans l'UI
- Objectif : champ `delegatedFromUserId` dans le formulaire.
- Fichiers : `apps/web/src/pages/utilisateurs/UtilisateurForm.tsx`.
- Dépendance : Lot 2.

### Lot 6 : Tests
- Objectif : mettre à jour et exécuter les tests web et API.
- Fichiers : `apps/web/tests/utilisateurs.test.tsx`, `apps/api/src/users.test.ts`.

---

## 10. Tests et critères d'acceptation

- Sélection de chaque rôle dans `UtilisateurForm` → envoi du bon identifiant technique.
- Rechargement → rôle correctement restitué.
- Préservation des autres affectations lors de l'ajout/suppression.
- `DPMG_MANAGER` avec scope null → avertissement affiché.
- `HIERARCHICAL_MANAGER` sur non-`REGIONAL_DIRECTION` → avertissement affiché.
- Tests API existants passent (`users.test.ts`).

---

## 11. Risques de régression

- Tests web existants peuvent attendre l'ancienne liste de 7 options.
- L'ajout de `DELEGATED_REPRESENTATIVE` à `canValidate` peut changer l'affichage pour des utilisateurs délégués.
- Sur-attribution possible si un administrateur attribue `DPMG_MANAGER` avec `scope="*"` sans comprendre l'impact.

---

## 12. Recommandation finale

**PLAN VALIDABLE SOUS RÉSERVE** : corrections préalables identifiées (surcharge de `HIERARCHICAL_MANAGER`, `DPMG_MANAGER` scope null, `DG_USER`/`CPMP_USER` observation uniquement, règle "exactement une direction régionale").

Le plan peut être mis en œuvre après intégration des corrections listées en section 3.

---

En attente de votre validation explicite avant de commencer le développement. Aucun code ni donnée n'a été modifié.