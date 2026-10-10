# Ashfield Drive

Self-hostable, multi-tenant file storage and sharing (a lightweight Nextcloud alternative).
Each company (tenant) gets an isolated workspace with personal and shared areas.

The calendar app lives in a separate repo, [`ashfield-calendar`](https://github.com/ashfieldlab/ashfield-calendar),
and the Windows desktop sync client in [`ashfield-sync`](https://github.com/ashfieldlab/ashfield-sync).
They share no code or database; the calendar is linked from the header via `NEXT_PUBLIC_CALENDAR_URL`.

Docs: [SPEC.md](SPEC.md) · [CONTEXT.md](CONTEXT.md) (domain language) · [docs/adr/](docs/adr/) (design decisions). Most docs are in Korean.

## Features

- Uploads (large multipart, drag & drop), folders, move/rename, trash
- Sorting, type filters, search (exactly matches read permissions — ADR-0020)
- Sharing with users, departments (via an external directory) and external links (permission, expiry, password)
- Vaults: end-to-end encrypted folders, server only sees ciphertext (ADR-0016)
- File versions (ADR-0022)
- Quotas per company and per user
- Notifications: in-app, email, webhooks
- Admin: members and roles, quotas, SMTP, audit log (CSV), job monitoring

## Stack

```
frontend/   Next.js 16 · React · Tailwind
backend/    FastAPI · SQLAlchemy 2.0 async · Alembic · arq worker · aioboto3
infra       Postgres · Redis · MinIO (S3-compatible) · Mailpit   (docker compose, dev)
```

## Local development

Requires Docker, Python 3.14, Node 20+.

```sh
cp .env.example .env                     # host ports, secrets
cp frontend/.env.example frontend/.env.local
make install                             # frontend + backend deps
make infra                               # postgres, redis, minio, mailpit
make migrate                             # DB schema
make backend                             # FastAPI on :8000 (BACKEND_PORT)
make frontend                            # Next.js on :3000 (FRONTEND_PORT)
make worker                              # arq background worker
```

Open http://localhost:3000. API docs: http://localhost:8000/docs. Mail catcher: http://localhost:18025.

Checks before pushing: `make ci-local` (typecheck + lint + pytest + frontend build).

## Status / known limitations

- **Auth is dev-mode only for now.** With `SKIP_AUTH=true` (the default in `.env.example`) you pick a dev
  user at `/login` and the app signs a JWT with `dev-keys/` (never use these keys outside local dev).
  The production path in the code borrows sessions from an external auth gateway (ADR-0021); it is planned
  to be replaced by Auth.js with Google / GitHub sign-in.
- The frontend UI is built from local shadcn/ui (Radix + Tailwind 4) components: `frontend/components/ui/`
  (shadcn primitives) and `frontend/components/ui-custom/` (app frame, user menu, confirm dialog, toast hook).
  There are no private package dependencies.

## License

TBD.
