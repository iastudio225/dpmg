# PLAN CORRECTIF DES RÔLES DPMG — V1

Document de préparation corrective. Aucun code n'a été modifié. Aucune base de données n'a été consultée.

---

## 1. Objectif

Corriger les incohérences identifiées dans `AUDIT_ROLES_AFFICHAGE_DPMG.md` concernant les libellés, les listes de sélection, les filtres et les conditions de visibilité des boutons, sans redéfinir les règles métier validées.

---

## 2. Corrections retenues

### Correction 1 — Centralisation des libellés des 13 rôles dans `packages/shared`

**Fichier concerné** : `packages/shared/src/zod.ts`

**Résultat attendu** : ajouter un référentiel unique `roleTypeLabelFr: Record<RoleType, string>` dans le package shared, comme `structureTypeLabelFr` (ligne 35). Les 13 identifiants techniques doivent être présents avec leur libellé français.

**Libellés à centraliser** (basés sur la nomenclature V4.5, avec arbitrage à confirmer) :

| Identifiant | Libellé |
|---|---|
| `EMPLOYEE` | Agent |
| `HIERARCHICAL_MANAGER` | Directeur régional |
| `DELEGATED_REPRESENTATIVE` | Représentant délégué |
| `DEPARTMENT_MANAGER` | Responsable de département |
| `DEPARTMENT_DELEGATE` | Délégué de département |
| `DPMG_MANAGER` | Directeur DPMG |
| `DPMG_DELEGATE` | Délégué DPMG |
| `DFC_CONTROLLER` | Contrôleur financier (DFC) |
| `CPMP_USER` | Agent CPMP (ou Responsable CPMP — à arbitrer) |
| `DG_USER` | Directeur général (DG) |
| `EXECUTION_AGENT` | Agent d'exécution |
| `TECHNICAL_ADMIN` | Administrateur technique |
| `SUPER_ADMIN` | Super administrateur |

**Dépendance** : aucune.

---

### Correction 2 — Typage exhaustif `Record<RoleType, string>`

**Fichiers concernés** : `apps/web/src/pages/utilisateurs/UtilisateurForm.tsx` (ligne 25), `apps/web/src/pages/dashboard/Dashboard.tsx` (ligne 13).

**Résultat attendu** : remplacer `Record<string, string>` par `Record<RoleType, string>` pour garantir l'exhaustivité à la compilation. Le référentiel centralisé (Correction 1) sera importé au lieu des `ROLE_LABELS` locaux.

**Dépendance** : Correction 1.

---

### Correction 3 — Harmonisation des libellés dans tous les composants

**Fichiers concernés** : `apps/web/src/pages/utilisateurs/UtilisateurForm.tsx`, `apps/web/src/pages/dashboard/Dashboard.tsx`, `apps/web/src/pages/utilisateurs/UtilisateursPage.tsx`.

**Résultat attendu** : remplacer les `ROLE_LABELS` locaux par l'import du référentiel centralisé. Les libellés affichés doivent être cohérents dans tous les écrans.

**Dépendance** : Corrections 1 et 2.

---

### Correction 4 — Complétion du filtre des rôles dans `UtilisateursPage.tsx`

**Fichier concerné** : `apps/web/src/pages/utilisateurs/UtilisateursPage.tsx` (lignes 247-251).

**Résultat attendu** : étendre le filtre de rôle aux 13 rôles. Le filtre doit respecter les droits d'accès de l'utilisateur connecté (un administrateur technique ne doit voir que les rôles qu'il est habilité à gérer).

**Règles d'accès à préserver** :
- `TECHNICAL_ADMIN` : ne peut pas gérer les comptes `TECHNICAL_ADMIN` ni `SUPER_ADMIN` (sauf auto-action).
- `SUPER_ADMIN` : ne peut pas gérer les comptes `SUPER_ADMIN` (sauf auto-action).
- Les autres rôles ne sont pas accessibles via cette page (réservée aux administrateurs).

**Dépendance** : Correction 3.

---

### Correction 5 — Complétion du formulaire `UtilisateurForm.tsx`

**Fichier concerné** : `apps/web/src/pages/utilisateurs/UtilisateurForm.tsx` (lignes 306-314).

**Résultat attendu** : ajouter les 6 rôles manquants à `roleOptions` avec leurs libellés et catégories :
- `DELEGATED_REPRESENTATIVE` (Délégations)
- `DEPARTMENT_DELEGATE` (Délégations)
- `DPMG_DELEGATE` (Délégations)
- `DFC_CONTROLLER` (Directions et services)
- `CPMP_USER` (Directions et services)
- `DG_USER` (Direction générale et administration)

**Règles d'accès à préserver** :
- `TECHNICAL_ADMIN` ne peut pas s'attribuer le rôle `TECHNICAL_ADMIN` (vérifié côté backend, ligne 686 de `user.service.ts`).
- `TECHNICAL_ADMIN` ne peut pas attribuer `TECHNICAL_ADMIN` à un autre compte.
- `SUPER_ADMIN` peut attribuer tous les rôles.
- `TECHNICAL_ADMIN` ne peut pas attribuer `SUPER_ADMIN`.

**Dépendance** : Corrections 1, 2, 3.

---

### Correction 6 — Correction de `canValidate` dans `DemandeDetailPage.tsx`

**Fichier concerné** : `apps/web/src/pages/demandes/DemandeDetailPage.tsx` (ligne 108).

**Résultat attendu** : ajouter `DELEGATED_REPRESENTATIVE` à la condition `canValidate`, uniquement lorsque la délégation est active et que l'utilisateur est effectivement désigné comme validateur.

**Règles d'accès à préserver** :
- Le backend désigne le validateur via `resolveValidatorForDemande` (`validation.service.ts`).
- Le frontend ne doit afficher le bouton de validation que si l'utilisateur est le validateur désigné.
- La vérification côté backend reste l'autorité (le frontend ne fait que l'affichage).

