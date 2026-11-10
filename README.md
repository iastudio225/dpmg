# DPMG — Gestion des demandes opérationnelles

Application interne pour la gestion des demandes opérationnelles d'une organisation multi-agences.

## Stack technique

- **Frontend** : React 18 + TypeScript + Vite
- **Backend** : Node.js + Express + TypeScript
- **Base de données** : PostgreSQL
- **ORM** : Prisma 5+
- **Validation** : Zod
- **Gestionnaire de paquets** : pnpm (workspace monorepo)

## Structure du monorepo

```
dpmg/
├── apps/
│   ├── api/          # Backend Express
│   └── web/          # Frontend React
├── packages/
│   └── shared/       # Types et schémas partagés
├── database/
│   └── prisma/       # Schéma Prisma
├── docs/             # Documentation
├── pnpm-workspace.yaml
└── package.json
```

## Prérequis

- Node.js ≥ 20
- pnpm ≥ 12
- PostgreSQL ≥ 15 (pour la base de données)

## Installation

```bash
# Installer les dépendances
pnpm install

# Copier et configurer les variables d'environnement
cp .env.example .env
# Éditer .env avec vos valeurs (DATABASE_URL, SESSION_SECRET, etc.)

# Générer le client Prisma
pnpm db:generate

# Appliquer les migrations (recommandé pour production)
pnpm db:migrate

# OU pousser le schéma directement (développement uniquement)
pnpm db:push

# Initialiser les données de démonstration (optionnel, nécessite PostgreSQL)
pnpm db:seed
```

## Développement

```bash
# Lancer API et frontend en parallèle
pnpm dev

# Lancer seulement l'API
pnpm dev:api

# Lancer seulement le frontend
pnpm dev:web
```

L'API sera disponible sur `http://localhost:3001`  
Le frontend sera disponible sur `http://localhost:5173`

## Commandes utiles

```bash
# Build de production
pnpm build

# Vérification des types
pnpm typecheck

# Linting
pnpm lint

# Prisma Studio (interface graphique BDD)
pnpm db:studio
```

## Base de données (PostgreSQL requis)

```bash
# Générer le client Prisma (après modification du schema.prisma)
pnpm db:generate

# Appliquer les migrations versionnées (production / CI)
pnpm db:migrate

# Pousser le schéma sans migration (développement rapide)
pnpm db:push

# Seed données de démonstration (comptes demo@dpmg.local, etc.)
pnpm db:seed

# Seed interactif pour créer le 1er admin technique
pnpm db:seed:admin

# Interface graphique Prisma
pnpm db:studio
```

### Comptes de démonstration créés par `pnpm db:seed`

| Email | Rôle principal | Périmètre |
|-------|----------------|-----------|
| `admin@dpmg.local` | TECHNICAL_ADMIN, DPMG_MANAGER | * (global) |
| `responsable.infra@dpmg.local` | DEPARTMENT_MANAGER, HIERARCHICAL_MANAGER | INFRA |
| `responsable.logistique@dpmg.local` | DEPARTMENT_MANAGER, HIERARCHICAL_MANAGER | LOGISTIQUE |
| `responsable.magasin@dpmg.local` | DEPARTMENT_MANAGER, HIERARCHICAL_MANAGER | MAGASIN |
| `employe.infra@dpmg.local` | EMPLOYEE | INFRA |
| `controleur.dfc@dpmg.local` | DFC_CONTROLLER | * (global) |

**Mot de passe par défaut (démo) :** affiché à la fin du seed (ex: `DemoAdmin2024!`)

⚠️ **Ne jamais utiliser ces comptes en production.**

## Variables d'environnement

| Variable | Description | Défaut |
|----------|-------------|--------|
| `NODE_ENV` | Environnement (development/production/test) | `development` |
| `PORT` | Port de l'API | `3001` |
| `FRONTEND_URL` | URL du frontend pour CORS | `http://localhost:5173` |
| `DATABASE_URL` | URL de connexion PostgreSQL | — |

## Architecture

Voir [docs/architecture.md](docs/architecture.md) pour les conventions et décisions techniques.

## Licence

Usage interne uniquement.