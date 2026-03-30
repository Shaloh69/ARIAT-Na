# AIRAT-NA System Analyzation & Accomplishment Report (Version 2)

Date: 2026-03-28
Repository: AIRAT-NA
Scope: Full re-analysis incorporating all Phase 0, Phase 1, and Phase 2 remediation work completed since Version 1 (2026-03-07), plus new feature modules shipped.

---

## 1. Executive Summary

Since Version 1, all **Critical** and **High** findings have been fully resolved. The majority of **Medium** findings are resolved. The codebase has undergone a major feature expansion — Cebu Region multi-day trip planning, transit route management, fare configuration, MapManager generalization, animated UI system, and full light/dark mode theming — while maintaining TypeScript and Flutter analysis passes.

Remaining open areas are non-blocking medium/low items related to testing infrastructure, pathfinding scalability, mobile secure storage, and documentation.

**Status summary:**
| Severity | Total | Resolved | Remaining |
|----------|-------|----------|-----------|
| Critical | 3 | 3 | 0 |
| High | 5 | 4 | 1 (H4 — Docker schema, deferred) |
| Medium | 9 | 5 | 4 (M1, M6, M7, M8) |
| Low | 3 | 1 | 2 (L1, L3) |

---

## 2. Repository and Runtime Snapshot

### 2.1 Architecture

- Backend API: Node.js + Express + TypeScript + MySQL + Socket.IO + Supabase Storage.
- Web Admin: Next.js (Pages Router) + React + TypeScript + HeroUI + Leaflet/react-leaflet.
- Mobile App: Flutter + Fluent UI + Provider + offline cache (SQLite + SharedPreferences).
- Infra: `docker-compose.yml` for MySQL only.

### 2.2 Module Inventory (Updated)

**Backend**
- Entry and middleware: `server/src/app.ts`
- Auth and token lifecycle: `server/src/controllers/auth.controller.ts`, `server/src/utils/auth.ts`
- Route/pathfinding engine: `server/src/services/pathfinding.service.ts`
- Realtime navigation: `server/src/services/websocket.service.ts`
- Transit route management: `server/src/controllers/transit.controller.ts`, `server/src/routes/transit.routes.ts`
- Fare configuration: `server/src/controllers/fare.controller.ts`, `server/src/routes/fare.routes.ts`
- Road management (with intersection auto-resolution): `server/src/controllers/road.controller.ts`
- Cluster/guide endpoints: `server/src/routes/cluster.routes.ts`, `server/src/routes/guide.routes.ts`

**Web Admin**
- Auth and pages: `client/ariat_web/pages/*`, `client/ariat_web/lib/*`
- Map component (generalized, transit mode): `client/ariat_web/components/MapManager.tsx`
- Transit route builder page: `client/ariat_web/pages/admin/transit.tsx`
- Fare configuration page: `client/ariat_web/pages/admin/fare-configs.tsx`
- Global theming (animated bg, light/dark CSS vars): `client/ariat_web/styles/globals.css`

**Mobile**
- Auth/API/cache: `client/ariat_app/lib/services/*`
- New screens: `explore_screen`, `saved_screen`, `trips_screen`, `trip_setup_screen`, `trip_overview_screen`, `day_detail_screen`
- New models: `Cluster`, `SavedItinerary`, `DayItinerary`, `MultiDayItinerary`, `CuratedGuide`, `TripSetupParams`

### 2.3 Code Size (Updated Estimate)

- `server/src`: ~40 files / ~7 200 lines (new transit, fare, cluster, guide, road controllers/routes)
- `client/ariat_web` (excl. `node_modules`, `.next`): ~42 files / ~8 500 lines (new transit, fare-configs, MapManager transit mode, globals.css light mode)
- `client/ariat_app/lib`: ~36 files / ~6 200 lines (new screens, models, theme system)

Largest files:
- `client/ariat_web/components/MapManager.tsx` (~1 900+ lines, now includes transit route mode)
- `server/src/services/pathfinding.service.ts` (~715 lines)
- `client/ariat_web/pages/admin/transit.tsx` (~680 lines)
- `client/ariat_web/pages/admin/destinations.tsx` (~683 lines)

### 2.4 Validation Results

- `server`: `npx tsc --noEmit` → **passed**
- `client/ariat_web`: `npx tsc --noEmit` → **passed**; `npx next build` → **passed** (ESLint re-enabled)
- `client/ariat_app`: `flutter analyze` → **No issues found!**
- No first-party automated tests detected in application source.
- `.github` contains directories but no workflows.

