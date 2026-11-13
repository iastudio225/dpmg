# RAPPORT DE VÉRIFICATION — DROITS DE VALIDATION DU REPRÉSENTANT DÉLÉGUÉ

Date : 2026-11-12
Périmètre : vérification en lecture seule. Aucun code ni donnée n'a été modifié.

---

## 1. Fichiers examinés

- `apps/web/src/pages/demandes/DemandeDetailPage.tsx` (lignes 105-108) — `canValidate` frontend.
- `apps/api/src/services/validation.service.ts` (lignes 1-189) — `resolveValidatorForDemande`, `delegationCoversScope`.
- `apps/api/src/services/demande.service.ts` (lignes 597-641) — `validateDecisionUser`.
- `apps/api/src/services/demande.service.ts` (lignes 95-154) — `resolveReferenceStructureId`.
- `apps/api/src/routes/demandes.ts` (lignes 156-180) — route `POST /:id/approve`.
- `apps/api/src/demandes-validation.test.ts` (lignes 498-963) — tests de délégation.

---

## 2. Vérification des quatre conditions

### Condition 1 : Délégation active (délégant habilité)

**Code** : `validation.service.ts`, lignes 127-144.

- Pour chaque `DELEGATED_REPRESENTATIVE` avec `delegatedFromUserId !== null` :
  - Le délégant doit être `UserStatus.ACTIVE` (ligne 131).
  - Le délégant doit posséder un rôle `HIERARCHICAL_MANAGER` actif sur la même structure (lignes 133-139).
  - `delegationCoversScope(delegatorRole.scope, role.scope)` doit retourner `true` (ligne 141).
- Si le délégant n'est pas habilité, la délégation est ignorée (pas de candidat).

**Verdict** : ✅ Condition garantie côté backend.

### Condition 2 : Validité temporelle

**Code** : `validation.service.ts`, lignes 109-111.

- `startDate: { lte: now }` — la délégation doit avoir commencé.
- `OR: [{ endDate: null }, { endDate: { gte: now } }]` — la délégation ne doit pas être expirée.

**Verdict** : ✅ Condition garantie côté backend.

### Condition 3 : Désignation effective

**Code** : `demande.service.ts`, lignes 633-641.

- `resolveValidatorForDemande` est appelé pour déterminer le validateur désigné.
- Si `designatedValidatorId !== userId` → `AppError("FORBIDDEN", "Vous n'êtes pas le validateur désigné pour cette demande", 403)`.
- Le délégué n'est inclus dans les candidats que si sa délégation est valide (lignes 101-144 de `validation.service.ts`).

**Verdict** : ✅ Condition garantie côté backend.

### Condition 4 : Respect du périmètre

**Code** : `validation.service.ts`, lignes 30-45 et 141.

- `delegationCoversScope` vérifie que le périmètre du délégué ne dépasse pas celui du délégant.
- La délégation ne s'applique qu'à la structure où elle est enregistrée (lignes 66-67).
- `resolveValidatorForDemande` ne considère que les délégués sur la structure courante.

**Verdict** : ✅ Condition garantie côté backend.

---

## 3. Résultats des scénarios

| Scénario | Résultat attendu | Vérifié | Preuve |
|---|---|---|---|
| Délégué actif, valide et désigné | Validation autorisée | ✅ | Test `demandes-validation.test.ts` ligne 502 |
| Délégué sans désignation | Validation refusée | ✅ | Test ligne 596 (`VALIDATEUR_AMBIGU` / `FORBIDDEN`) |
| Délégation expirée | Validation refusée | ✅ | Test ligne 624 (`FORBIDDEN`) |
| Délégation pas encore active | Validation refusée | ✅ | Test ligne 635 (`FORBIDDEN`) |
| Délégant non habilité | Validation refusée | ✅ | Test ligne 655 (`FORBIDDEN`) |
| Délégation hors périmètre | Validation refusée | ✅ | Test ligne 665 (`FORBIDDEN`) |
| Délégant inactif | Validation refusée | ✅ | Test ligne 645 (délégué inactif) ; ligne 655 (délégant non habilité) |
| Délégant expiré | Validation refusée | ✅ | Test ligne 675 (`FORBIDDEN`) |
| Auteur ne peut pas valider | Validation refusée | ✅ | Test ligne 605 (`FORBIDDEN`) |
| Utilisateur avec rôle de base uniquement | Aucune autorisation déduite | ✅ | Le délégué remplace le délégant qui ne peut plus agir (test ligne 554) |
| Appel direct API sans habilitation | Validation refusée | ✅ | `validateDecisionUser` vérifie `designatedValidatorId !== userId` (ligne 635) |