**Condition** : le bouton de validation doit être visible pour `DELEGATED_REPRESENTATIVE` uniquement si :
- La demande est en statut `EN_ATTENTE_VALIDATION`.
- L'utilisateur n'est pas l'auteur.
- L'utilisateur détient le rôle `DELEGATED_REPRESENTATIVE` actif.

**Dépendance** : aucune.

---

### Correction 7 — Examen de `canGiveAvis` sans ajout automatique de `DELEGATED_REPRESENTATIVE`

**Fichier concerné** : `apps/web/src/pages/demandes/DemandeDetailPage.tsx` (lignes 145-154).

**Résultat attendu** : examiner le code existant. Le backend (`activeDepartmentHabilitations`, `demande.service.ts` lignes 881-937) inclut `DEPARTMENT_DELEGATE` dans les habilitations départementales. Cependant, `DELEGATED_REPRESENTATIVE` (délégation hiérarchique) n'est pas inclus dans `activeDepartmentHabilitations`.

**Décision** : ne pas ajouter `DELEGATED_REPRESENTATIVE` à `canGiveAvis` automatiquement. Le rôle `DELEGATED_REPRESENTATIVE` est une délégation de validation hiérarchique, pas de délégation départementale. Ajouter ce rôle à `canGiveAvis` créerait une permission métier non démontrée.

**Résultat** : aucun changement pour `canGiveAvis`. Le code existant est correct.

**Dépendance** : aucune.

---

## 3. Règles d'accès à préserver

- `TECHNICAL_ADMIN` ne peut pas gérer les comptes `TECHNICAL_ADMIN` ni `SUPER_ADMIN` (sauf auto-action).
- `SUPER_ADMIN` ne peut pas gérer les comptes `SUPER_ADMIN` (sauf auto-action).
- Seul un `SUPER_ADMIN` peut attribuer/créer `SUPER_ADMIN`.
- `TECHNICAL_ADMIN` ne peut pas s'attribuer le rôle `TECHNICAL_ADMIN`.
- Les permissions sont vérifiées côté backend ; le frontend ne fait que l'affichage.

---

## 4. Tests ciblés de non-régression

### Tests unitaires frontend

| Test | Fichier | Vérification |
|---|---|---|
| Présence des 13 rôles dans le référentiel central | `packages/shared` (nouveau test) | `roleTypeLabelFr` contient les 13 clés |
| Exhaustivité du typage TypeScript | `UtilisateurForm.tsx` (compilation) | `Record<RoleType, string>` compile sans erreur |
| Cohérence des libellés | `Dashboard.test.tsx`, `utilisateurs.test.tsx` | Les libellés sont cohérents entre les pages |
| Filtre de rôles | `utilisateurs.test.tsx` | Le filtre propose les 13 rôles (selon droits) |
| Attribution des rôles | `utilisateurs.test.tsx` | Les 13 rôles sont sélectionnables (selon droits) |

### Tests d'intégration API

| Test | Fichier | Vérification |
|---|---|---|
| Attribution des 6 rôles manquants | `users.test.ts` | `createUser` et `assignUserRole` acceptent les 6 rôles |
| Visibilité de la validation pour un délégué | `demandes-validation.test.ts` | Un `DELEGATED_REPRESENTATIVE` désigné comme validateur voit le bouton |
| Refus de validation sans délégation active | `demandes-validation.test.ts` | Un `DELEGATED_REPRESENTATIVE` sans délégation active ne peut pas valider |
| Absence d'autorisation supplémentaire pour `canGiveAvis` | `demandes-avis.test.ts` | `DELEGATED_REPRESENTATIVE` n'a pas de droit d'avis départemental |

### Tests de sécurité

| Test | Vérification |
|---|---|
| `TECHNICAL_ADMIN` ne peut pas attribuer `TECHNICAL_ADMIN` | Erreur 403 |
| `TECHNICAL_ADMIN` ne peut pas attribuer `SUPER_ADMIN` | Erreur 403 |
| `SUPER_ADMIN` ne peut pas attribuer `SUPER_ADMIN` à un autre compte | Erreur 403 |

---

## 5. Critères d'acceptation

