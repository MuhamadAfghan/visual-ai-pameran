# Frontend Conventions

## Naming
- UI component files: `kebab-case.tsx` (contoh: `camera-card.tsx`).
- Page files: `kebab-case.page.tsx` (contoh: `live-dashboard.page.tsx`).
- Utility/helper files: `camelCase.ts` (contoh: `formatDate.ts`).
- Types/interfaces: `kebab-case.types.ts` (contoh: `camera.types.ts`).
- Folder names: lowercase, single purpose, hindari nested berlebihan.

## Structure
- `app/`: router, provider, app-level bootstrap.
- `features/`: domain-oriented modules (auth, camera, report, dsb).
- `components/`: reusable UI primitives dan shared widgets.
- `services/`: HTTP client + API adapters.
- `store/`: global state container.