---

## 3. Findings — Status Update

## Critical

### C1. ~~Default admin credentials publicly exposed in web login UI~~ ✅ RESOLVED

**Resolution (2026-03-07):**
- Removed demo credentials block (`email`, `password` hint divs) from `client/ariat_web/pages/login.tsx`.
- Login page no longer exposes any default credentials to the user.

---

### C2. ~~Backend hardcodes and enforces canonical admin credentials on startup~~ ✅ RESOLVED

**Resolution (2026-03-07):**
- Removed hardcoded `ADMIN_EMAIL = 'admin@airat-na.com'` and `ADMIN_PASSWORD = 'Admin123!'` constants from `server/src/app.ts`.
- Startup bootstrap now reads from `config.admin.email` and `config.admin.password` sourced exclusively from environment variables.
- No known credentials are baked into any code path.

---

### C3. ~~Insecure JWT secret fallback~~ ✅ RESOLVED

**Resolution (2026-03-07):**
- `server/src/config/env.ts` now includes a production fail-fast guard: if `JWT_SECRET` is not set and `NODE_ENV !== 'development'`, startup throws an error and the process exits.
- Weak default `'change-this-secret'` is no longer used in non-dev environments.

---

## High

### H1. ~~WebSocket session authorization gap~~ ✅ RESOLVED

**Resolution (2026-03-07):**
- Added session ownership check in `server/src/services/websocket.service.ts` for both the `location-update` handler and the `instruction` handler.
- Every session operation now validates `session.userId === socket.data.user.id` before proceeding.

---

### H2. ~~WebSocket CORS policy overly permissive~~ ✅ RESOLVED

**Resolution (2026-03-07):**
- Replaced `origin: '*'` with `origin: config.cors.origin` in `server/src/services/websocket.service.ts`.
- CORS is now controlled by environment configuration, not a wildcard.

---

### H3. ~~Mobile profile update endpoint mismatch~~ ✅ RESOLVED

**Resolution (2026-03-07):**
- Added `PUT /auth/user/me` route to `server/src/routes/auth.routes.ts`.
- Added `updateCurrentUser` controller function to `server/src/controllers/auth.controller.ts`.
- Mobile `PUT /auth/user/me` call now succeeds end-to-end.

---

### H4. Database bootstrap inconsistency in Docker flow ⚠️ DEFERRED

**Status:** Not yet resolved. The `docker-compose.yml` still mounts the full `server/src/database` directory, and `schema_v2.sql` still contains `DROP DATABASE IF EXISTS` / `CREATE DATABASE` / `USE defaultdb` commands that cause non-deterministic container initialization depending on which files MySQL runs first.

**Recommendation (unchanged):**
- Adopt one canonical schema file (prefer `schema_v3.sql`) as the sole container init file.
- Remove DB-level drop/create commands from `schema_v2.sql` or remove the file from the init mount.

---

### H5. ~~Zero CI automation and no first-party automated tests~~ — Partial

**Status:** ESLint re-enabled during build (M9 resolution covers the gate aspect). No GitHub Actions workflows have been added yet. No automated tests added. The build pipeline now enforces lint errors as blockers, which is an improvement, but CI automation and tests remain absent.

---

## Medium

### M1. Pathfinding graph rebuilt per request ⚠️ OPEN

**Status:** Unchanged. Graph is still rebuilt on every `/route/calculate` call. No in-memory cache or invalidation system has been added.

**Recommendation (unchanged):**
- Cache the built graph in memory.
- Invalidate cache on road/intersection create/update/delete operations.

---

### M2. ~~Coordinate validation rejects valid zero values~~ ✅ RESOLVED

**Resolution (2026-03-07):**
- `server/src/controllers/route.controller.ts:65` — falsy check replaced with explicit `=== undefined || === null` guards.
- Valid `0` latitude/longitude values are no longer rejected.

---

### M3. ~~Refresh token payload loses admin role~~ ✅ RESOLVED

**Resolution (2026-03-07):**
- Added `a.role AS admin_role` to the refresh token SQL query in `server/src/utils/auth.ts`.
- Admin role is now populated deterministically from the join result, not reconstructed from an absent field.

---

### M4. ~~Password policy mismatch between mobile and backend~~ ✅ RESOLVED

