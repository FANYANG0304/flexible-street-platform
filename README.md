# Flexible Street Platform

**🌐 语言 / Language:** [简体中文](README.zh.md) · **English**

---

> A decision-support platform for urban planners that scores every street in Philadelphia on a real-time **Flexibility Score Index (FSI)** from 0-100. The score blends POI density, AI street-view perception, and live weather / traffic / events / holidays modifiers, and is overlaid with two safety constraints (emergency-services veto and closure-cluster coordination). The platform answers: *"when and where can we temporarily reallocate this street from car traffic to pedestrians, events, or commerce?"*
>
> **Repository:** https://github.com/FANYANG0304/flexible-street-platform
> **Pilot city:** Philadelphia, PA, USA
> **Purpose of this document:** Enable anyone who has the code to deploy their own instance from scratch and understand the project's architecture and design rationale.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Quick Start](#2-quick-start)
3. [Environment Variables](#3-environment-variables)
4. [Supabase Backend](#4-supabase-backend)
5. [Running & Health Checks](#5-running--health-checks)
6. [Project Structure](#6-project-structure)
7. [Build & Deploy](#7-build--deploy)
8. [Troubleshooting](#8-troubleshooting)
9. [Common Development Patterns](#9-common-development-patterns)
10. [Reports & Further Reading](#10-reports--further-reading)
11. [Post-Deployment Checklist](#11-post-deployment-checklist)

---

## 1. Project Overview

### 1.1 What it is

The platform's core is the **FSI (Flexibility Score Index)** algorithm: based on along-street POI density, it computes two scoring dimensions per street — **commercial** vibrancy and **community** institution density — using a perpendicular-corridor decay model, then sigmoid-normalizes each to 0-100. Four multiplicative modifiers (live traffic, weather, seasonal events, holiday boosts) and one AI-weighted blend (LLaVA street-view perception) are applied on top of the base score.

In addition, three **independent constraint layers** (which do *not* alter the score, but are presented separately):

- **Ownership / closeability** — 14 agency types graded into 3 tiers (CITY = directly closeable / SEPTA etc. = needs coordination / STATE = cannot close)
- **Emergency-services veto** — Streets within 150 m of a hospital, 90 m of a fire station, or 70 m of a police station are forbidden from closure
- **Closure-cluster detection** — A union-find algorithm finds groups of ≥3 connected, closeable, high-scoring streets, signaling that closing one implies coordinating the rest

### 1.2 Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript 5.6 + Vite 5.4 |
| Map engine | Mapbox GL JS 3.7 (custom vector tiles) |
| Backend | Supabase (PostgreSQL + RPC functions) |
| Styling | Tailwind CSS 3.3 |
| Icons | Lucide React |
| AI module | LLaVA 7B (offline pre-scoring, results stored in Supabase) |
| Deployment | GitHub Actions → GitHub Pages (also supports Vercel/Netlify) |

**Runtime model:** Pure static site. All scoring happens in the browser in real-time; the backend only serves data through 4 RPC functions. **No standalone server process.**

### 1.3 Current Completion Status

| Feature | Status |
|---|---|
| Multi-dimensional FSI scoring (commercial + community) | ✅ |
| Mobility informational tag (excluded from composite) | ✅ |
| Live modifiers (traffic / weather / events / holiday) | ✅ |
| LLaVA AI street-view perception | ✅ |
| Ownership / closeability tiering | ✅ |
| Emergency-services veto | ✅ |
| Closure-cluster detection | ✅ |
| Pilot zone visualization (Center City / West Philadelphia) | ✅ |
| Playstreets validation calibration | ✅ |
| Detail panel with factor explanations | ✅ |
| User feedback mechanism | 🔮 Future work |
| Network topology / detour-cost analysis | 🔮 Future work |
| One-way street awareness | 🔮 Future work |

For detailed design reflections and future plans, see [reports/final-report.pdf](reports/final-report.pdf).

---

## 2. Quick Start

> Get it running locally in 5 minutes.

### 2.1 Prerequisites

| Tool | Minimum Version | Verify |
|---|---|---|
| Git | 2.30+ | `git --version` |
| Node.js | **18.x or higher** | `node --version` |
| npm | 9+ | `npm --version` |

> Node 18 is required — React 18 / Vite 5 / Mapbox GL 3 all depend on it, and the GitHub Actions runner uses Node 18 too.

### 2.2 Clone + Install

```bash
git clone https://github.com/FANYANG0304/flexible-street-platform.git
cd flexible-street-platform
npm install
```

### 2.3 Configure environment variables (see §3)

```bash
cp .env.example .env
# Open .env and fill in the 5 keys.
```

### 2.4 Start dev server

```bash
npm run dev
```

Open http://localhost:5173 in your browser.

---

## 3. Environment Variables

API keys are not committed to the repo. They live in a local `.env` file (ignored by git). Copy [`.env.example`](.env.example) to `.env` and fill in the values below.

### 3.1 The 5 Variables

| Variable | Purpose | Where to obtain |
|---|---|---|
| `VITE_MAPBOX_TOKEN` | Map rendering and vector tiles | https://account.mapbox.com/access-tokens/ |
| `VITE_SUPABASE_URL` | Supabase backend URL | Supabase dashboard → Project Settings → API |
| `VITE_SUPABASE_ANON_KEY` | Supabase public anonymous key | Same as above |
| `VITE_GOOGLE_SV_KEY` | Street View imagery in the detail panel | https://console.cloud.google.com/ → enable "Street View Static API" |
| `VITE_TICKETMASTER_KEY` | Seasonal events data feeding the events modifier | https://developer.ticketmaster.com/ |

All 5 are needed for full functionality. Mapbox, Google, and Ticketmaster have generous free tiers that comfortably cover normal use.

### 3.2 Security

All `VITE_*` variables are bundled into the frontend JS and visible in the browser. Lock them down on the provider side using HTTP referrer restrictions (Mapbox, Google Cloud) or rate limits. Never put server-side secrets — e.g. Supabase `service_role` key — into a `VITE_*` variable; only the `anon` key is safe to expose.

### 3.3 GitHub Secrets (for GitHub Pages auto-deploy)

When using GitHub Actions ([deploy.yml](.github/workflows/deploy.yml)), set the same 5 keys as repository secrets at:

```
Settings → Secrets and variables → Actions → New repository secret
```

The workflow currently injects 4 of them (`VITE_MAPBOX_TOKEN`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_GOOGLE_SV_KEY`). To also pass Ticketmaster, add `VITE_TICKETMASTER_KEY: ${{ secrets.VITE_TICKETMASTER_KEY }}` in the build step's `env` block.

---

## 4. Supabase Backend

All persistent data (POIs, AI street scores, Playstreets, Open Streets events) lives in Supabase. The frontend **only accesses the backend via 4 RPC functions** — no direct `.from(table)` calls — so all data access is wrapped as stored procedures.

### 4.1 RPC Function Reference

| RPC name | Arguments | Purpose | Called from |
|---|---|---|---|
| `get_anchors_in_bounds` | `min/max_lat/lng, scenario_ids[]` | Fetch POI anchors in viewport (filtered by scenario) | [MapComponent.tsx:299](src/components/MapComponent.tsx) |
| `get_poi_in_bounds` | `min/max_lat/lng` | Fetch all POIs in viewport (FSI scoring core data) | [MapPage.tsx:194](src/pages/MapPage.tsx), [MapComponent.tsx:315](src/components/MapComponent.tsx) |
| `get_playstreets_lines_in_bounds` | `min/max_lat/lng` | Fetch Playstreets lines in viewport (validation set) | [MapPage.tsx:207](src/pages/MapPage.tsx), [MapComponent.tsx:330](src/components/MapComponent.tsx) |
| `get_street_events_in_bounds` | `min/max_lat/lng` | Fetch Open Streets events in viewport | [MapPage.tsx:210](src/pages/MapPage.tsx), [MapComponent.tsx:346](src/components/MapComponent.tsx) |

There is one paginated table:
- `street_ai_scores` — LLaVA offline analysis results, loaded once at init (1000 rows per batch). See [streetScores.ts](src/lib/streetScores.ts).

### 4.2 Deploy your own Supabase instance

You need a Supabase project to host the data. The Philadelphia snapshot exported at project closeout includes the schema, all POI data, AI scores, Playstreets, Open Streets events, the 4 RPC functions, and RLS policies — restoring it takes about 10 minutes.

1. Create a free account at https://supabase.com/dashboard.
2. Create a new project. Pick **East US 2** or **N. Virginia** as the region. Set a database password and keep it — you'll need it to run the import.
3. Wait for the project to finish provisioning (~2 minutes).
4. In the new project's **SQL Editor**, enable PostGIS first. The project relies on spatial queries, so this step is mandatory:
   ```sql
   CREATE EXTENSION IF NOT EXISTS postgis;
   ```
5. Download the snapshot: https://drive.google.com/file/d/1n17KISskPiTSJghWa26Kc7CqiWpn-LG5/view?usp=sharing (`flexible-street-backup.sql`).
6. Import the file. The recommended path is `psql`:
   ```bash
   psql "postgresql://postgres:YOUR_PASSWORD@db.YOUR_PROJECT.supabase.co:5432/postgres" \
        -f flexible-street-backup.sql
   ```
   Copy the connection string from **Settings → Database → Connection string → URI (Direct connection, port 5432)**. Do not use the Pooler URL on port 6543 — `psql` won't work through it.

   For small files you can also paste the SQL directly into the SQL Editor and run it.
7. From **Project Settings → API**, copy `Project URL` into `VITE_SUPABASE_URL` and the `anon` `public` key into `VITE_SUPABASE_ANON_KEY` in your `.env`.

#### Deploying to another city

Philadelphia's POI, AI scores, and Playstreets data won't fit other cities. You'll need to swap:

- `poi` table → OSM POI extract for your city
- `street_ai_scores` table → rerun the LLaVA pipeline against your city's Street View imagery
- Pilot-zone bboxes and the holiday calendar in [src/data/mockData.ts](src/data/mockData.ts)
- Mapbox vector tile URL hardcoded as `mapbox://yangf0304.az4ve7hc` in [MapComponent.tsx](src/components/MapComponent.tsx)

---

## 5. Running & Health Checks

```bash
npm run dev
```

Normal output:

```
  VITE v5.4.21  ready in 800 ms
  ➜  Local:   http://localhost:5173/
```

Open http://localhost:5173/ — you should see:
1. The landing page
2. After navigating to `/map`, the Philadelphia map loads
3. After toggling "Flexibility Score" in the sidebar, streets begin to colorize

### 5.1 Health-Check Cheatsheet

| Symptom | Likely cause | Fix |
|---|---|---|
| Map is completely blank | Mapbox token wrong or missing | Check `VITE_MAPBOX_TOKEN` in `.env`, restart `npm run dev` |
| Map base loads but no POIs appear | Wrong Supabase URL/key, or RPC functions not deployed | F12 → Network → look for supabase.co requests; 401 = wrong key, 404 = RPC missing |
| Flexibility Score stays gray | POIs loaded but scoring still computing | Wait 1-2 seconds, or zoom in to ≥14 |
| Detail panel missing street-view image | Google SV key missing or wrong | Check `VITE_GOOGLE_SV_KEY` |
| Console warns `Missing Supabase env vars` | `.env` not loaded | Confirm filename is `.env` not `env.txt`, restart dev server |

---

## 6. Project Structure

```
flexible-street-platform/
├── .github/workflows/deploy.yml    # GitHub Actions auto-deploy to Pages
├── public/                          # Static assets (copied to dist as-is, no build)
├── src/                             # All source code
│   ├── components/                  # React components
│   ├── pages/                       # Page-level components (route entries)
│   ├── lib/                         # Business logic, algorithms, API wrappers
│   ├── data/                        # Static config data
│   ├── types/                       # Shared TypeScript types
│   ├── App.tsx                      # Root component + router
│   ├── main.tsx                     # React entry point
│   └── index.css                    # Tailwind import + global styles
├── reports/                         # Project final report (PDF/HTML)
├── .env.example                     # Env-var template (in repo)
├── .env                             # Real env vars (git-ignored, create locally)
├── .gitignore
├── index.html                       # Vite HTML entry
├── package.json
├── tsconfig*.json
├── tailwind.config.js
├── vite.config.ts
├── DEPLOYMENT.md                    # Multi-platform deploy details (Vercel/Netlify/Docker)
├── README.md                        # This document (English)
└── README.zh.md                     # Chinese version
```

### 6.1 `src/components/` — UI components

| File | Purpose |
|---|---|
| `MapComponent.tsx` | **Core component**. Mapbox map init, all layer management (street scores, POIs, events, clusters, emergency veto), RPC data loading, click/hover interactions. ~1300 lines, the most complex file |
| `Sidebar.tsx` | Left panel: time selector, scenario filters, layer toggles |
| `MapLegend.tsx` | Bottom-right legend: score color scale, ownership colors, emergency constraints, etc. |
| `StreetScorePanel.tsx` | Detail panel triggered by clicking a street: scores, sub-scores, AI vibe, modifiers, emergency veto banner, cluster badge. Draggable |
| `StreetEventPanel.tsx` | Open Streets event detail panel (with street-view image) |
| `AnchorDetailPanel.tsx` | POI anchor detail panel |

### 6.2 `src/pages/` — Routed pages

| File | Purpose |
|---|---|
| `LandingPage.tsx` | Home `/` |
| `MapPage.tsx` | Main map page `/map`. Calls Supabase to load POIs, AI scores, Playstreets, events; fetches weather/holiday data; passes props to MapComponent |
| `Dashboard.tsx` | Stats dashboard `/dashboard` |

### 6.3 `src/lib/` — Business logic (mostly pure functions)

| File | Purpose |
|---|---|
| **`fsiScores.ts`** | **Algorithm core**. POI corridor distance decay, sigmoid-saturated scoring, composite calculation, ownership tiering, traffic modifier, emergency veto, cluster detection (union-find). ~700 lines |
| `fsiCalibrate.ts` | Tools to back-fit saturation parameters against the Playstreets validation set, callable from the browser console |
| `streetScores.ts` | Loads LLaVA AI scores from Supabase paginated and builds lookup index |
| `events.ts` | Ticketmaster API + Philadelphia local holiday calendar + event-proximity modifier calculation |
| `weather.ts` | Open-Meteo API live/forecast weather, mapped to a 0.2-1.0 multiplier |
| `supabase.ts` | Supabase client singleton (env check, init) |

### 6.4 `src/data/` and `src/types/`

- `data/mockData.ts` — Scenario definitions (school dismissal, weekend market, etc., 6 in total), pilot-zone bboxes, time bins
- `types/index.ts` — Shared interfaces across files (Anchor, Scenario, StreetScore, etc.)

### 6.5 Key Data Flow

```
User opens /map
  ↓
MapPage loads initial data:
  ├─ Supabase RPC: get_poi_in_bounds (entire Philadelphia)
  ├─ Supabase pagination: street_ai_scores
  ├─ Supabase RPC: get_playstreets_lines_in_bounds
  ├─ Supabase RPC: get_street_events_in_bounds
  ├─ Open-Meteo API: current weather
  └─ Ticketmaster API: seasonal events
  ↓
Passes props to MapComponent
  ↓
Mapbox renders: street vector tiles + POI dots + event layer
  ↓
User toggles "Flexibility Score" on
  ↓
MapComponent.applyScores() fires:
  For each street in viewport:
    ├─ computePoiFSI(coords, pois) → commercial / community / mobility sub-scores
    ├─ getEmergencyVeto(coords, pois) → emergency-access check
    ├─ getTrafficModifier / getEventModifier / weather / holiday → modifiers
    └─ computeCompositeTotal(...) → final 0-100 composite score
  Writes to Mapbox feature-state, triggering layer redraw
  ↓
applyClusters() post-pass:
  For all streets with score ≥75 + closeable + not vetoed:
    findClusters(...) → union-find on shared intersections
    ≥3 connected → write clusterSize to feature-state
  Triggers cyan cluster-halo layer
```

---

## 7. Build & Deploy

### 7.1 Local build

```bash
npm run build
```

Runs `tsc -b && vite build` — first a TypeScript type-check, then a Vite production bundle into `dist/`.

Output is ~2.2 MB of JS (~620 KB gzipped) as a single bundle. Can be hosted as static files — **no Node server required**.

### 7.2 Auto-deploy (recommended)

The repo has GitHub Actions configured ([deploy.yml](.github/workflows/deploy.yml)):

```
push to main branch
  ↓
GitHub Actions triggered
  ↓
checkout → install Node 18 → npm install
  ↓
npm run build (with 4 secrets injected as env vars)
  ↓
upload dist/ as GitHub Pages artifact → deploy
```

**Prerequisites:** GitHub Pages enabled in repo Settings → Pages (source: GitHub Actions), and the 4 secrets from §3.4 configured.

### 7.3 Other deployment platforms

[DEPLOYMENT.md](DEPLOYMENT.md) covers Vercel / Netlify / Docker / self-hosted Nginx.

The only thing to remember: **on every platform, configure all 5 `VITE_*` env vars in the platform's dashboard** — you cannot rely on `.env` files (those are only read at build time).

---

## 8. Troubleshooting

### 8.1 `npm install` hangs

Usually a network issue — retry, switch to a different npm registry mirror, or check your proxy. A clean reinstall often helps:
```bash
rm -rf node_modules package-lock.json
npm install
```

### 8.2 TypeScript reports `Cannot find module ...`

In VS Code, click the language indicator at the bottom-right → "Use Workspace Version" so the IDE uses the project's bundled TypeScript.

### 8.3 Map crashes a few seconds after loading

Most likely the Mapbox token has expired or been revoked. Check at https://account.mapbox.com/access-tokens/.

### 8.4 Street-score layer stays gray forever

Check in this order:
1. Console showing `Missing Supabase env vars`? → check `.env`
2. In Network tab, what do supabase.co RPC requests return? 401 = wrong key, 404 = RPC function does not exist, 500 = SQL error
3. Zoom in to ≥14 (street layer is hidden at low zoom)

### 8.5 GitHub Actions deployment fails

Most often missing a secret. Logs will say `VITE_MAPBOX_TOKEN is not defined`. After adding it, re-run the workflow.

### 8.6 Production loads slowly

GitHub Pages CDN performance varies by region. If latency matters for your users, host on Vercel or Netlify for a more global CDN footprint.

---

## 9. Common Development Patterns

### 9.1 Add a new live modifier

E.g., to add an "air quality" modifier:

1. In [src/lib/](src/lib/), create `airquality.ts` with `fetchAirQuality()` and `getAirQualityModifier()`
2. In [MapPage.tsx](src/pages/MapPage.tsx), load it and pass to MapComponent
3. In [fsiScores.ts](src/lib/fsiScores.ts), add an `airMod` parameter to `computeCompositeTotal()`
4. In [MapComponent.tsx](src/components/MapComponent.tsx), pass it to `applyScores()`'s call site
5. In [StreetScorePanel.tsx](src/components/StreetScorePanel.tsx), add it to the factor list

### 9.2 Add a new map overlay layer

Reference the existing `street-veto-blocked` or `street-cluster-outline` layer:
1. Add `map.current.addLayer({...})` in MapComponent's layer init section
2. Add the new layer ID to the visibility-toggle array
3. Add a `setFilter` call in the closeable-only filter section
4. If feature-state-driven styling is needed, define the corresponding `['feature-state', 'xxx']` expression constant

### 9.3 Tweak scoring parameters

Edit the constants at the top of [src/lib/fsiScores.ts](src/lib/fsiScores.ts):
- `CORRIDOR_WIDTH_M` — corridor width per dimension
- `DECAY_PERP_M` — distance decay coefficient
- `SATURATION` — sigmoid saturation parameter
- `PROMINENCE_BONUS` — neighborhood prominence bonus cap

After tweaking, run `logCalibration()` in the browser console to verify Playstreets positives still land in the ≥75 range.

### 9.4 Modify a Supabase RPC

Do **not** change RPC function signatures — the frontend hardcodes the parameter names. If you must:
1. Rewrite the RPC in Supabase SQL Editor first
2. Update corresponding `supabase.rpc(...)` calls in [MapComponent.tsx](src/components/MapComponent.tsx) and [MapPage.tsx](src/pages/MapPage.tsx) accordingly

---

## 10. Reports & Further Reading

| Resource | Description |
|---|---|
| [reports/final-report.pdf](reports/final-report.pdf) | **Project final report (Chinese)** — background, purpose, methods, conclusions, future work |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Multi-platform deploy details (Vercel/Netlify/Docker) |
| [Mapbox GL JS docs](https://docs.mapbox.com/mapbox-gl-js/api/) | Map engine API |
| [Supabase docs](https://supabase.com/docs) | Backend |
| [Vite docs](https://vitejs.dev/) | Build tool |

---

## 11. Post-Deployment Checklist

After working through the previous sections, use this checklist to confirm everything is in place:

**API key preparation**
- [ ] Mapbox token obtained from https://account.mapbox.com
- [ ] Google Street View Static API enabled and key obtained
- [ ] Ticketmaster developer account registered and key obtained

**Supabase backend**
- [ ] Your own Supabase project created
- [ ] `CREATE EXTENSION postgis` executed
- [ ] `flexible-street-backup.sql` imported without errors
- [ ] Project URL and anon key copied

**Local config**
- [ ] `.env` file created with all 5 variables filled in
- [ ] `npm install` succeeded
- [ ] `npm run dev` starts the dev server normally

**Functional verification**
- [ ] Browser at http://localhost:5173 shows the landing page
- [ ] Navigating to `/map` loads the Philadelphia map
- [ ] Toggling "Flexibility Score" colors the streets
- [ ] Clicking a street opens the detail panel
- [ ] Detail panel shows commercial / community sub-scores
- [ ] Some streets show emergency-access veto (magenta)
- [ ] Some streets show closure-cluster halo (cyan)

**Production build**
- [ ] `npm run build` succeeds and `dist/` is generated

**GitHub Pages auto-deploy (if used)**
- [ ] GitHub repo Settings → Pages: source set to "GitHub Actions"
- [ ] Settings → Secrets: all required keys configured

**Project understanding**
- [ ] Skimmed [reports/final-report.pdf](reports/final-report.pdf) for background and design rationale
- [ ] Read the header comment of [src/lib/fsiScores.ts](src/lib/fsiScores.ts) to understand the FSI algorithm

---

## License

MIT License