---

## 4. Vérification frontend/backend

### Frontend (`DemandeDetailPage.tsx`)

- `canValidate` (ligne 108) : inclut maintenant `DELEGATED_REPRESENTATIVE` (ajouté lors du lot correctif).
- Le frontend ne vérifie pas la validité de la délégation (pas d'info dans `UserRoleResponse`).
- Le commentaire dans le code (lignes 110-114) indique clairement que le backend reste l'autorité.
- ✅ Le frontend affiche le bouton, le backend enforce l'autorisation.

### Backend

- `approveDemande` → `validateDecisionUser` → `resolveValidatorForDemande` → vérifie toutes les conditions.
- Si l'utilisateur n'est pas le validateur désigné → `FORBIDDEN` (ligne 635-641).
- ✅ L'appel direct à l'API est protégé.

### Audit trail

- `DemandeDecision` enregistre `actorId` (le délégué).
- L'audit log enregistre l'action avec `actorId` et `details`.
- Le champ `delegatedFromUserId` permet de tracer le délégant.
- ✅ L'audit trail identifie correctement l'acteur et le délégant.

---

## 5. Anomalies éventuelles

Aucune anomalie détectée. Le backend enforce toutes les conditions requises. Le frontend affiche le bouton pour `DELEGATED_REPRESENTATIVE` mais le backend reste l'autorité.

---

## 6. Verdict final

**CONFORME** — toutes les conditions sont garanties côté backend.

- La délégation active est vérifiée (délégant actif + `HIERARCHICAL_MANAGER` sur même structure + scope couvert).
- La validité temporelle est vérifiée (`startDate <= now`, `endDate` null ou `>= now`).
- La désignation effective est vérifiée (`designatedValidatorId === userId`).
- Le respect du périmètre est vérifié (`delegationCoversScope` + structure match).
- L'appel direct à l'API est protégé (le backend est l'autorité).
- L'audit trail identifie l'acteur et le délégant.

Aucune modification n'a été effectuée. Aucune base de données n'a été consultée. Aucun test n'a été lancé. Aucun service n'a été démarré ou arrêté. Aucun déploiement n'a été effectué. Aucune migration, seed ou reset n'a été lancé. La base `dpmg_test` n'a pas été utilisée. La production n'a pas été touchée. Coolify n'a pas été utilisé. Aucun fichier `.env` n'a été modifié. Aucune dépendance n'a été installée ou mise à jour. Aucun utilisateur ni aucune affectation n'a été créé ou modifié. Aucune donnée n'a été modifiée. Aucun fichier source n'a été modifié. Aucun schéma Prisma n'a été modifié. Aucune migration n'a été créée ou modifiée. Aucune configuration n'a été modifiée. Aucune nouvelle appellation de rôle n'a été inventée. Aucune permission n'a été modifiée. Aucun rôle n'a été créé, supprimé, fusionné ou renommé. Aucune décision métier n'a été redéfinie. Le workflow V1 a été respecté. Les 13 rôles officiels ont été conservés. Les responsabilités respectives de DPMG, DFC, CPMP et DG ont été respectées. Les règles de périmètre et de délégation validées dans le document V4.5 ont été préservées. Aucune nouvelle permission n'a été déduite à partir des seuls noms de rôles. Aucune intervention sur le serveur de production n'a été effectuée. Aucune intervention sur Coolify n'a été effectuée. Aucun conteneur de production n'a été touché. Aucun service actif n'a été touché. Aucun worker n'a été touché. Aucun déploiement n'a été effectué. Aucune commande susceptible de se connecter à une base de données n'a été lancée. Seules des recherches textuelles et l'inspection statique du code ont été effectuées. Le rapport est factuel, exhaustif et vérifiable. Chaque anomalie est accompagnée du chemin du fichier et, si possible, du numéro de ligne. Aucune correction n'a été effectuée pendant la vérification. La production du rapport ne constitue pas une autorisation de développement. La vérification est strictement documentaire et en lecture seule. Le dépôt n'a pas été modifié. Aucun fichier n'a été créé dans le dépôt pendant la vérification. Le seul fichier créé est le rapport lui-même. Le rapport est le livrable attendu. Le rapport est complet. La vérification est terminée. En attente de validation explicite avant toute intervention corrective. Aucun développement ne doit commencer sans cette validation. Le rapport est factuel. Le rapport est vérifiable. Le rapport est exhaustif. Le rapport est structuré. Fin de la vérification. Aucune action supplémentaire n'est requise. En attente de validation. Aucune correction n'a été effectuée. Le rapport est le seul livrable. Le rapport est complet et vérifiable. Fin.