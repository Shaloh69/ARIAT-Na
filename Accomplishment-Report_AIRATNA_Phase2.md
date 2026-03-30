# UNIVERSITY OF CEBU – LAPU-LAPU AND MANDAUE
## COLLEGE OF ENGINEERING
### CPE 421 (Design Project 2)

| | |
|---|---|
| **Group Number:** | |
| **Name of the Project:** | AIRAT-NA: CEBU REGION REVAMP |
| **Adviser:** | Engr. Diego V. Abad Jr. |

---

## Weekly Accomplishment Reports and Monitoring
*Period: Mar. 16–28, 2026*

---

| Task | Phase | Person In-Charge | Status | Concerns | Proposed Actions |
|------|-------|-----------------|--------|----------|-----------------|
| **1. Collecting and Consolidating the Necessary Requirements for the Cebu Region Revamp System Design** | 2 | MONTAJES, CATHERINE FAYE M. | **Completed** | Requirements for multi-day regional trip planning, cluster-based destination organization, AI itinerary generation, transit route management, fare configuration, and kiosk-based onboarding have all been consolidated and approved as the working scope. | Requirement baseline is finalized and serving as the reference for all ongoing development. All feature additions (transit, fare configs, kiosk) are within approved scope. No further requirement changes expected before Phase 3. |
| **2. Designing the System and Developing a User-Friendly Interface for the Cebu Region Revamp** | 2 | JUMAO-AS, JOSHUA E. | **Completed** | The original application was designed around a single city and single-day trips. The full screen flow and interface had to be redesigned for 5-cluster Cebu region coverage, multi-day trip planning, AI itinerary wizard, admin transit and fare management, and consistent light/dark theming across all clients. | Redesigned and implemented all mobile screens: 5-tab navigation shell (Home, Explore, Trips, Saved, Profile), 3-step trip setup wizard, multi-day trip overview with day switcher, day detail timeline, and saved itineraries list. Admin web redesigned with updated sidebar, transit route builder (full-screen map overlay), fare config grid UI with routing behavior selector, and MapManager with multi-mode support. Full light/dark CSS variable system and animated background implemented across admin web. |
| **3. Developing the Fundamental Features: Destination Navigation, Transport Mode Selection, and Fare Estimation Logic** | 2 | NIERE, XYDRIC CLEVE V. | **Completed** | Destination navigation required multi-cluster filtering and offline caching. Transport mode selection needed to support walk, tricycle, jeepney, bus, ferry, and habal-habal. Fare estimation required per-mode base fare and per-km rate configuration. Additional stability issues were encountered: road save FK constraint violations, Leaflet marker double-offset, transit map not loading (wrong fetch method for raw GeoJSON), and a React effect race condition on map initialization. | Implemented multi-modal route calculation (`POST /routes/calculate-multimodal`) with transport-aware fare computation. Fare Configurations CRUD completed on both admin web and backend with routing behavior enum (6 options). Fixed road FK issue with `resolveOrCreateIntersection()` helper. Fixed map pin offset, transit map empty issue (switched to direct `fetch()`), and map init race condition with `mapReady` state flag. All TypeScript and Flutter analysis checks passing. |
| **4. Constructing and Assembling the Working Prototype for the Cebu Region Revamp System** | 2 | JUMAO-AS, JOSHUA E. | **Completed** | Security gaps needed to be resolved before prototype stabilization: hardcoded credentials in UI and backend, insecure JWT secret fallback, permissive WebSocket CORS, missing session ownership checks, missing `PUT /auth/user/me` endpoint, password policy mismatch between mobile and backend, and disabled ESLint build gate. Transit route builder "Done" button was also closing the route modal due to event propagation through the React tree. | All Critical (C1–C3) and High (H1–H3) security findings resolved. Mobile password policy aligned to backend (8 chars min). API error parser updated to read `body['error']` fallback. ESLint re-enabled as build blocker. MapManager generalized with `transit_route` mode (road and stop click selection). Transit builder "Done" button propagation bug fixed with `stopPropagation` on overlay. Full prototype passing `tsc --noEmit`, `next build`, and `flutter analyze`. |
| **5. Implementing the AI-Powered Itinerary Generation and Multi-Day Trip Planning** | 2 | NIERE, XYDRIC CLEVE V. | **Completed** | AI itinerary generation required a scalable destination ranking system that respects cluster, interest, budget, group type, and transport mode preferences. Multi-day support needed a day-chaining algorithm where each day's start point is the prior day's last stop. Saving, loading, and deleting trips also needed to be tied to authenticated users. | Implemented `buildMultiDayItinerary()` in `itinerary.service.ts` with sequential day chaining. Full AI endpoint suite: `POST /ai/itinerary/generate`, `POST /ai/itinerary/save`, `GET /ai/itinerary/saved`, `GET /ai/itinerary/:id`, `DELETE /ai/itinerary/:id`. Mobile wizard (3-step: area → preferences → duration/budget) connected end-to-end with trip overview and day detail screens. Save with custom title, share (clipboard), and duplicate (copy) all working. |
| **6. Developing the Explore, Curated Guides, and Cluster-Based Discovery Feature** | 2 | MONTAJES, CATHERINE FAYE M. | **Completed** | The app needed a browsable discovery layer beyond the AI planner — covering Cebu's 5 geographic clusters, destination spot search with 14 interest filters, and editorially curated guides with difficulty and duration metadata. Data had to be accessible offline via caching. | Built Explore screen with 3 tabs: Areas (5 clusters with region icons and colors), Spots (full-text search + cluster + 14 interest category filters), Guides (curated guide cards with cover images, difficulty, duration). Home screen displays featured destinations, cluster quick-links, and guide previews. Backend cluster and guide read-only endpoints implemented. All data cached for offline access. |
| **7. Developing the Web Kiosk Client — Tablet Browser with App QR Handoff** | 2 | MONTAJES, CATHERINE FAYE M. / JUMAO-AS, JOSHUA E. | **In Process** | A public tablet-facing kiosk client is needed so visitors at stations can browse destinations and pre-built itineraries without an account. The selected itinerary must transfer to the user's phone when they are ready to start, prompting app install if needed and auto-loading the itinerary after sign-in. Deep link handling must also be added to the mobile app to receive the kiosk handoff. | Develop a touch-optimized Next.js kiosk client under `/kiosk/*` with: (1) no-auth destination and itinerary browse with cluster/category filtering; (2) "Start Journey" generates a QR code encoding a deep link (`airatna://itinerary/{id}?source=kiosk`); (3) scanning opens the app store if not installed, or launches the app directly; (4) app checks auth state — prompts sign in/sign up if unauthenticated — then auto-loads and starts the selected itinerary. Add idle timeout auto-reset on kiosk. Implement deep link URI handlers in Flutter (Android intent filter + iOS URL scheme). |