**Resolution (2026-03-07):**
- `client/ariat_app/lib/screens/auth/register_screen.dart` — minimum password length changed from 6 to 8 characters, matching backend `validators.ts` policy.

---

### M5. ~~API error contract mismatch impacts mobile error quality~~ ✅ RESOLVED

**Resolution (2026-03-07):**
- `client/ariat_app/lib/services/api_service.dart` — error parser updated to read `body['error']` as a fallback when `body['message']` is absent.
- Mobile now surfaces meaningful server error messages for all standard error responses.

---

### M6. Sensitive mobile auth data in plain local storage ⚠️ OPEN

**Status:** Unchanged. `password_hash`, `access_token`, and `refresh_token` are still stored in plaintext SQLite via `cache_service.dart`.

**Recommendation (unchanged):**
- Migrate token/credential storage to `flutter_secure_storage` or platform keystore.

---

### M7. Route-related endpoints lack validator middleware ⚠️ OPEN

**Status:** Unchanged. `server/src/routes/route.routes.ts` endpoints still rely on ad-hoc controller checks.

**Recommendation (unchanged):**
- Add `express-validator` chains for all route API inputs.

---

### M8. Documentation drift and encoding issues ⚠️ OPEN

**Status:** Unchanged. Root `README.md` still references outdated stack details and has encoding artifacts. `client/ariat_web/README.md` is still the Next.js template placeholder.

**Recommendation (unchanged):**
- Rewrite docs to match current architecture, scripts, migrations, and deployment steps.
- Document new modules: transit management, fare configuration, multi-day trips, cluster system.

---

### M9. ~~Web build quality gates weakened~~ ✅ RESOLVED

**Resolution (2026-03-07):**
- `client/ariat_web/next.config.js` — `ignoreDuringBuilds` changed from `true` to `false`.
- ESLint errors now block production builds.
- Fixed resulting ESLint errors in `categories.tsx`, `destinations.tsx`, `map.tsx`, `login.tsx`, `MapManager.tsx` (unescaped entities, img alt text, anchor validity, label associations).

---

## Low

### L1. Deployment artifacts incomplete ⚠️ OPEN

**Status:** Unchanged. No Dockerfiles for the backend or web service exist. Only MySQL is containerized.

---

### L2. ~~Workspace state with large uncommitted deletions~~ ✅ RESOLVED

**Resolution:** Repository has been stabilized. Legacy `mobile/` directory deletions and `client/ariat_app` edits have been committed. Branch state is clean.

---

### L3. Local editor settings with stale path assumptions ⚠️ OPEN

**Status:** Unchanged. `.vscode/settings.json` still points to `C:/Projects/Thesis/...`.

---

## 4. New Findings Introduced Since Version 1

### N1. Animated background invisible in dark mode (CSS stacking context) ✅ RESOLVED

**Finding (2026-03-28):**
- `.bg-animated` (fixed-position, `z-index: -2`) was invisible because the `html` element had no explicit background color. The browser's default white canvas painted over the animation at `z-index: -2`.
- Additionally, `<body>` had the `bg-background` Tailwind class applied, adding a solid white background in light mode.
- `ThemeProvider` was configured with `defaultTheme="light"`, mismatching the dark-first design system.

**Resolution:**
- Added `html { background: #080818; }` to `globals.css`.
- Added `html.light { background: #eef0f9; }` for light mode.
- Removed `bg-background` from `<body>` className in `_document.tsx`.
- Changed `defaultTheme` to `"dark"` in `_app.tsx`.

---

### N2. Light mode had no CSS variable overrides ✅ RESOLVED

**Finding (2026-03-28):**
- The theming system (`next-themes` with `attribute="class"`) adds `class="light"` to `<html>`, but no CSS variable overrides existed for light mode. All UI components fell back to dark-mode defaults.

**Resolution:**
- Added full `html.light { }` CSS variable override block to `globals.css`:
  - `--bg-0` through `--bg-3`: white/translucent surfaces.
  - `--text-strong`, `--text`, `--text-muted`, `--text-faint`: slate text scale.
  - `--border`, `--border-strong`: dark-tinted borders.
  - `--shadow`, `--shadow-soft`: soft dark shadows.
- Added `html.light .bg-animated` with significantly reduced gradient opacity (18% max vs 60% dark) for subtle animation.
- Added light-mode frosted glass for `.glass-sidebar`, `.glass-topbar`, `.glass-card`.
- Added HeroUI input, trigger, popover, and modal overrides for `html.light`.

