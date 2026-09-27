# Prodora

Prodora is an evidence-based Digital Product Lifecycle Passport prototype for trustworthy post-sale laptop records. It is a proposed technical solution emerging from the MCA secondary-research study **Evidence-Based Trust Evaluation for Post-Sale Product Lifecycle Records**; the software is not the Minor Project research itself.

## Current status

Phase 1 application foundation. The repository contains a responsive Next.js frontend and an Express API with a health endpoint and safe error response convention. Product, database, authentication, and portal features have not been implemented yet.

## Stack

- Frontend: Next.js, React, TypeScript, Tailwind CSS
- Backend: Node.js, Express, TypeScript
- Planned database: MySQL through XAMPP
- Planned document storage: local filesystem behind a storage abstraction

## Prerequisites

- Node.js 22 or newer and npm 10 or newer
- Git
- XAMPP with MySQL and phpMyAdmin (required from Phase 2)

Verified on 30 August 2026 in the initial development environment:

- Node.js `v24.18.0`
- npm `11.16.0`
- Git `2.47.1.windows.2`
- XAMPP, MySQL, and phpMyAdmin were not found in the standard `C:\xampp` location; install or locate them before Phase 2.

## Setup

1. Install dependencies from the repository root:

   ```powershell
   npm install
   ```

2. Copy `backend/.env.example` to `backend/.env` and `frontend/.env.example` to `frontend/.env.local`. The defaults are enough for Phase 1. Never commit the copied files.

3. Start both applications:

   ```powershell
   npm run dev
   ```

- Frontend: `http://localhost:3000`
- API health check: `http://localhost:4000/api/v1/health`

The frontend remains usable if the API is stopped and displays an unavailable status.

## Quality checks

Run every Phase 1 check from the repository root:

```powershell
npm run check
```

Individual commands are available for formatting, linting, type checking, tests, and production builds.

## Workspace

```text
frontend/   Next.js browser application
backend/    Express REST API
database/   Database work beginning in Phase 2
docs/       Focused project documentation
research/   Synthetic research-support material added only when needed
tests/      Future cross-application end-to-end tests
```

## Current limitations

This is not yet the Prodora MVP. MySQL integration, authentication, RBAC, portals, laptop passports, documents, ownership, QR access, lifecycle history, trust evaluation, conflict detection, and full testing belong to later approved phases.
