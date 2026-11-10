# Architecture et conventions DPMG

## Principes directeurs

- **Simplicité** : Pas d'abstractions inutiles, code lisible et maintenable.
- **Type-safety** : TypeScript strict partout, Zod pour la validation runtime.
- **Séparation des responsabilités** : API, frontend et shared clairement séparés.
- **Sécurité par défaut** : Helmet, CORS restrictif, validation d'entrée, pas de secrets en dur.

## Structure du code

### `packages/shared`

Contient les types et schémas Zod partagés entre l'API et le frontend.

- `types.ts` : Interfaces TypeScript pures (réponses API, erreurs, etc.)
- `zod.ts` : Schémas Zod pour validation (env, réponses, entrées)

### `apps/api`

Backend Express organisé par fonctionnalité :

```
src/
├── config/         # Configuration validée (env)
├── middleware/     # Middlewares Express (erreurs, auth future)
├── routes/         # Routes par domaine (health, future: demands, users...)
├── app.ts          # Configuration Express centrale
└── index.ts        # Point d'entrée, démarrage serveur
```

Conventions :
- Une route = un fichier dans `routes/`
- Middleware d'erreur centralisé dans `middleware/errorHandler.ts`
- Variables d'environnement validées au démarrage via `config/index.ts`
- Réponses API typées avec Zod

### `apps/web`

Frontend React + Vite :

```
src/
├── components/     # Composants réutilisables (future)
├── hooks/          # Hooks personnalisés (future)
├── pages/          # Pages par route (future)
├── services/       # Appels API (future)
├── App.tsx         # Composant racine
└── main.tsx        # Point d'entrée
```

Conventions :
- Composants fonctionnels + hooks
- CSS variables pour le theming
- Proxy Vite vers l'API en dev (`/api` → `localhost:3001`)

### `database/prisma`

Schéma Prisma unique source de vérité pour la BDD.

- Modèles : User, Agency, Direction (extensible)
- Génération client : `pnpm db:generate`
- Migrations : `prisma migrate dev` (pas encore configuré)

## Conventions de nommage

| Élément | Convention | Exemple |
|---------|------------|---------|
| Fichiers/dossiers | kebab-case | `error-handler.ts`, `health-check` |
| Variables/fonctions | camelCase | `getEnv`, `healthCheckResponse` |
| Types/Interfaces | PascalCase | `HealthCheckResponse`, `ApiError` |
| Constantes | UPPER_SNAKE_CASE | `MAX_RETRY_COUNT` |
| Composants React | PascalCase | `UserCard`, `DemandForm` |
| Variables d'env | UPPER_SNAKE_CASE | `DATABASE_URL` |

## Gestion des erreurs

- `AppError` : Erreurs métier avec code, message, status HTTP, détails
- `ZodError` : Erreurs de validation (400)
- Middleware centralisé : Log serveur + réponse JSON structurée
- Pas de `try/catch` dans les routes, laisser bubbler vers le handler

## Variables d'environnement

Validées au démarrage via Zod (`packages/shared/src/zod.ts`). Échec = arrêt process.

Fichier `.env.example` à la racine comme modèle, jamais de vrais secrets en repo.

## Base de données

- Prisma Client généré dans `node_modules/@prisma/client`
- Schéma dans `database/prisma/schema.prisma`
- Connexion via `DATABASE_URL` (PostgreSQL)
- Pas de seed ni migration automatique en phase 1

## Scripts disponibles

À la racine (`package.json`) :
- `dev` : API + frontend en parallèle
- `dev:api` / `dev:web` : Individuellement
- `build` : Compile API + build frontend
- `typecheck` : Vérification TypeScript sans emit
- `lint` : ESLint sur API + frontend
- `db:generate` / `db:push` / `db:studio` : Prisma

## Extensions futures (phases suivantes)

1. **Auth** : JWT, refresh tokens, middleware `requireAuth`, rôles
2. **Demandes** : CRUD complet, workflow d'état, assignation
3. **Organigramme** : CRUD agences/directions, liaison utilisateurs
4. **UI** : Layout avec sidebar, tableaux, formulaires, modales
5. **Tests** : Vitest (unit), Playwright (e2e), Supertest (API)