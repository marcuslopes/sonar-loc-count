# Plan: DevOps LoC Stats Dashboard UI

## Goal

Build a web dashboard that connects to Azure DevOps, runs LoC analysis (using the
same logic as `azure_devops_services.sh`), and presents the results as compelling
charts designed to convince a manager to purchase additional SonarQube LoC licenses.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser (UI)                          │
│   React + Recharts + TailwindCSS                            │
│   - Config form (PAT, org, optional project filter)         │
│   - Live scan progress feed                                  │
│   - Dashboard: charts, tables, export button                │
└─────────────────────────┬───────────────────────────────────┘
                           │ HTTP/REST
┌─────────────────────────▼───────────────────────────────────┐
│                    Python FastAPI Backend                     │
│   /api/scan        - triggers full scan                      │
│   /api/scan/{id}   - SSE stream for live progress           │
│   /api/results     - returns JSON results                    │
│   /api/export      - generates PDF/CSV export               │
└───────────────┬─────────────────────────────────────────────┘
                │  Azure DevOps REST API v7.0
                │  + local cloc binary
┌───────────────▼─────────────────────────────────────────────┐
│   azure_devops_client.py                                     │
│   - Lists projects, repositories, branches                   │
│   - Clones repos (shallow) and runs cloc                    │
│   - Mirrors logic of azure_devops_services.sh in Python     │
└─────────────────────────────────────────────────────────────┘
```

**Tech Stack**
- **Backend**: Python 3.11+, FastAPI, httpx, asyncio, subprocess (cloc)
- **Frontend**: React 18, Vite, Recharts, TailwindCSS, shadcn/ui components
- **Reports**: ReportLab (PDF), csv (stdlib)
- **Packaging**: Docker Compose (one command startup)

Rationale: FastAPI gives async streaming for live progress; Recharts gives rich,
interactive charts with zero configuration headaches; Tailwind + shadcn gives a
polished, professional look.

---

## File / Directory Layout

```
sonar-loc-count/
├── (existing shell scripts, unchanged)
├── ui/
│   ├── backend/
│   │   ├── main.py               # FastAPI app + all routes
│   │   ├── azure_client.py       # Azure DevOps API wrapper
│   │   ├── cloc_runner.py        # cloc subprocess wrapper
│   │   ├── models.py             # Pydantic data models
│   │   ├── requirements.txt
│   │   └── Dockerfile
│   └── frontend/
│       ├── src/
│       │   ├── App.tsx
│       │   ├── pages/
│       │   │   ├── ConfigPage.tsx    # PAT + org input form
│       │   │   ├── ScanPage.tsx      # Live progress feed
│       │   │   └── DashboardPage.tsx # All charts & tables
│       │   ├── components/
│       │   │   ├── LanguageBreakdownChart.tsx  (pie/donut)
│       │   │   ├── ProjectComparisonChart.tsx  (bar)
│       │   │   ├── LicenseGapCard.tsx          (KPI card)
│       │   │   ├── TopProjectsTable.tsx
│       │   │   └── ExportButton.tsx
│       │   └── lib/api.ts           # typed fetch wrappers
│       ├── package.json
│       ├── vite.config.ts
│       └── Dockerfile
└── docker-compose.yml
```

---

## Implementation Steps

### Step 1 — Backend: Azure DevOps Client (`azure_client.py`)

Port the shell script logic to Python:

1. `list_projects(org, token)` → calls `GET /_apis/projects?api-version=7.0`
2. `list_repositories(org, project, token)` → `GET /{project}/_apis/git/repositories`
3. `list_branches(org, project, repo_id, token)` → `GET /refs?filter=heads/`
4. All calls via `httpx.AsyncClient` with Basic auth (`:token`)
5. Handle pagination (`continuationToken` header from Azure DevOps)

### Step 2 — Backend: cloc Runner (`cloc_runner.py`)

Mirror the shell script's cloc invocation:

1. `git clone --depth 1 --branch <branch> <url>` into a temp directory
2. Run: `cloc <dir> --force-lang-def=sonar-lang-defs.txt --ignore-case-ext --json --sum-one`
3. Parse JSON output → returns `{ language: { code, comment, blank } }` per branch
4. Clean up temp directory
5. Extract `SUM.code` as the LoC count for that branch

The `--json` flag on cloc gives structured output, eliminating the text-parsing the
shell script needs.

### Step 3 — Backend: Scan Orchestration (`main.py`)

```
POST /api/scan  { token, org, project? }
  → creates scan_id, starts background task
  → returns { scan_id }

GET /api/scan/{scan_id}/stream
  → SSE stream of progress events:
     { type: "project", name, total_repos }
     { type: "repo", project, repo, branch, loc, languages }
     { type: "done", summary }

GET /api/results/{scan_id}
  → full JSON results (cached in memory / temp file)

GET /api/export/{scan_id}?format=pdf|csv
  → streams the file download
