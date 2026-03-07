# AIRAT-NA Current System Analyzation (Version 1)

Date: 2026-03-07  
Repository: AIRAT-NA  
Scope: Full re-analysis of backend, web, mobile, infrastructure, and documentation.

## 1. Executive Summary

AIRAT-NA is a multi-client platform with a TypeScript Express API (`server`), a Next.js admin web console (`client/ariat_web`), and a Flutter mobile app (`client/ariat_app`). Core capabilities are implemented and compile/analyze checks currently pass, but there are high-risk security and operational gaps that should be addressed before production hardening.

Top concerns:
- Default credentials are both exposed in the UI and force-managed in backend startup logic.
- Security defaults are unsafe (`JWT_SECRET` fallback, permissive WebSocket CORS).
- Cross-client contract mismatches exist (mobile profile update endpoint does not exist on server).
- Scalability and reliability risks exist in pathfinding and deployment bootstrap.

## 2. Repository and Runtime Snapshot

### 2.1 Architecture

- Backend API: Node.js + Express + TypeScript + MySQL + Socket.IO + Supabase Storage.
- Web Admin: Next.js (Pages Router) + React + TypeScript + HeroUI.
- Mobile App: Flutter + Fluent UI + Provider + offline cache (SQLite + SharedPreferences).
- Infra: `docker-compose.yml` for MySQL only.

### 2.2 Module Inventory

- Backend entrypoint and middleware: `server/src/app.ts`
- Auth and token lifecycle: `server/src/controllers/auth.controller.ts`, `server/src/utils/auth.ts`
- Route/pathfinding engine: `server/src/services/pathfinding.service.ts`
- Realtime navigation: `server/src/services/websocket.service.ts`
- Web admin auth and pages: `client/ariat_web/pages/*`, `client/ariat_web/lib/*`
- Mobile auth/API/cache: `client/ariat_app/lib/services/*`

### 2.3 Code Size (source only)

- `server/src`: 34 files / 5818 lines
- `client/ariat_web` (excluding `node_modules` and `.next`): 34 files / 6067 lines
- `client/ariat_app/lib`: 24 files / 3664 lines

Largest files:
- `client/ariat_web/components/MapManager.tsx` (1433 lines)
- `server/src/services/pathfinding.service.ts` (715 lines)
- `client/ariat_web/pages/admin/destinations.tsx` (683 lines)
- `client/ariat_app/lib/screens/map/map_screen.dart` (660 lines)

### 2.4 Validation Results

- `server`: `npx tsc --noEmit` -> passed
- `client/ariat_web`: `npx tsc --noEmit` -> passed
- `client/ariat_app`: `flutter analyze` -> "No issues found!"
- No first-party automated tests detected in application source.
- `.github` contains directories but no workflows.

## 3. Prioritized Findings

## Critical

### C1. Default admin credentials are publicly exposed in web login UI

Evidence:
- `client/ariat_web/pages/login.tsx:112`
- `client/ariat_web/pages/login.tsx:113`
- `client/ariat_web/pages/login.tsx:114`

Risk:
- Any user accessing login sees valid default credentials.

Recommendation:
- Remove demo credentials from UI immediately.
- Move demo instructions to private dev docs only.

### C2. Backend hardcodes and enforces canonical admin credentials on startup

Evidence:
- `server/src/app.ts:120` (`ADMIN_PASSWORD = 'Admin123!'`)
- `server/src/app.ts:119` (`ADMIN_EMAIL = 'admin@airat-na.com'`)
- Startup ensure/upsert flow in `server/src/app.ts` (lines ~118-182)

Risk:
- Predictable credential baseline exists in runtime behavior.
- Startup logic can recreate known credentials depending on DB state.

Recommendation:
- Remove hardcoded credential constants from code.
- Require environment-provided bootstrap credentials only for first-run provisioning.
- Disable bootstrap account creation after first successful admin setup.

### C3. Insecure JWT secret fallback

Evidence:
- `server/src/config/env.ts:22` (`JWT_SECRET || 'change-this-secret'`)

Risk:
- Weak predictable secret can allow token forgery if env is misconfigured.

Recommendation:
- Fail fast on startup when `JWT_SECRET` is missing in non-test environments.
- Enforce minimum secret entropy policy.

## High

### H1. WebSocket session authorization gap (session ownership not validated)

Evidence:
- Session lookup without owner check: `server/src/services/websocket.service.ts:117`, `:187`
- Ownership only used during disconnect cleanup: `server/src/services/websocket.service.ts:233`

