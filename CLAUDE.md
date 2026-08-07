# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Active Workspace

Three active components — the rest is legacy reference only:

| Folder | Role | Status |
|---|---|---|
| `backend-web/` | Express REST API + gRPC client | Primary delivery target |
| `frontend/` | React SPA (Vite + TS) | Active — mostly scaffolded |
| `ai/` | FastAPI inference service | Reference/integration only — see `ai/CLAUDE.md` |
| `backend-ai/`, `frontend-old/` | Legacy | Historical reference, do not modify |

## Commands

### Backend Web (`cd backend-web`)
```
npm install
npm run dev          # Express server with tsx hot reload (port 8080)
npm run worker:dev   # BullMQ inference worker
npm run build        # TypeScript compilation
npm run seed:dummy-users
```

### Frontend (`cd frontend`)
```
npm install
npm run dev          # Vite dev server
npm run build        # tsc -b + Vite bundle (zero TypeScript errors required)
npm run lint         # ESLint — zero warnings policy
npm run preview      # Smoke-test the production bundle
```

### AI Service (`cd ai`)
```
scripts/setup_venv.ps1              # Bootstrap venv (Windows)
pip install -r requirements.txt && pip install -e .
scripts/run_infer_service.ps1       # Start FastAPI server
pytest tests/                       # Run contract + unit tests
```

## Architecture

```
Frontend (React + Tailwind)
    ↓ REST JSON
Backend Web (Express + MongoDB + Redis/BullMQ)
    ↓ gRPC (proto/ai/v1/inference.proto)
AI Service (FastAPI + YOLO)
```

**Request flow for inference:** Frontend POSTs a detection job → backend enqueues it in BullMQ → worker calls AI service over gRPC → result persisted to MongoDB → frontend polls for completion.

**Auth:** JWT issued at `POST /api/v1/auth/login`. Three roles: `super_admin`, `admin`, `viewer`. RBAC enforced via `requireRole` middleware.

**Contracts:** gRPC schema — **source of truth is `ai/proto/inference.proto`**. The copy at `backend-web/proto/ai/v1/inference.proto` must stay in sync; run `.\sync-proto.ps1` from the repo root after any proto change, then regenerate Python stubs via `ai/scripts/gen_proto.ps1`. JSON schema for the AI service's REST endpoint lives in `ai/contracts/`. Both must stay stable and additive — never mutate existing paths/fields; version breaking changes instead (`/v2/...`).

## Backend Web Structure

```
src/
├── server.ts / app.ts     # entry + Express builder
├── config/                # env, MongoDB, Redis
├── controllers/           # auth, camera, job, area, user, audit
├── models/                # Mongoose schemas
├── routes/                # REST endpoint wiring
├── middleware/            # JWT auth, requireRole, rate limit
├── plugins/               # gRPC client, mail service
├── queues/                # BullMQ inference queue
└── workers/               # inference job processor
```

Keep REST controllers and the gRPC adapter/client layer (`plugins/`) strictly separated.

## Frontend Structure

```
src/
├── app/                   # router.tsx, auth-provider.tsx, protected-route
├── pages/                 # *.page.tsx (route-level screens)
├── features/              # domain modules (auth, camera, etc.)
├── components/            # shared UI primitives
├── services/              # HTTP client + API adapters
├── store/                 # global state
└── types/                 # *.types.ts (shared TypeScript types)
```

**Naming:** components → `kebab-case.tsx`, pages → `kebab-case.page.tsx`, helpers → `camelCase.ts`, types → `kebab-case.types.ts`.

**Formatting:** Prettier — semicolons on, double quotes, no trailing commas, `printWidth: 100`.

Frontend has no automated test runner yet. Gate changes with `npm run lint` + `npm run build` passing, plus manual validation via `npm run dev`.

## Environment

Copy `backend-web/.env.example` to `backend-web/.env`. Key variables:
- `MONGODB_URI` — MongoDB connection string
- `REDIS_URL` — Redis connection
- `JWT_SECRET`
- `AI_GRPC_TARGET` — defaults to `localhost:50051` (AI service gRPC port)
- SMTP settings for mail notifications

## Commits

Conventional Commit prefixes, scoped by component: `feat(backend-web): ...`, `fix(ai): ...`, `feat(frontend): ...`.
