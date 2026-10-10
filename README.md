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
- Sharing with users and external links (permission, expiry, password). Department/group sharing and department folders are currently disabled (they relied on an external directory that was removed — see `docs/group-sharing.html`)
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
cp frontend/.env.example frontend/.env   # set BETTER_AUTH_SECRET (openssl rand -base64 32)
make install                             # frontend + backend deps
make infra                               # postgres, redis, minio, mailpit
make migrate                             # DB schema (Alembic)
make auth-migrate                        # Better Auth tables (Postgres schema "auth", Better Auth CLI)
make backend                             # FastAPI on :8000 (BACKEND_PORT)
make frontend                            # Next.js on :3000 (FRONTEND_PORT)
make worker                              # arq background worker
```

Open http://localhost:3000 and sign in with Google or GitHub (see below). To try it locally without OAuth apps,
set `AUTH_DEV_PASSWORD_LOGIN=true` in `frontend/.env`: `/login` then shows a DEV email + password form
(ignored when `NODE_ENV=production`). API docs: http://localhost:8000/docs. Mail catcher: http://localhost:18025.

Checks before pushing: `make ci-local` (typecheck + lint + pytest + frontend build). Also `make vitest` and
`make e2e` (Playwright; needs the backend running and `AUTH_DEV_PASSWORD_LOGIN=true`).

## Status / known limitations

- **Sign-in is [Better Auth](https://www.better-auth.com) (Google / GitHub).** The Next.js BFF exchanges the
  Better Auth session for a short-lived (5 min) RS256 JWT and forwards it as `Authorization: Bearer`; the
  backend verifies it against Better Auth's JWKS (ADR-0023).
- Company (workspace) membership lives in the app database. Your first sign-in creates a **personal workspace**;
  company admins can add people who have signed in at least once, by email (Settings → members). There are no
  invitation emails yet.
- The desktop sync client (`ashfield-sync`) still uses the old token flow and has to be migrated (see ADR-0015).
- The frontend UI is built from local shadcn/ui (Radix + Tailwind 4) components: `frontend/components/ui/`
  (shadcn primitives) and `frontend/components/ui-custom/` (app frame, user menu, confirm dialog, toast hook).
  There are no private package dependencies.

## Sign-in setup (Better Auth)

Frontend (`frontend/.env`) and backend (root `.env`) must agree on the app URL.

| Where | Variable | Notes |
|-------|----------|-------|
| frontend | `BETTER_AUTH_SECRET` | 32+ random chars (`openssl rand -base64 32`) |
| frontend | `BETTER_AUTH_URL` | Public URL of this app, e.g. `https://drive.example.com` |
| frontend | `DATABASE_URL` | Same Postgres as the backend (`postgresql://…`); Better Auth tables live in schema `auth` |
| frontend | `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | "Google로 계속하기" is shown only when both are set |
| frontend | `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | "GitHub로 계속하기" is shown only when both are set |
| both | `ALLOWED_EMAILS` | Comma-separated allowlist. **If empty, anyone with a Google/GitHub account can sign up** (each gets a personal workspace) |
| frontend | `AUTH_DEV_PASSWORD_LOGIN` | `true` enables email + password login for local/E2E only; ignored in production |
| backend | `AUTH_JWKS_URL` | `${BETTER_AUTH_URL}/api/auth/jwks` |
| backend | `AUTH_ISSUER` / `AUTH_AUDIENCE` | both `${BETTER_AUTH_URL}` |
| backend | `SYSTEM_ADMIN_EMAILS` | Optional comma-separated system admins |

OAuth callback (redirect) URLs:

- Google: `${BETTER_AUTH_URL}/api/auth/callback/google`
- GitHub: `${BETTER_AUTH_URL}/api/auth/callback/github`

**Google** — [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → Credentials → *Create
OAuth client ID* → type "Web application". Add `BETTER_AUTH_URL` to *Authorized JavaScript origins* and the Google
callback above to *Authorized redirect URIs*; copy the client ID/secret into `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`
(configure the OAuth consent screen first if prompted).

**GitHub** — Settings → Developer settings → [OAuth Apps](https://github.com/settings/developers) → *New OAuth App*.
Homepage URL = `BETTER_AUTH_URL`, Authorization callback URL = the GitHub callback above; copy the Client ID and a new
client secret into `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET`. (A GitHub OAuth app has a single callback URL, so use
separate apps for local and production.)

Then run `make auth-migrate` (again after upgrades) and restart the frontend.

## License

TBD.