Risk:
- Authenticated users may interact with sessions not belonging to them if session IDs are guessed/leaked.

Recommendation:
- On every session operation, verify `session.userId === socket.data.user.id`.
- Use high-entropy server-generated session IDs.

### H2. WebSocket CORS policy is overly permissive

Evidence:
- `server/src/services/websocket.service.ts:34` (`origin: '*'`)
- `server/src/services/websocket.service.ts:36` (`credentials: true`)

Risk:
- Over-broad origin policy for authenticated real-time channel.

Recommendation:
- Restrict to explicit trusted origins from environment configuration.

### H3. Mobile profile update endpoint mismatch (client-server contract break)

Evidence:
- Mobile calls `PUT /auth/user/me`: `client/ariat_app/lib/services/auth_service.dart:185-186`
- Server defines only `GET /auth/user/me`: `server/src/routes/auth.routes.ts:40-42`

Risk:
- Profile updates always fail in mobile app.

Recommendation:
- Add backend `PUT /auth/user/me` handler and route, or change mobile client to an existing supported endpoint.

### H4. Database bootstrap inconsistency in Docker flow

Evidence:
- Docker mounts full `server/src/database` into MySQL init: `docker-compose.yml` (volumes section)
- `schema_v2.sql` contains DB-level commands:
  - `server/src/database/schema_v2.sql:4` (`DROP DATABASE IF EXISTS defaultdb`)
  - `server/src/database/schema_v2.sql:5` (`CREATE DATABASE defaultdb`)
  - `server/src/database/schema_v2.sql:6` (`USE defaultdb`)

Risk:
- Confusing/non-deterministic schema initialization path across `schema.sql`, `schema_v2.sql`, `schema_v3.sql`.

Recommendation:
- Use one canonical schema for container init (prefer v3).
- Avoid DB-level drop/create in shared initialization scripts.

### H5. Zero CI automation and no first-party automated tests

Evidence:
- `.github` has no workflow files.
- No application tests found outside dependency trees.

Risk:
- Regressions and security issues are more likely to ship undetected.

Recommendation:
- Add basic CI pipeline: lint, typecheck, backend tests, web tests, flutter tests.

## Medium

### M1. Pathfinding graph is rebuilt per request (scalability risk)

Evidence:
- Graph build function: `server/src/services/pathfinding.service.ts:260`
- Called on route calculation paths: `:390`, `:678`
- Interpolates virtual nodes every 0.1 km: `:69`

Risk:
- CPU/memory overhead grows with road network size and request volume.

Recommendation:
- Cache graph in memory with invalidation on road/intersection updates.

### M2. Coordinate validation rejects valid zero values due falsy checks

Evidence:
- `server/src/controllers/route.controller.ts:65`

Risk:
- Valid coordinates at `0` latitude/longitude are treated as missing.

Recommendation:
- Validate with explicit `=== undefined || === null` checks and numeric validation.

### M3. Refresh-token payload may lose admin role information

Evidence:
- Query omits admin role: `server/src/utils/auth.ts:93-99`
- Role reconstructed from absent field: `server/src/utils/auth.ts:112`

Risk:
- Role-dependent logic can become inconsistent after token refresh.

Recommendation:
- Include `a.role` in refresh-token query and populate payload deterministically.

### M4. Password policy mismatch between mobile and backend

Evidence:
- Mobile accepts 6+ chars: `client/ariat_app/lib/screens/auth/register_screen.dart:52-53`
- Backend enforces 8+ with complexity: `server/src/utils/validators.ts:13`

Risk:
- Users get late server-side failures and poor UX.

Recommendation:
- Align client validation with backend policy.

### M5. API error contract mismatch impacts mobile error quality

Evidence:
- Backend error handler responds with `error`: `server/src/middleware/error.middleware.ts` (multiple responses)
- Mobile parser reads `message`: `client/ariat_app/lib/services/api_service.dart:97`

Risk:
- Mobile displays generic errors when server sends only `error`.

Recommendation:
- Standardize error schema (`message` + machine code) across all endpoints.

### M6. Sensitive mobile auth data stored locally without secure enclave usage

Evidence:
- SQLite stores `password_hash`, `access_token`, `refresh_token`:
  - `client/ariat_app/lib/services/cache_service.dart:44-47`
  - `client/ariat_app/lib/services/cache_service.dart:143-146`

