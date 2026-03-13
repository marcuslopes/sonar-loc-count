"""
FastAPI backend for the Azure DevOps LoC analysis dashboard.

Endpoints
---------
POST  /api/scan                  — start a new scan, returns scan_id
GET   /api/scan/{scan_id}/stream — SSE stream of live progress events
GET   /api/results/{scan_id}     — fetch completed ScanSummary as JSON
GET   /api/export/{scan_id}      — download results as CSV or PDF
GET   /health                    — liveness probe
"""

from __future__ import annotations

import asyncio
import csv
import io
import json
import logging
import uuid
from collections import defaultdict
from typing import Any, AsyncIterator

from fastapi import BackgroundTasks, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from sse_starlette.sse import EventSourceResponse

import azure_client
import cloc_runner
from models import (
    BranchResult,
    ProjectResult,
    RepoResult,
    ScanSummary,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="LoC Analysis Dashboard", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# In-memory state shared between background tasks and SSE handlers
# ---------------------------------------------------------------------------

# Completed scan summaries keyed by scan_id
scans: dict[str, ScanSummary] = {}

# Per-scan event queues; background task puts events, SSE handler reads them.
# A None sentinel signals the end of the stream.
scan_queues: dict[str, asyncio.Queue[dict[str, Any] | None]] = {}

# Track which scan_ids are currently running
running_scans: set[str] = set()

# ---------------------------------------------------------------------------
# Request schema
# ---------------------------------------------------------------------------


class ScanRequest(BaseModel):
    token: str
    org: str
    project: str | None = None  # if None, scan all projects in the org


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------


@app.get("/health")
async def health() -> dict[str, str]:
    """Liveness probe used by Docker Compose / load-balancer healthchecks."""
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Background scan worker
# ---------------------------------------------------------------------------


async def _run_scan(
    scan_id: str, token: str, org: str, project_filter: str | None
) -> None:
    """
    Full scan pipeline: enumerate projects → repos → branches → cloc.

    Progress events are put onto ``scan_queues[scan_id]``.
    A ``None`` sentinel is always pushed last so SSE generators can close.
    """
    queue: asyncio.Queue[dict[str, Any] | None] = scan_queues[scan_id]

    async def emit(event: dict[str, Any]) -> None:
        await queue.put(event)

    try:
        running_scans.add(scan_id)

        # ------------------------------------------------------------------ #
        # 1. Enumerate projects
        # ------------------------------------------------------------------ #
        await emit({"type": "progress", "message": "Fetching projects…", "pct": 0.0})

        if project_filter:
            # Fetch all and narrow down so the API call is consistent
            all_projects = await azure_client.list_projects(org, token)
            projects = [
                p
                for p in all_projects
                if p["name"].lower() == project_filter.lower()
            ]
            if not projects:
                raise ValueError(
                    f"Project '{project_filter}' not found in org '{org}'"
                )
        else:
            projects = await azure_client.list_projects(org, token)

        total_projects = len(projects)
        await emit(
            {
                "type": "progress",
                "message": f"Found {total_projects} project(s)",
                "pct": 2.0,
            }
        )

        # ------------------------------------------------------------------ #
        # 2. Pre-fetch repository lists to know total work units
        # ------------------------------------------------------------------ #
        project_repos: dict[str, list[dict[str, Any]]] = {}
        for proj in projects:
            repos = await azure_client.list_repositories(org, proj["name"], token)
            project_repos[proj["name"]] = repos

        total_repos = sum(len(r) for r in project_repos.values())
        await emit(
            {
                "type": "progress",
                "message": (
                    f"Found {total_repos} repository(s) across "
                    f"{total_projects} project(s)"
                ),
                "pct": 5.0,
            }
        )

        # ------------------------------------------------------------------ #
        # 3. Process each repo: enumerate branches → clone → cloc
        # ------------------------------------------------------------------ #
        sonar_defs = str(cloc_runner.SONAR_LANG_DEFS)
        processed_repos = 0
        project_results: list[ProjectResult] = []
        language_totals: defaultdict[str, int] = defaultdict(int)
        all_repo_results: list[RepoResult] = []

        for proj in projects:
            proj_name = proj["name"]
            repos = project_repos[proj_name]
            repo_results: list[RepoResult] = []

            for repo in repos:
                repo_name: str = repo["name"]
                repo_id: str = repo["id"]

                # --- Branches ---
                try:
                    branches = await azure_client.list_branches(
                        org, proj_name, repo_id, token
                    )
                except Exception as exc:  # noqa: BLE001
                    logger.warning(
                        "Could not list branches for repo '%s/%s': %s",
                        proj_name,
                        repo_name,
                        exc,
                    )
                    branches = []

                processed_repos += 1
                pct = 5.0 + (processed_repos / max(total_repos, 1)) * 90.0

                if not branches:
                    repo_results.append(
                        RepoResult(
                            name=repo_name,
                            project=proj_name,
                            branches=[],
                            max_loc=0,
                            max_branch="",
                        )
                    )
                    await emit(
                        {
                            "type": "repo_done",
                            "project": proj_name,
                            "repo": repo_name,
                            "max_loc": 0,
                        }
                    )
                    await emit(
                        {
                            "type": "progress",
                            "message": f"[{proj_name}] {repo_name} — no accessible branches",
                            "pct": round(pct, 1),
                        }
                    )
                    continue

                # --- Run cloc on each branch ---
                clone_url = cloc_runner.build_clone_url(
                    org, proj_name, repo_name, token
                )
                branch_results: list[BranchResult] = []

                for branch in branches:
                    result = await cloc_runner.run_cloc(
                        clone_url=clone_url,
                        branch=branch,
                        token=token,
                        sonar_lang_defs=sonar_defs,
                    )
                    branch_results.append(
                        BranchResult(
                            name=branch,
                            loc=result["loc"],
                            languages=result["languages"],
                        )
                    )

                best_branch = max(branch_results, key=lambda b: b.loc, default=None)
                max_loc = best_branch.loc if best_branch else 0
                max_branch_name = best_branch.name if best_branch else ""

                # Accumulate language totals from the highest-LoC branch only
                if best_branch:
                    for lang_stat in best_branch.languages:
                        language_totals[lang_stat.language] += lang_stat.code

                repo_result = RepoResult(
                    name=repo_name,
                    project=proj_name,
                    branches=branch_results,
                    max_loc=max_loc,
                    max_branch=max_branch_name,
                )
                repo_results.append(repo_result)
                all_repo_results.append(repo_result)

                await emit(
                    {
                        "type": "repo_done",
                        "project": proj_name,
                        "repo": repo_name,
                        "max_loc": max_loc,
                    }
                )
                await emit(
                    {
                        "type": "progress",
                        "message": (
                            f"[{proj_name}] {repo_name} — "
                            f"best branch: {max_branch_name} ({max_loc:,} LoC)"
                        ),
                        "pct": round(pct, 1),
                    }
                )

            project_total = sum(r.max_loc for r in repo_results)
            project_results.append(
                ProjectResult(
                    name=proj_name,
                    repos=repo_results,
                    total_loc=project_total,
                )
            )

        # ------------------------------------------------------------------ #
        # 4. Build and store the final summary
        # ------------------------------------------------------------------ #
        total_loc = sum(p.total_loc for p in project_results)
        top_repos = sorted(
            all_repo_results, key=lambda r: r.max_loc, reverse=True
        )[:20]

        summary = ScanSummary(
            org=org,
            total_loc=total_loc,
            project_count=len(project_results),
            repo_count=total_repos,
            language_totals=dict(language_totals),
            projects=project_results,
            top_repos=top_repos,
        )
        scans[scan_id] = summary

        await emit({"type": "progress", "message": "Scan complete", "pct": 100.0})
        await emit({"type": "done", "summary": summary.model_dump()})

    except Exception as exc:  # noqa: BLE001
        logger.exception("Scan %s failed: %s", scan_id, exc)
        await emit({"type": "error", "message": str(exc)})
    finally:
        running_scans.discard(scan_id)
        # Always push the sentinel so SSE generators exit cleanly
        await queue.put(None)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@app.post("/api/scan", status_code=202)
async def start_scan(
    request: ScanRequest,
    background_tasks: BackgroundTasks,
) -> dict[str, str]:
    """
    Start a new LoC scan and return a ``scan_id`` immediately.

    The scan runs in the background.  Track progress via
    ``GET /api/scan/{scan_id}/stream`` (SSE) or poll
    ``GET /api/results/{scan_id}``.
    """
    scan_id = str(uuid.uuid4())
    scan_queues[scan_id] = asyncio.Queue()

    background_tasks.add_task(
        _run_scan, scan_id, request.token, request.org, request.project
    )
    logger.info("Started scan %s for org '%s'", scan_id, request.org)
    return {"scan_id": scan_id}


@app.get("/api/scan/{scan_id}/stream")
async def stream_scan(scan_id: str) -> EventSourceResponse:
    """
    Server-Sent Events stream for a running scan.

    Emitted event types
    -------------------
    ``progress``  — periodic update with ``message`` (str) and ``pct`` (float)
    ``repo_done`` — a repo was processed; carries ``project``, ``repo``, ``max_loc``
    ``done``      — scan finished; carries full ``summary`` dict
    ``error``     — fatal error; carries ``message`` (str)

    The stream closes automatically once the scan ends.
    If the scan already finished, a synthetic ``done`` event is sent immediately.
    """
    if scan_id not in scan_queues and scan_id not in scans:
        raise HTTPException(status_code=404, detail="Scan not found")

    # If the scan already completed before the client connected, replay instantly
    if scan_id in scans and scan_id not in running_scans:
        async def _replay() -> AsyncIterator[dict[str, Any]]:
            summary = scans[scan_id]
            yield {
                "event": "message",
                "data": json.dumps(
                    {
                        "type": "progress",
                        "message": "Scan already complete",
                        "pct": 100.0,
                    }
                ),
            }
            yield {
                "event": "message",
                "data": json.dumps(
                    {"type": "done", "summary": summary.model_dump()}
                ),
            }

        return EventSourceResponse(_replay())

    queue = scan_queues[scan_id]

    async def _event_generator() -> AsyncIterator[dict[str, Any]]:
        while True:
            event = await queue.get()
            if event is None:
                # Sentinel — background task finished
                break
            yield {"event": "message", "data": json.dumps(event)}

    return EventSourceResponse(_event_generator())


@app.get("/api/results/{scan_id}", response_model=ScanSummary)
async def get_results(scan_id: str) -> ScanSummary:
    """
    Return the completed ``ScanSummary`` for a finished scan.

    HTTP status
    -----------
    200  — scan is complete; body is the full summary
    202  — scan is still running
    404  — unknown scan_id
    """
    if scan_id not in scans and scan_id not in scan_queues:
        raise HTTPException(status_code=404, detail="Scan not found")
    if scan_id not in scans:
        raise HTTPException(status_code=202, detail="Scan still running")
    return scans[scan_id]


@app.get("/api/export/{scan_id}")
async def export_results(
    scan_id: str,
    format: str = Query("csv", pattern="^(csv|pdf)$"),
) -> StreamingResponse:
    """
    Download scan results as a file.

    Query parameters
    ----------------
    ``format`` — ``csv`` (default) or ``pdf``

    CSV columns: Project, Repository, Max LoC, Best Branch, Top Language
    PDF: summary statistics table + top-20 repos table
    """
    if scan_id not in scans:
        if scan_id in scan_queues:
            raise HTTPException(status_code=202, detail="Scan still running")
        raise HTTPException(status_code=404, detail="Scan not found")

    summary = scans[scan_id]
    return _export_csv(summary) if format == "csv" else _export_pdf(summary)


# ---------------------------------------------------------------------------
# Export helpers
# ---------------------------------------------------------------------------


def _top_language(repo: RepoResult) -> str:
    """
    Return the name of the top language in the repo's best branch.

    Languages are already sorted descending by cloc_runner, so the first
    entry is the highest-LoC language.
    """
    best = next(
        (b for b in repo.branches if b.name == repo.max_branch),
        None,
    )
    if best and best.languages:
        return best.languages[0].language
    return "N/A"


def _export_csv(summary: ScanSummary) -> StreamingResponse:
    """Build an in-memory CSV and return it as a downloadable response."""
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(
        ["Project", "Repository", "Max LoC", "Best Branch", "Top Language"]
    )

    for project in summary.projects:
        for repo in project.repos:
            writer.writerow(
                [
                    project.name,
                    repo.name,
                    repo.max_loc,
                    repo.max_branch,
                    _top_language(repo),
                ]
            )

    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={
            "Content-Disposition": (
                f'attachment; filename="loc-scan-{summary.org}.csv"'
            )
        },
    )