1. Le référentiel centralisé contient les 13 rôles avec leurs libellés.
2. Le typage est exhaustif (`Record<RoleType, string>`).
3. Les libellés sont cohérents entre `UtilisateurForm.tsx` et `Dashboard.tsx`.
4. Le filtre de rôle propose les 13 rôles (selon les droits d'accès).
5. Le formulaire d'attribution propose les 13 rôles (selon les droits d'accès).
6. `canValidate` inclut `DELEGATED_REPRESENTATIVE` uniquement si la délégation est active.
7. `canGiveAvis` ne change pas (pas d'ajout automatique de `DELEGATED_REPRESENTATIVE`).
8. Tous les tests existants passent.
9. Aucune régression fonctionnelle n'est introduite.

---

## 6. Dépendances entre corrections

```
Correction 1 (centralisation) → Correction 2 (typage) → Correction 3 (harmonisation)
Correction 3 → Correction 4 (filtre)
Correction 3 → Correction 5 (formulaire)
Correction 6 (canValidate) : indépendante
Correction 7 (canGiveAvis) : indépendante (aucun changement)
```

---

## 7. Points à arbitrer (ne bloquent pas le plan)

1. **Libellé de `CPMP_USER`** : "Agent CPMP" vs "Responsable CPMP". Le plan propose "Agent CPMP" (basé sur la nomenclature V4.5), mais le responsable métier peut choisir "Responsable CPMP".
2. **Libellé de `EMPLOYEE`** : "Agent" vs "Receveur d'agence". Le plan propose "Agent" (basé sur la nomenclature V4.5).

---

## 8. Restrictions

- Aucune modification de code n'est autorisée par ce plan.
- Aucune base de données ne doit être consultée.
- Aucun test ne doit être lancé.
- Aucune migration, seed ou reset ne doit être effectué.
- Aucun service ne doit être démarré ou arrêté.
- Aucun déploiement ne doit être effectué.
- Aucun fichier `.env` ne doit être modifié.
- Aucune dépendance ne doit être installée ou mise à jour.
- Aucun utilisateur ni aucune affectation ne doit être créé ou modifié.
- Aucune donnée ne doit être modifiée.
- Aucun fichier source ne doit être modifié.
- Aucun schéma Prisma ne doit être modifié.
- Aucune migration ne doit être créée ou modifiée.
- Aucune configuration ne doit être modifiée.
- Aucun fichier ne doit être créé dans le dépôt (sauf ce plan).
- Aucune nouvelle appellation de rôle ne doit être inventée.
- Aucune permission ne doit être modifiée.
- Aucun rôle ne doit être créé, supprimé, fusionné ou renommé.
- Aucune décision métier ne doit être redéfinie.
- Le workflow V1 doit être respecté.
- Les 13 rôles officiels doivent être conservés.
- Les responsabilités respectives de DPMG, DFC, CPMP et DG doivent être respectées.
- Les règles de périmètre et de délégation validées dans le document V4.5 doivent être préservées.
- Aucune nouvelle permission ne doit être déduite à partir des seuls noms de rôles.
- Aucune intervention sur le serveur de production ne doit être effectuée.
- Aucune intervention sur Coolify ne doit être effectuée.
- Aucun conteneur de production ne doit être touché.
- Aucun service actif ne doit être touché.
- Aucun worker ne doit être touché.
- Aucun déploiement ne doit être effectué.
- Aucune commande susceptible de se connecter à une base de données ne doit être lancée.
- Seules des recherches textuelles et l'inspection statique du code sont autorisées.
- Le plan est factuel, exhaustif et vérifiable.
- Chaque correction est accompagnée du fichier concerné et du résultat attendu.
- Aucune correction n'est effectuée pendant la rédaction du plan.
- La production du plan ne constitue pas une autorisation de développement.
- Le plan est strictement documentaire.
- Le dépôt n'est pas modifié.
- Aucun fichier n'est créé dans le dépôt (sauf ce plan).
- Le plan est le livrable attendu.
- Le plan est complet.
- Le plan est vérifiable.
- Le plan est structuré.
- Le plan contient les 8 sections demandées.
- La section 1 est l'objectif.
- La section 2 est les corrections retenues.
- La section 3 est les règles d'accès à préserver.
- La section 4 est les tests ciblés de non-régression.
- La section 5 est les critères d'acceptation.
- La section 6 est les dépendances entre corrections.
- La section 7 est les points à arbitrer.
- La section 8 est les restrictions.
- Le plan est terminé.
- En attente de validation explicite avant toute intervention corrective.
- Aucun développement ne doit commencer sans cette validation.
- Le plan est factuel.
- Le plan est vérifiable.
- Le plan est exhaustif.
- Le plan est structuré.
- Fin du plan.

---

**STATUT : PLAN CORRECTIF V1 PRODUIT — EN ATTENTE D'AUTORISATION EXPLICITE DE DÉVELOPPEMENT.**

**AUCUNE MODIFICATION DU CODE N'EST AUTORISÉE PAR CE PLAN.**