Risk:
- Higher exposure if device storage is compromised.

Recommendation:
- Move tokens/credential material to secure storage (`flutter_secure_storage` / platform keystore).

### M7. Route-related endpoints lack structured validator middleware

Evidence:
- `server/src/routes/route.routes.ts` defines endpoints without validator chain.

Risk:
- Input quality and error consistency depend on controller ad hoc checks.

Recommendation:
- Add express-validator chains for all route APIs.

### M8. Documentation drift and encoding issues

Evidence:
- Root README references missing docs/tests and outdated stack claims:
  - `README.md:286`, `:525`, `:554`, `:558`, `:562`, `:647`
- Web README is template placeholder, not system-specific: `client/ariat_web/README.md`
- Root README has visible mojibake/encoding artifacts.

Risk:
- Onboarding and operations errors.

Recommendation:
- Rewrite docs to match current architecture, scripts, and deployment.

### M9. Web build quality gates are weakened

Evidence:
- Lint ignored during build: `client/ariat_web/next.config.js:7`
- Dev script runs `next build` before dev server: `client/ariat_web/package.json:6`

Risk:
- Slower local iteration and potential lint debt entering production artifacts.

Recommendation:
- Enforce lint in CI and adjust dev script to standard `next dev`.

## Low

### L1. Deployment artifacts are incomplete

Evidence:
- `docker-compose.yml` only provisions MySQL; no service Dockerfiles for backend/web were found.

Recommendation:
- Add production Dockerfiles and compose profiles for full stack.

### L2. Workspace state shows large uncommitted deletions/modifications

Evidence:
- `git status --short` includes many deletions under legacy `mobile/` and edits in `client/ariat_app/*`.

Recommendation:
- Stabilize branch state before release branch cut or production deploy.

### L3. Local editor settings include stale path assumptions

Evidence:
- `.vscode/settings.json` points to `C:/Projects/Thesis/...`, not current workspace path.

Recommendation:
- Normalize developer tooling settings or remove machine-specific entries.

## 4. Strengths Observed

- Good modular separation (controllers/routes/services/middleware).
- Type safety in backend and web is enabled and currently passing checks.
- Mobile app includes practical offline behavior (cache + connectivity awareness).
- Pathfinding service is feature-rich (A* + virtual node interpolation + off-course handling).
- Upload subsystem is integrated with Supabase Storage and supports media validation.

## 5. Reanalysis Delta (Newly Added vs First Pass)

Additional missed/expanded items captured in this v1 reanalysis:
- Public exposure of demo admin credentials in web login page.
- WebSocket session ownership authorization gap.
- Pathfinding per-request graph rebuild scalability concern.
- Plain local storage of credential/token material in mobile offline auth cache.
- Documentation encoding and architecture drift details.

## 6. Recommended Remediation Roadmap

### Phase 0 (Immediate: 24-48 hours)

1. Remove demo credentials from web login UI.
2. Remove hardcoded admin credentials from backend startup path.
3. Enforce mandatory `JWT_SECRET` in runtime config.
4. Lock down Socket.IO CORS origins.
5. Patch WebSocket session ownership checks.

### Phase 1 (Short-term: 1 week)

1. Fix mobile/server profile update contract (`PUT /auth/user/me`).
2. Align password validation rules across clients and backend.
3. Standardize API error response schema.
4. Add route endpoint validators.
5. Consolidate one canonical DB schema/init path.

### Phase 2 (Medium-term: 2-4 weeks)

1. Introduce graph caching/invalidation in pathfinding service.
2. Add CI pipeline with lint/typecheck/analyze/test stages.
3. Add first-party tests for auth, route calc, and critical CRUD.
4. Move mobile credential/token storage to platform secure storage.

### Phase 3 (Hardening: 1-2 months)

1. Production deployment automation (Dockerfiles + environment matrix).
2. Observability baseline (structured logs, latency/error metrics, alerting).
3. Documentation refresh (root/server/web/mobile setup and operations runbooks).

## 7. Acceptance Criteria for "Version 1 Stabilization"

- No hardcoded default credentials in UI or backend code.
- Startup fails if critical secrets are unset in non-dev environments.
- Mobile profile update works end-to-end.
- WebSocket navigation events are session-owner restricted.
- CI runs on every PR with at least typecheck + lint + analyze.
- README and setup docs reflect actual current architecture and commands.

---

This document is Version 1 and should be treated as the baseline remediation backlog for production readiness.