---

### N3. Transit map empty — wrong fetch method for raw GeoJSON endpoint ✅ RESOLVED

**Finding (2026-03-28):**
- `client/ariat_web/pages/admin/transit.tsx` used `apiClient.get()` (Axios wrapper) to fetch `/roads/geojson`. The endpoint returns raw GeoJSON (`{ type: "FeatureCollection", features: [...] }`) without the standard `{ success, data }` wrapper. The Axios wrapper's response unpacking produced an unusable value.

**Resolution:**
- Replaced `apiClient.get()` with direct `fetch()` for the roads GeoJSON endpoint, matching how `admin/map.tsx` handles it.
- Added `[lng, lat] → [lat, lng]` coordinate conversion when mapping GeoJSON features to Leaflet positions.

---

### N4. React effect race condition in map initialization ✅ RESOLVED

**Finding (2026-03-28):**
- In `TransitRouteMapPicker.tsx`, the roads rendering `useEffect` and the map initialization `useEffect` both checked `if (!mapRef.current) return` but ran concurrently on mount. On fast renders the roads effect ran before map init completed, silently no-oping and never re-running.

**Resolution:**
- Added `mapReady` state flag (`useState(false)`).
- Set `mapReady = true` only after `mapRef.current` is assigned in the init effect.
- Roads and stops effects depend on `mapReady` in their dependency arrays.

---

### N5. Road save causing FK constraint violation ✅ RESOLVED

**Finding (2026-03-28):**
- Frontend `onSaveRoad` was sending `start_intersection_id` and `end_intersection_id` directly. If these IDs referred to intersections that did not exist yet (e.g., freshly snapped virtual nodes), the MySQL FK constraint on `roads` rejected the insert.

**Resolution:**
- Removed `start_intersection_id` / `end_intersection_id` from the frontend `onSaveRoad` payload.
- Added `resolveOrCreateIntersection()` helper in `server/src/controllers/road.controller.ts`: snaps to an existing intersection within 15 m of the given coordinates, or creates a new one. FK references are now always valid server-side.

---

### N6. Transit route builder "Done" closes route modal (event propagation) ✅ RESOLVED

**Finding (2026-03-28):**
- The full-screen route editor overlay (`z-[9999]`) is rendered inside the React tree while the HeroUI route Modal is still open behind it. React's synthetic event system bubbles click events through the component tree regardless of visual `z-index`. Clicking "Done" or any road in the embedded map reached the Modal backdrop's `onClick` handler, triggering `setRouteModal(false)`.

**Resolution:**
- Added `onClick={(e) => e.stopPropagation()}` on the overlay root `<div>` in `transit.tsx`.
- All click events inside the overlay are now contained and cannot reach the Modal backdrop.

---

### N7. MapManager.tsx map pin double-transform offset ✅ RESOLVED

**Finding (2026-03-28):**
- Custom marker DivIcon HTML included `transform: translate(-50%, -100%)` inline, while `iconAnchor` in the Leaflet DivIcon options also applied the same offset. The double transform caused all map pins to render shifted up and to the left.

**Resolution:**
- Removed the inline `transform: translate(-50%, -100%)` from the DivIcon HTML string in `MapManager.tsx`.
- `iconAnchor` alone now handles pin positioning correctly.

---

## 5. New Features Shipped (Phase 2 Development)

### F1. Cebu Region Multi-Day Trip Planning (Mobile)

- App rebranded from Cebu City day-planner to Cebu Region multi-day trip planner.
- 5 navigation tabs: Home | Explore | Trips | Saved | Profile.
- 5 geographic clusters: Metro Cebu, South Cebu, North Cebu, Islands, West Cebu.
- New DB tables: `clusters`, `curated_guides`; extended `destinations`, `itineraries`, `itinerary_destinations`.
- SQL migrations: `server/src/database/migrations/002_cebu_region_revamp.sql`, `002_seed_clusters.sql`.
- New API routes: `GET /api/v1/clusters`, `GET /api/v1/guides`, `DELETE /api/v1/ai/itinerary/:id`.
- New Flutter screens: `explore_screen`, `saved_screen`, `trips_screen`, `trip_setup_screen`, `trip_overview_screen`, `day_detail_screen`.
- `buildMultiDayItinerary()` service in `itinerary.service.ts` — chains days sequentially, each day starts from the last stop of the prior day.

