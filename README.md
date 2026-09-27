# Prodora

Prodora is an evidence-based Digital Product Lifecycle Passport prototype for trustworthy post-sale laptop records. It is a proposed technical solution emerging from the MCA secondary-research study **Evidence-Based Trust Evaluation for Post-Sale Product Lifecycle Records**; the software is not the Minor Project research itself.

## Current status

Phase 2 database foundation. The repository contains a responsive Next.js frontend, an Express API with a health endpoint and safe error response convention, and a MySQL/MariaDB schema (via Prisma) for roles, permissions, and users. Authentication, RBAC APIs, products, and portal features have not been implemented yet.

## Stack

- Frontend: Next.js, React, TypeScript, Tailwind CSS
- Backend: Node.js, Express, TypeScript
- Database: MySQL-compatible MariaDB via XAMPP, accessed through Prisma ORM
- Planned document storage: local filesystem behind a storage abstraction

## Prerequisites

- Node.js 22 or newer and npm 10 or newer
- Git
- XAMPP with MySQL and phpMyAdmin, running locally

Verified on 27 September 2026:

- Node.js `v24.18.0`, npm `11.16.0`, Git `2.47.1.windows.2`
- XAMPP MariaDB `10.4.32` running locally on port 3306
- A `prodora` database and two least-privilege MySQL accounts (`prodora_migrate` for migrations, `prodora_app` for the running app — never root) — see `database/README.md`

## Setup

1. Install dependencies from the repository root:

   ```powershell
   npm install
   ```

2. Copy `backend/.env.example` to `backend/.env` and `frontend/.env.example` to `frontend/.env.local`. Fill in `DATABASE_URL` with your local `prodora_app` password. Never commit the copied files.

3. Set up the local database — see `database/README.md` for the one-time MySQL account/database creation, then from `backend/`:

   ```powershell
   copy .env.migrate.example .env.migrate   # fill in the prodora_migrate password
   npm run db:migrate
   $env:BOOTSTRAP_ADMIN_EMAIL="you@example.com"; npm run db:seed
   ```

4. Start both applications:

   ```powershell
   npm run dev
   ```

- Frontend: `http://localhost:3000`
- API health check: `http://localhost:4000/api/v1/health`

The frontend remains usable if the API is stopped and displays an unavailable status.

## Quality checks

Run every check from the repository root:

```powershell
npm run check
```

Individual commands are available for formatting, linting, type checking, tests, and production builds.

## Workspace

```text
frontend/   Next.js browser application
backend/    Express REST API
database/   Prisma schema record and MySQL/MariaDB setup notes
docs/       Focused project documentation
research/   Synthetic research-support material added only when needed
tests/      Future cross-application end-to-end tests
```

## Current limitations

This is not yet the Prodora MVP. Authentication, RBAC APIs, portals, laptop passports, documents, ownership, QR access, lifecycle history, trust evaluation, conflict detection, and full testing belong to later approved phases.