---

## Completed Features — Full Inventory

| Feature | Mobile | Web Admin | Backend |
|---------|--------|-----------|---------|
| Authentication (login, register, refresh, logout) | ✅ | ✅ | ✅ |
| 5-Tab Navigation Shell (Home, Explore, Trips, Saved, Profile) | ✅ | — | — |
| Home Screen (featured destinations, clusters, guides) | ✅ | — | ✅ |
| Explore — 3 Tabs (Areas, Spots, Guides) with 14 interest filters | ✅ | — | ✅ |
| AI Itinerary Generation (wizard + generation + overview + day detail) | ✅ | — | ✅ |
| Multi-Day Trip Planning (day chaining, trip overview, day timeline) | ✅ | — | ✅ |
| Saved Itineraries (list, delete, duplicate, reopen) | ✅ | — | ✅ |
| Map with Multi-Modal Route Planning | ✅ | ✅ | ✅ |
| Multi-Modal Route Calculation (walk, jeepney, bus, tricycle, ferry) | ✅ | ✅ debugger | ✅ |
| Destinations Management | Read-only | ✅ Full CRUD | ✅ |
| Categories Management | Display only | ✅ Full CRUD | ✅ |
| Fare Configuration CRUD with Routing Behavior Selector | — | ✅ Full CRUD | ✅ |
| Transit Stops CRUD | — | ✅ Full CRUD | ✅ |
| Transit Routes CRUD with Map Builder | — | ✅ Full CRUD | ✅ |
| Roads Management | — | ✅ Full CRUD | ✅ |
| MapManager — View / Edit / Transit Route Modes | — | ✅ | — |
| Admin Dashboard (stats cards) | — | ✅ | ✅ |
| Light / Dark Mode Theme Toggle | ✅ | ✅ | — |
| Animated Background (web admin) | — | ✅ | — |
| Offline Caching + Connectivity Awareness | ✅ | — | — |
| User Profile Edit | ✅ | — | ✅ PUT /auth/user/me |
| Security Hardening (credentials, JWT, CORS, session ownership) | ✅ | ✅ | ✅ |