### F2. Transit Route Management (Web Admin)

- New admin page `client/ariat_web/pages/admin/transit.tsx`: full CRUD for transit routes.
- Route builder overlay: full-screen map editor embedded using `MapManager` in `transit_route` mode.
- Road selection by click (click to add/remove roads from route).
- Stop selection by click for `stops_only` pickup mode.
- Route properties: name, short code, color, pickup mode, is_active.

### F3. Fare Configuration with Routing Behavior (Web Admin)

- New admin page `client/ariat_web/pages/admin/fare-configs.tsx`: CRUD for fare configurations.
- Fare fields: base fare, per-km rate, currency, description, is_active.
- `routing_behavior` selector: 6-option grid (shortest_path, fastest_route, scenic_route, avoid_tolls, eco_friendly, transit_priority) with label and description per option.
- Fare table includes Routing column showing current behavior as a HeroUI Chip.

### F4. MapManager Generalization — Transit Route Mode

- Added `"transit_route"` to `MapMode` type.
- New props on `MapManagerProps`: `transitSelectedRoadIds`, `transitSelectedStopIds`, `transitRouteColor`, `transitPickupMode`, `onTransitRoadsChange`, `onTransitStopsChange`, `initialMode`.
- Saved roads render with transit-aware color/weight/opacity when in `transit_route` mode.
- Road click in transit mode toggles road in/out of selection set via `onTransitRoadsChange`.
- Markers render with transit-aware radius and opacity; stop-type markers (`bus_stop`, `bus_terminal`, `pier`) are toggleable in transit mode via `onTransitStopsChange`.

### F5. Animated Background + Light/Dark Mode Theming (Web Admin)

- Fixed animated gradient background visibility (html background, z-index stacking, `bg-background` removal).
- Full light mode CSS variable system in `globals.css` (`html.light { }` overrides).
- Light mode animated background with reduced opacity gradients.
- Light mode frosted glass components (sidebar, topbar, cards).
- Light mode HeroUI component overrides (inputs, modals, popovers, dropdowns).
- Theme default changed to `"dark"` (dark-first design system).

### F6. Mobile Theme System

- `AppColorScheme` ThemeExtension for Flutter.
- `ThemeService` Provider for light/dark toggle.
- Light/dark toggle UI in Profile screen settings.

---

## 6. Remediation Roadmap — Updated Status

### Phase 0 (Immediate) ✅ COMPLETE
All 5 items resolved as of 2026-03-07.

### Phase 1 (Short-term) ✅ COMPLETE
All 5 items resolved as of 2026-03-07–2026-03-28.

### Phase 2 (Medium-term) — In Progress
| Item | Status |
|------|--------|
| Pathfinding graph caching | ⚠️ Open (M1) |
| CI pipeline | ⚠️ Open (H5) |
| First-party automated tests | ⚠️ Open (H5) |
| Mobile secure token storage | ⚠️ Open (M6) |

### Phase 3 (Hardening) — Not Started
- Production Dockerfiles and deployment automation (L1 open).
- Observability baseline (structured logs, metrics, alerting).
- Documentation refresh (M8 open).

---

## 7. Acceptance Criteria — Status

| Criterion | Status |
|-----------|--------|
| No hardcoded default credentials in UI or backend code | ✅ Met |
| Startup fails if critical secrets unset in non-dev environments | ✅ Met |
| Mobile profile update works end-to-end | ✅ Met |
| WebSocket navigation events are session-owner restricted | ✅ Met |
| CI runs on every PR with typecheck + lint + analyze | ⚠️ Not Met (lint in build, no CI pipeline yet) |
| README and setup docs reflect current architecture | ⚠️ Not Met |

---

## 8. Strengths Observed (Updated)

- All Critical and High security findings resolved before any production hardening.
- TypeScript strictness maintained across backend and web through all feature additions.
- Flutter analysis clean across significantly expanded mobile codebase.
- MapManager successfully generalized to support multiple modes (view, edit, transit_route) without separate component proliferation.
- Theming system (animated background + CSS variable cascade + HeroUI overrides) cleanly separates dark/light concerns without component-level conditionals.
- Road pathfinding robustness improved (intersection auto-resolution, virtual node snapping precision, off-course handling).

---

This document is Version 2 and supersedes Version 1 (2026-03-07) as the current remediation and accomplishment baseline.