```

Background task walks: projects → repos → branches, yielding SSE events after each
branch is analysed. This gives the UI a live "scanning…" experience.

### Step 4 — Data Models (`models.py`)

```python
class BranchResult:
    name: str
    loc: int
    languages: dict[str, int]  # language → LoC

class RepoResult:
    name: str
    project: str
    branches: list[BranchResult]
    max_loc: int          # highest across all branches
    max_branch: str

class ScanSummary:
    org: str
    total_loc: int        # sum of max_loc across all repos
    projects: list[ProjectResult]
    language_totals: dict[str, int]
    top_repos: list[RepoResult]   # sorted by max_loc desc
```

### Step 5 — Frontend: Config Page

Simple form:
- Azure DevOps Organisation name (text input)
- Personal Access Token (password input, never stored)
- Optional: filter to a single project
- "Start Scan" button → POST to backend, redirect to Scan page

### Step 6 — Frontend: Scan Progress Page

- Connect to SSE stream (`/api/scan/{id}/stream`)
- Animated spinner + live log: "Analysing repo X / branch Y… (N LoC)"
- Progress bar based on project count
- Auto-redirect to Dashboard when `done` event received

### Step 7 — Frontend: Dashboard Page (the key deliverable)

**Layout: executive-style dashboard (printable)**

```
┌─────────────────────────────────────────────────────────────┐
│  [Logo]   Azure DevOps LoC Analysis — {Org}   [Export PDF] │
├──────────────┬──────────────┬──────────────┬───────────────┤
│ Total LoC    │  Repos       │  Languages   │  Licence Gap  │
│  1,234,567   │    42        │    18        │   +234,567 ⚠  │
├──────────────┴──────────────┴──────────────┴───────────────┤
│                                                             │
│  [Bar Chart: Top 15 Repos by LoC]                          │
│                                                             │
├────────────────────────┬────────────────────────────────────┤
│  [Donut: LoC by Lang]  │  [Donut: LoC by Project]          │
├────────────────────────┴────────────────────────────────────┤
│  [Stacked Bar: LoC per Project, stacked by language]       │
├─────────────────────────────────────────────────────────────┤
│  [Table: All repos — Project / Repo / Max LoC / Branch /   │
│   Top Language — sortable, filterable]                     │
└─────────────────────────────────────────────────────────────┘
```

**The "Licence Gap" KPI card** is the centrepiece for the manager pitch:
- Input field: "Current SonarQube licence (LoC)"
- Card shows: total LoC found vs licence, delta in red if over
- Example: "You need **1,234,567 LoC** — your licence covers **500,000**.
  You are **+734,567 LoC short** (covering only 40% of your codebase)."

### Step 8 — Export

**PDF** (via ReportLab or WeasyPrint):
- Title page with org name + date
- Executive summary (KPI cards)
- Bar chart of top repos as embedded image
- Language breakdown table
- Full repo list table
- Footer: "Generated by sonar-loc-count"

**CSV**:
- One row per repo: Project, Repository, Max LoC, Best Branch, Language Breakdown

### Step 9 — Docker Compose

```yaml
services:
  backend:
    build: ./ui/backend
    ports: ["8000:8000"]
    volumes:
      - ./sonar-lang-defs.txt:/app/sonar-lang-defs.txt
      - /tmp/scans:/tmp/scans

  frontend:
    build: ./ui/frontend
    ports: ["3000:3000"]
    environment:
      VITE_API_URL: http://localhost:8000
```

One command: `docker compose up` → open http://localhost:3000

---

## Visual Design Notes

- **Colour palette**: SonarQube-inspired dark blues (#1A2B3C) with accent orange
  (#F7941D) for the warning/gap card
- **Font**: Inter (system-safe, professional)
- **Charts**: All interactive (hover tooltips showing exact numbers)
- **Print CSS**: Dashboard collapses to single-column, charts render at full width
  for easy screenshot/print to PDF

---

## Manager Pitch Framing (built into the UI copy)

The dashboard uses language designed to support a budget conversation:

- "**Unanalysed LoC**" instead of "LoC over licence"
- "**Code at risk**" framing for repos not covered
- Percentage of codebase currently covered vs uncovered
- Cost-per-LoC comparison field (optional): enter current licence price and it
  calculates the per-unit cost to show incremental licencing is cost-efficient

---

## Dependencies Summary

**Backend (`requirements.txt`)**
```
fastapi>=0.111
uvicorn[standard]>=0.29
httpx>=0.27
pydantic>=2.7
reportlab>=4.2
sse-starlette>=2.1
```

**Frontend (`package.json` deps)**
```
react@18, react-dom@18
recharts@2
@tanstack/react-table@8   (sortable table)
tailwindcss@3
shadcn/ui (card, button, input, progress components)
vite@5
typescript@5
```

**System (inside Docker)**
- git
- cloc v1.96 (installed via apt/apk)

---

## Estimated Deliverables

1. `ui/backend/` — fully working FastAPI service
2. `ui/frontend/` — React dashboard
3. `docker-compose.yml` — one-command launch
4. `sonar-lang-defs.txt` already present in repo root (reused by backend)