def _export_pdf(summary: ScanSummary) -> StreamingResponse:
    """Build an in-memory PDF using ReportLab and return it as a downloadable response."""
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=landscape(A4),
        leftMargin=1.5 * cm,
        rightMargin=1.5 * cm,
        topMargin=1.5 * cm,
        bottomMargin=1.5 * cm,
    )
    styles = getSampleStyleSheet()
    story: list[Any] = []

    # --- Title ---
    story.append(
        Paragraph(f"Lines of Code Analysis — {summary.org}", styles["Title"])
    )
    story.append(Spacer(1, 0.4 * cm))

    # --- Summary table ---
    top_langs = sorted(
        summary.language_totals.items(), key=lambda x: x[1], reverse=True
    )[:5]
    summary_rows: list[list[str]] = [
        ["Organisation", summary.org],
        ["Total LoC", f"{summary.total_loc:,}"],
        ["Projects", str(summary.project_count)],
        ["Repositories", str(summary.repo_count)],
    ]
    for lang, loc in top_langs:
        summary_rows.append([f"  {lang} (LoC)", f"{loc:,}"])

    summary_table = Table(summary_rows, colWidths=[6 * cm, 8 * cm])
    summary_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#003865")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                (
                    "ROWBACKGROUNDS",
                    (0, 1),
                    (-1, -1),
                    [colors.white, colors.HexColor("#f0f4f8")],
                ),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cccccc")),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    story.append(summary_table)
    story.append(Spacer(1, 0.6 * cm))

    # --- Top repos table ---
    story.append(Paragraph("Top Repositories by LoC", styles["Heading2"]))
    story.append(Spacer(1, 0.3 * cm))

    repo_header = ["Project", "Repository", "Max LoC", "Best Branch", "Top Language"]
    repo_rows: list[list[str]] = [repo_header]
    for repo in summary.top_repos:
        repo_rows.append(
            [
                repo.project,
                repo.name,
                f"{repo.max_loc:,}",
                repo.max_branch,
                _top_language(repo),
            ]
        )

    col_widths = [5 * cm, 6 * cm, 3 * cm, 5 * cm, 4 * cm]
    repo_table = Table(repo_rows, colWidths=col_widths, repeatRows=1)
    repo_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#003865")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                (
                    "ROWBACKGROUNDS",
                    (0, 1),
                    (-1, -1),
                    [colors.white, colors.HexColor("#f0f4f8")],
                ),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cccccc")),
                ("LEFTPADDING", (0, 0), (-1, -1), 4),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                # Right-align the LoC column for readability
                ("ALIGN", (2, 1), (2, -1), "RIGHT"),
            ]
        )
    )
    story.append(repo_table)

    doc.build(story)
    buf.seek(0)

    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={
            "Content-Disposition": (
                f'attachment; filename="loc-scan-{summary.org}.pdf"'
            )
        },
    )