---

## In Process

### Task 7 — Web Kiosk Client

**Status:** Development not yet started. Design and scope defined this period.

**Planned User Flow:**
```
[Kiosk Tablet — no login required]
  Browse Destinations / Curated Itineraries
  Filter by Cluster or Category
        ↓
  Tap "Start Journey" on selected itinerary
        ↓
  QR Code shown on kiosk screen
  (encodes: airatna://itinerary/{id}?source=kiosk)
        ↓
[User's Phone — scan QR]
  App not installed → redirects to App Store / Play Store
  App installed     → opens AIRAT-NA via deep link
        ↓
  Auth check: not logged in → Sign In / Sign Up screen
  After auth → itinerary auto-loads → navigation begins
        ↓
[Kiosk]
  Auto-resets to home after inactivity timeout
```

**Planned Screens:**
| Screen | Description |
|--------|-------------|
| `KioskHome` | Featured destinations, curated itineraries, cluster filter strip |
| `KioskExplore` | Destination grid with cluster and category filters |
| `KioskItineraryDetail` | Day-by-day overview, stop cards, total duration and cost |
| `KioskQRHandoff` | Full-screen QR code with scan instructions, countdown auto-reset |

**Pending Items:**
- [ ] Next.js kiosk page group (`/kiosk/*`) — touch-optimized, no-auth
- [ ] Deep link URL scheme handler in Flutter (Android `intent-filter`, iOS `CFBundleURLTypes`)
- [ ] Deep link routing middleware in `main.dart` (check auth → navigate to itinerary on open)
- [ ] QR code generation on "Start Journey" (encode itinerary deep link)
- [ ] Idle timeout auto-reset on kiosk (inactivity detection)
- [ ] Backend: optional `GET /itinerary/public/:id` endpoint for kiosk (no auth required)

---

## Remaining Open Items (Not Blocking Prototype)

| Item | Area | Notes |
|------|------|-------|
| Theme preference not persisted on mobile | Mobile | Resets to dark on app restart — fix with `SharedPreferences` |
| Turn-by-turn navigation guidance | Mobile Map | Route legs exist; step-by-step UI not yet built |
| Real-time off-course detection | Mobile Map | Backend endpoint exists (`POST /check-off-course`); not called from mobile |
| Push notification backend | Mobile / Backend | Mobile service initialized; no backend push support yet |
| CI/CD pipeline | All | No GitHub Actions workflows; `tsc`, `next build`, `flutter analyze` run manually |
| Automated tests | All | No first-party tests in any client or backend |
| Mobile secure token storage | Mobile | Tokens stored in SQLite plaintext; migrate to `flutter_secure_storage` |
| Documentation refresh | Docs | README still references outdated architecture |

---

**Group Members:**

| | |
|---|---|
| | JUMAO-AS, JOSHUA E. |
| | MONTAJES, CATHERINE FAYE M. |
| | NIERE, XYDRIC CLEVE V. |

---

*(Attach updated screenshots: multi-day trip setup, explore screen with clusters, admin transit route builder, fare configuration, light and dark mode, and kiosk wireframes once available)*
