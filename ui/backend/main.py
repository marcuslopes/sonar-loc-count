"""FastAPI application entry-point for the LoC analysis dashboard."""

from __future__ import annotations

import asyncio
import logging
import uuid
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from azure_client import list_projects, list_repositories, list_branches
from cloc_runner import build_clone_url, run_cloc, SONAR_LANG_DEFS
from models import (
    BranchResult,
    LanguageStats,
    ProjectResult,
    RepoResult,
    ScanStatus,
    ScanSummary,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="LoC Dashboard API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory scan store: scan_id -> ScanStatus
_scans: dict[str, ScanStatus] = {}


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------

@app.get("/health")
async def health() -> dict[str, str]:
    """Liveness probe used by Docker Compose healthcheck."""
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Scan request model
# ---------------------------------------------------------------------------

class ScanRequest(BaseModel):
    org: str
    token: str
    project_filter: str | None = None  # optional single-project filter


# ---------------------------------------------------------------------------
# POST /api/scan  — start a background scan
# ---------------------------------------------------------------------------

@app.post("/api/scan")
async def start_scan(req: ScanRequest) -> dict[str, str]:
    scan_id = str(uuid.uuid4())
    status = ScanStatus(
        scan_id=scan_id,
        status="running",
        progress_pct=0.0,
    )
    _scans[scan_id] = status
    asyncio.create_task(_run_scan(scan_id, req))
    return {"scan_id": scan_id}


# ---------------------------------------------------------------------------
# GET /api/scan/{scan_id}  — poll scan status + results
# ---------------------------------------------------------------------------

@app.get("/api/scan/{scan_id}", response_model=ScanStatus)
async def get_scan(scan_id: str) -> ScanStatus:
    if scan_id not in _scans:
        raise HTTPException(status_code=404, detail="Scan not found")
    return _scans[scan_id]


# ---------------------------------------------------------------------------
# Background scan worker
# ---------------------------------------------------------------------------

async def _run_scan(scan_id: str, req: ScanRequest) -> None:
    scan = _scans[scan_id]
    sonar_defs = str(SONAR_LANG_DEFS)

    try:
        projects_raw = await list_projects(req.org, req.token)
        if req.project_filter:
            projects_raw = [
                p for p in projects_raw if p["name"] == req.project_filter
            ]

        total_projects = len(projects_raw)
        project_results: list[ProjectResult] = []
        language_totals: dict[str, int] = {}
        total_repos_scanned = 0

        for proj_idx, project in enumerate(projects_raw):
            proj_name: str = project["name"]
            repos_raw = await list_repositories(req.org, proj_name, req.token)
            repo_results: list[RepoResult] = []

            for repo in repos_raw:
                repo_name: str = repo["name"]
                repo_id: str = repo["id"]
                branches = await list_branches(req.org, proj_name, repo_id, req.token)

                branch_results: list[BranchResult] = []
                for branch in branches:
                    clone_url = build_clone_url(req.org, proj_name, repo_name, req.token)
                    result = await run_cloc(clone_url, branch, req.token, sonar_defs)
                    branch_results.append(
                        BranchResult(
                            name=branch,
                            loc=result["loc"],
                            languages=result["languages"],
                        )
                    )

                if branch_results:
                    best = max(branch_results, key=lambda b: b.loc)
                    repo_results.append(
                        RepoResult(
                            name=repo_name,
                            project=proj_name,
                            branches=branch_results,
                            max_loc=best.loc,
                            max_branch=best.name,
                        )
                    )
                    for lang_stat in best.languages:
                        language_totals[lang_stat.language] = (
                            language_totals.get(lang_stat.language, 0) + lang_stat.code
                        )

                total_repos_scanned += 1

            proj_total_loc = sum(r.max_loc for r in repo_results)
            project_results.append(
                ProjectResult(
                    name=proj_name,
                    repos=repo_results,
                    total_loc=proj_total_loc,
                )
            )

            scan.progress_pct = round((proj_idx + 1) / max(total_projects, 1) * 100, 1)
            _scans[scan_id] = scan

        all_repos: list[RepoResult] = [
            r for p in project_results for r in p.repos
        ]
        top_repos = sorted(all_repos, key=lambda r: r.max_loc, reverse=True)[:20]

        summary = ScanSummary(
            org=req.org,
            total_loc=sum(p.total_loc for p in project_results),
            project_count=total_projects,
            repo_count=total_repos_scanned,
            language_totals=language_totals,
            projects=project_results,
            top_repos=top_repos,
        )

        scan.status = "done"
        scan.progress_pct = 100.0
        scan.summary = summary
        _scans[scan_id] = scan

    except Exception as exc:  # noqa: BLE001
        logger.exception("Scan %s failed: %s", scan_id, exc)
        scan.status = "error"
        scan.error = str(exc)
        _scans[scan_id] = scan
