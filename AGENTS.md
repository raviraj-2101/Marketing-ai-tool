# AGENTS.md — ai-static-generator

> **This file is the source of truth for this repo.** `CLAUDE.md` defers to it.
> Group: **Marketing Tool** · Role: **Frontend** · OWNER: `@darshan-acentecom`

## What this project is

`ai-static-generator` is the **single user-facing frontend** (React + Vite + TypeScript)
for the Marketing Tool suite. It's the dashboard from which the team generates static
ad images, develops TSL scripts, builds UGC / "Pixar" videos, sets up HeyGen avatars,
and launches ads to Meta / AppLovin.

It is the orchestration layer: it does no heavy compute itself. It calls **two
backends** and Supabase:

- **image-builder** (media/render backend) — via `VITE_SERVER_URL`
- **pipeline-node** (data/ads/ClickUp backend) — via `VITE_PIPELINE_API_BASE_URL`
- **Supabase** — auth (custom JWT), database, and ~20 Deno **edge functions**
  (login, generation triggers, Drive proxying, callbacks).

See the central [Marketing Tool group doc](https://github.com/Acentecom/Acentecom-Developments/blob/main/groups/marketing-tool.md)
for the full system map.

## Tech stack

React 18.3 · Vite 5.4 · TypeScript 5.8 · Tailwind 3.4 + shadcn/ui (Radix) ·
React Router 6 · TanStack Query 5 · React Hook Form 7 + zod · Supabase JS 2 ·
Ag-Grid · TipTap · Recharts · docx / xlsx export. Built originally with **Lovable**
(the `componentTagger` dev plugin is enabled).

## How to run it

Local setup: copy `.env.example` → `.env` (if present) and fill the `VITE_*` vars below,
then install deps and run the dev server. The repo has both `package-lock.json` and
`bun.lock*`; npm is the verified path.

| Command | What it does |
|---|---|
| `npm install` | Install dependencies |
| `npm run dev` | Vite dev server on **port 8080**, HMR (entry `src/main.tsx`) |
| `npm run build` | Production build → `dist/` |
| `npm run build:dev` | Development-mode build (sourcemaps) |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | ESLint 9 (TypeScript) |
| `npm run test` | Vitest, run once |
| `npm run test:watch` | Vitest watch mode |

> TODO: no test files were located under `src/` during review — confirm whether the
> Vitest suite actually exists before relying on `npm run test` in CI.

### Environment variables (names only — never commit values)

| Name | Used for |
|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL (client init) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase anon/public key (browser calls) |
| `VITE_SUPABASE_PROJECT_ID` | Project ID, used in `/functions/v1/*` paths |
| `VITE_SERVER_URL` | **image-builder** base URL (`API_BASE`) for `/api/pixar/*`, `/api/generate-*`, `/api/create-heygen-video`, … |
| `VITE_PIPELINE_API_BASE_URL` | **pipeline-node** base URL for `/api/tsl/*`, `/api/ads/*`, `/api/script/*`. Falls back to `VITE_SERVER_URL` if unset |
| `VITE_SPY_TOOL_URL` | Optional external spy/competitor tool link (AppSidebar) |
| `GOOGLE_CONFIG_SHEET_ID` | Google Sheet ID for product/brand config |
| `CLICKUP_API_KEY` | ClickUp integration (task create/update) |

## Code map (key entry points)

- `src/main.tsx` → `src/App.tsx` — Router (60+ routes), QueryClient, AuthProvider; all
  private pages wrapped in `ProtectedRoute`.
- `src/pages/` — one component per route (Dashboard, StaticsGenerator, **TslDevelopPage**,
  AdsLauncherLaunchPage, BatchCreator, AvatarGeneration, AdsPerformance, …).
- `src/components/` — feature-grouped UI (`ads/`, `statics/`, `tsl/`, `ugc/`,
  `ads-launcher/`, `brands/`, `products/`).
- `src/lib/queryClient.ts` — **defines the two API bases** (`API_BASE`,
  `PIPELINE_API_BASE`) and `pipelineApiRequest()` / `pipelineQueryFn`. Read this first
  before adding any backend call.
- `src/features/ads-launcher/` — self-contained launcher module (`api.ts`,
  `lib/draftStore`, `lib/prefs`).
- `src/hooks/useAuth.tsx` — custom JWT auth (login via `/functions/v1/auth-login`).
- `src/integrations/supabase/` — `client.ts` + generated `types.ts`.
- `supabase/functions/` — ~20 Deno edge functions (auth, generation, Drive proxy,
  callbacks); `supabase/migrations/` — DB schema.

## Task → where to look

- **Edit the Generate Script page / TSL builder UI** → `src/pages/TslDevelopPage.tsx`,
  `src/components/tsl/`, `src/lib/tslStreamChat.ts` (calls pipeline-node `/api/tsl/*`).
- **Static ad generation UI** → `StaticsGenerator` page → image-builder `/api/generate-*`.
- **UGC / Pixar video builder** → `BatchCreator` → image-builder `/api/pixar/*` (async).
- **Avatar setup (HeyGen)** → `AvatarGeneration` → image-builder `/api/generate-avatar`,
  `/api/upload-avatar-to-heygen`.
- **Ad launching (Meta/AppLovin)** → `AdsLauncherLaunchPage` + `src/features/ads-launcher/`
  → pipeline-node.
- **Ad performance / analytics** → `AdsPerformance` → pipeline-node `/api/ads/*`.
- **Drive image management** → `ManageScenes` → Supabase Drive edge functions.

## Conventions & gotchas (don't do X)

- **Two API bases, don't mix them.** `/api/*` rendering calls go to `VITE_SERVER_URL`
  (image-builder); `/api/tsl/*`, `/api/ads/*`, `/api/script/*` go to
  `VITE_PIPELINE_API_BASE_URL` (pipeline-node). Use `pipelineApiRequest()` for the latter.
  **Never hardcode base URLs** — always use the env vars.
- **Auth is a custom JWT**, stored in `localStorage` as `auth_jwt_token` and decoded
  client-side in `useAuth`. It is issued by the `auth-login` edge function — **do NOT use
  Supabase's built-in auth**. A 401 redirects to `/auth`.
- **Backend calls are async + callback-based.** Long jobs (Pixar, generation) reply via
  webhook POST to a Supabase edge function; the `job_id` + opaque `callback_token` must be
  echoed back unchanged (CSRF-like guard).
- **TypeScript strict mode is OFF** (`strictNullChecks: false`, `noImplicitAny: false`).
  Lots of `any`; null-safety is not enforced by the compiler — be defensive.
- **Edge functions run on Deno**, not Node — no npm `require`; use ES modules from
  `esm.sh`/`deno.land` and `Deno.env.get()`.
- Role-based access via `AppSidebar` (`user_type`, `custom_role_types`, `allowed_routes`).
  Put private pages behind `ProtectedRoute`.
- TanStack queries default to `staleTime: Infinity` (manual refetch) and mutations to
  `retry: false`.
- TSL develop session state lives in `sessionStorage` (`tslSession.ts`) and **auto-expires
  after 1 hour**.


## Ownership

OWNER: `@darshan-acentecom` — fill in the responsible person/team.
