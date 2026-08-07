# Repository Guidelines

## Project Structure & Module Organization
This repository is split by delivery area. Use `backend-web/` for the primary REST API and gRPC bridge to AI, `frontend/` for the Vite + React client, `ai/` for model and inference service code, and `docs/` for architecture references. Treat `backend/`, `backend-ai/`, and `frontend-old/` as legacy reference only. In `backend-web/src/`, keep controllers, routes, services, models, plugins, and workers separated by concern. In `ai/src/cctv_insight_ai/`, keep service, pipeline, model, and utility modules focused.

## Build, Test, and Development Commands
Run commands from the component you change.

- `cd backend-web && npm run dev`: start the API with `tsx` watch mode.
- `cd backend-web && npm run build`: compile TypeScript to `dist/`.
- `cd backend-web && npm run worker:dev`: run the inference worker in watch mode.
- `cd frontend && npm run dev`: start the Vite frontend locally.
- `cd frontend && npm run build`: build the frontend bundle.
- `cd frontend && npm run lint`: run ESLint with zero warnings allowed.
- `cd ai && .\\scripts\\setup_venv.ps1`: create the local Python virtual environment on Windows.
- `cd ai && pip install -r requirements.txt && pip install -e .`: install AI dependencies.
- `cd ai && pytest`: run AI contract and unit tests.

## Coding Style & Naming Conventions
Use 4-space indentation in Python and follow TypeScript defaults in the web apps. Prefer `snake_case` for Python files, functions, and variables; `PascalCase` for classes; and `UPPER_SNAKE_CASE` for constants. In frontend code, follow existing names such as `kebab-case.page.tsx` and `kebab-case.types.ts`. Keep API and protobuf changes additive when possible.

## Testing Guidelines
Backend validation is currently script-driven, so at minimum run `npm run build` in `backend-web` after changes. For frontend work, run `npm run lint` and `npm run build`. For AI or contract changes, run `pytest` in `ai/`, especially when touching `ai/contracts/` or `backend-web/proto/ai/v1/inference.proto`. Name Python tests `test_*.py` with behavior-focused names such as `test_returns_masked_person_count`.

## Commit & Pull Request Guidelines
Recent history uses Conventional Commit-style prefixes such as `feat:` and `fix:`. Keep commits scoped by component, for example `feat(backend-web): add event filter support`. PRs should include a short summary, impacted components, linked task or issue, verification steps, and screenshots for UI work or sample API payloads.

## Security & Configuration Tips
Never commit `.env` files, model weights, or camera credentials. Validate schema and contract changes against `ai/contracts/*.schema.json`, and version breaking API changes instead of mutating existing paths in place.
