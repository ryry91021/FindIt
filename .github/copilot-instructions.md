# Copilot / AI Agent Instructions for FindIt

Purpose: help an AI coding agent get productive quickly in this repository by summarizing architecture, developer workflows, conventions, and integration points.

1. Big picture
- Frontend-first SPA: the main application is a React + TypeScript app built with Vite. See [frontend/package.json](frontend/package.json#L1-L40) and [frontend/README.md](frontend/README.md#L1-L40).
- No server implementation yet: the `backend/` folder is currently empty — the app uses Supabase (BaaS) for auth and persistence.
- Firmware and device code live under `firmware/` and should be considered separate projects (do not modify libraries unless explicitly needed).

2. Key files & entry points (quick links)
- App entry: [frontend/src/main.tsx](frontend/src/main.tsx#L1-L80) and [frontend/src/App.tsx](frontend/src/App.tsx#L1-L200).
- UI components: [frontend/src/components/*](frontend/src/components#L1).
- Auth & backend-integration helpers: [frontend/src/services/supabaseClient.ts](frontend/src/services/supabaseClient.ts#L1-L20) and [frontend/src/services/authService.ts](frontend/src/services/authService.ts#L1-L200).
- Build config: [frontend/tsconfig.app.json](frontend/tsconfig.app.json#L1) and [frontend/tsconfig.json](frontend/tsconfig.json#L1).

3. Developer workflows (concrete commands)
- Start dev server (hot reload):

  cd frontend
  npm install
  npm run dev

- Build for production:

  cd frontend
  npm run build

- Linting:

  cd frontend
  npm run lint

Notes: the `build` script runs `tsc -b` followed by `vite build` (see [frontend/package.json](frontend/package.json#L1-L40)).

4. Environment & secrets
- Supabase client expects env vars `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. See [frontend/src/services/supabaseClient.ts](frontend/src/services/supabaseClient.ts#L1-L12).
- For local dev use an `.env` or your shell to set `VITE_` variables before running `npm run dev`.

5. Project-specific patterns & conventions
- Services folder: cross-cutting integrations live in `frontend/src/services/`. Example: `authService` wraps Supabase auth calls and throws on errors — prefer using these wrappers instead of calling Supabase directly from components. See [frontend/src/services/authService.ts](frontend/src/services/authService.ts#L1-L120).
- Component structure: component files and their CSS are colocated in `frontend/src/components/` (e.g., `Signup.tsx` and `Auth.css`).
- Maps: the app depends on `leaflet` for mapping UI; expect map-related logic and CSS when changing map components.

6. Where to make changes
- UI changes and web app features: `frontend/src/` only.
- If you add a server: create a new top-level `backend/` implementation and update repository README + CI accordingly. Current code assumes no self-hosted backend.
- Avoid changing `firmware/libraries/` contents unless fixing device-specific bugs; treat it as third-party code.

7. Tests & CI
- There are no visible test suites or CI configs in the repo root. When adding tests, prefer small focused unit tests for services and component tests for complex UI logic.

8. Helpful examples to reference
- Auth flow: sign-up and sign-in via `authService.signUp()` / `authService.signIn()` (see [frontend/src/services/authService.ts](frontend/src/services/authService.ts#L1-L40)).
- Supabase startup: client created from `import.meta.env` with an explicit error when env vars are missing (see [frontend/src/services/supabaseClient.ts](frontend/src/services/supabaseClient.ts#L1-L12)).

9. Safety notes for AI edits
- Don't introduce or expose secrets — use `VITE_` env vars and document new env requirements in the README.
- Avoid making broad changes to `firmware/` or embedded libraries without maintainers' approval.

If anything here is unclear or you want more detail (example code templates, suggested tests, or CI steps), tell me which area to expand.
