# Database workspace

Phase 2 RBAC foundation is implemented. Schema, migrations, and seeds live in `backend/prisma/` (Prisma is the source of truth); this folder holds the reviewed design record.

## Stack

MySQL-compatible MariaDB via XAMPP, accessed through Prisma ORM (`backend/prisma/schema.prisma`).

## Accounts

Two local MySQL accounts, least privilege:

- `prodora_migrate` — DDL+DML on `prodora.*` and `prodora_shadow.*` (Prisma's shadow database for drift detection). Used only for `npm run db:migrate` via `backend/.env.migrate` (gitignored). Never used by the running app.
- `prodora_app` — SELECT/INSERT/UPDATE/DELETE only on `prodora.*`. Used by the running app via `backend/.env` `DATABASE_URL`.

Neither the app nor migrations use the MySQL root account.

## Entities (Phase 2 MVP)

- **roles** — `id`, `uuid`, `code` (unique), `name`, `is_system`
- **permissions** — `id`, `uuid`, `code` (unique), `description`
- **role_permissions** — join table, composite PK (`role_id`, `permission_id`)
- **users** — `id`, `uuid`, `email` (unique), `password_hash`, `display_name`, `role_id` (FK, required), `status`

One role per user; roles hold permissions many-to-many. All FKs `RESTRICT`/`CASCADE`, InnoDB, `utf8mb4`/`utf8mb4_unicode_ci`.

## Commands (run from `backend/`)

- `npm run db:migrate` — apply/create migrations using `prodora_migrate`
- `npm run db:seed` — idempotent seed: `admin` role, RBAC-admin permissions, bootstrap admin user (see below)
- `npm run db:generate` — regenerate the Prisma client

## Bootstrap admin

`npm run db:seed` requires `BOOTSTRAP_ADMIN_EMAIL` as an inline environment variable (not stored in any `.env` file). If `BOOTSTRAP_ADMIN_PASSWORD` is omitted, a random password is generated, hashed with bcrypt, and printed once to the console — it is never stored or logged in plaintext afterward. The seed is idempotent: if an admin with that email already exists, it skips silently. If a different admin already exists, it also skips and leaves credentials untouched unless `BOOTSTRAP_ADMIN_ROTATE=true` is set, in which case the existing admin row is updated in place (no duplicate users are ever created).

Product, portal, and authentication/RBAC API entities are out of scope until their respective approved phases.
