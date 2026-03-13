# Azure DevOps LoC Dashboard

## What it does

The Azure DevOps LoC Dashboard connects to your Azure DevOps organisation, shallow-clones every repository across every project, and counts lines of code using the same Sonar language definitions as SonarQube. It presents the results as interactive charts and tables designed to make the case for purchasing additional SonarQube LoC licences. When the scan is complete you can export a one-page PDF summary for your manager.

---

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or Docker Engine + Compose v2)
- An Azure DevOps **Personal Access Token** with the **Code > Read** scope.
  See [Create a PAT – Azure DevOps docs](https://learn.microsoft.com/en-us/azure/devops/organizations/accounts/use-personal-access-tokens-to-authenticate) for full instructions.

---

## Quick Start

```bash
git clone https://github.com/your-org/sonar-loc-count.git
cd sonar-loc-count
docker compose up --build
```

Open **http://localhost:3000** in your browser.

> The first build takes 2-3 minutes while Docker pulls base images and installs dependencies. Subsequent starts are instant.

---

## Usage

<!-- Screenshot placeholder: replace with an actual screenshot of the dashboard -->
![Dashboard screenshot](../cloc.png)

1. **Enter your Azure DevOps organisation name** (the slug that appears in `https://dev.azure.com/{org}`).
2. **Paste your PAT** into the token field. The token is sent only to the local backend; it is never stored or transmitted to any third party.
3. Optionally enter a **project name** to limit the scan to a single project (useful for a quick test run).
4. Click **Start Scan** and watch the live progress bar as each project is processed.
5. Once the scan finishes, the **Dashboard** view loads automatically with:
   - Total LoC across your entire organisation
   - Language breakdown donut chart
   - Project-by-project bar chart
   - Sortable table of top repositories
6. Click **Export PDF** to download a one-page summary you can attach to a licence request or share with your manager.

---

## The Licence Gap Card

On the dashboard you will see a **Licence Gap** card. Enter the LoC limit of your current SonarQube licence in the input field and the card instantly calculates:

- **Used**: total LoC detected across all repositories
- **Licence**: your current limit
- **Gap**: how many additional LoC you need to cover your codebase

This gives you a precise, defensible number to quote when requesting a licence upgrade — no guesswork required.

---

## Azure DevOps PAT Setup

1. Sign in to **https://dev.azure.com/{your-org}**.
2. Click your avatar in the top-right corner and select **Personal access tokens**.
3. Click **+ New Token**.
4. Give the token a name (e.g. `sonar-loc-scan`).
5. Set the **Expiration** to a suitable date (30 days is usually enough for a one-off scan).
6. Under **Scopes**, select **Custom defined**, then tick **Code → Read**.
7. Click **Create** and copy the token — you will not be able to see it again.

---

## Running without Docker

Useful for local development or when iterating on the backend or frontend independently.

### Backend

```bash
cd ui/backend

# Create and activate a virtual environment
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run the development server (auto-reload on file changes)
uvicorn main:app --reload --port 8000
```

The API is now available at **http://localhost:8000**. Interactive docs are at **http://localhost:8000/docs**.

### Frontend

```bash
cd ui/frontend

npm install
npm run dev
```

The dev server starts at **http://localhost:5173** and proxies `/api/*` requests to `http://backend:8000` as configured in `vite.config.ts`. Change the proxy target to `http://localhost:8000` if running the backend locally outside of Docker.

---

## Architecture

| Component | Description |
|-----------|-------------|
| `ui/frontend/` | React 18 SPA (Vite + TypeScript + Tailwind + Recharts) — config form, live progress view, and interactive dashboard |
| `ui/backend/` | FastAPI (Python 3.11) — orchestrates Azure DevOps API calls, triggers `cloc` subprocess per branch, and streams progress to the frontend |
| `ui/backend/azure_client.py` | Async Azure DevOps REST API v7 wrapper with pagination support |
| `ui/backend/cloc_runner.py` | Shallow-clones a git branch into a temp directory and runs `cloc` with Sonar language definitions |
| `ui/backend/models.py` | Pydantic v2 data models shared across the API surface |
| `sonar-lang-defs.txt` | Sonar language definition file (mounted read-only into the backend container) so `cloc` counts languages the same way SonarQube does |
| `docker-compose.yml` | Single-command orchestration: builds both images, wires the healthcheck dependency, and mounts the language definitions file |
