"""Cloc subprocess wrapper — clones a branch and measures lines of code."""

from __future__ import annotations

import asyncio
import json
import logging
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any

from models import LanguageStats

logger = logging.getLogger(__name__)

# Keys that cloc puts in the JSON output that are metadata, not language entries
_CLOC_META_KEYS = {"header", "SUM"}

# Path to the sonar language definitions file (copied into the container)
SONAR_LANG_DEFS = Path(__file__).parent / "sonar-lang-defs.txt"


def _build_clone_url(org: str, project: str, repo_name: str, token: str) -> str:
    """
    Construct an authenticated HTTPS clone URL for an Azure DevOps repository.

    Format: https://:{token}@dev.azure.com/{org}/{project}/_git/{repo}
    Spaces in project names are percent-encoded.
    """
    encoded_project = project.replace(" ", "%20")
    return f"https://:{token}@dev.azure.com/{org}/{encoded_project}/_git/{repo_name}"


def _run_git_clone(clone_url: str, branch: str, target_dir: str) -> subprocess.CompletedProcess[str]:
    """Shallow-clone a single branch into *target_dir* (blocking, run in thread)."""
    return subprocess.run(
        [
            "git", "clone",
            "--depth", "1",
            "--branch", branch,
            clone_url,
            target_dir,
        ],
        capture_output=True,
        text=True,
        timeout=300,  # 5-minute cap per clone
    )


def _run_cloc(target_dir: str, sonar_lang_defs: str) -> subprocess.CompletedProcess[str]:
    """Run cloc on *target_dir* and return JSON output (blocking, run in thread)."""
    return subprocess.run(
        [
            "cloc",
            target_dir,
            f"--force-lang-def={sonar_lang_defs}",
            "--ignore-case-ext",
            "--json",
            "--sum-one",
            "--quiet",
        ],
        capture_output=True,
        text=True,
        timeout=600,  # 10-minute cap per cloc run
    )


def _parse_cloc_output(raw_json: str) -> dict[str, Any]:
    """
    Parse cloc JSON output into a normalised dict.

    cloc JSON structure:
    {
        "header": { ... },
        "SUM":    { "code": N, "comment": N, "blank": N, ... },
        "Python": { "code": N, "comment": N, "blank": N, ... },
        ...
    }

    Returns:
        {
            "loc": int,                   # SUM.code
            "languages": list[LanguageStats]
        }
    """
    try:
        data: dict[str, Any] = json.loads(raw_json)
    except json.JSONDecodeError as exc:
        logger.warning("Failed to parse cloc JSON: %s", exc)
        return {"loc": 0, "languages": []}

    summary = data.get("SUM", {})
    loc: int = int(summary.get("code", 0))

    languages: list[LanguageStats] = []
    for lang, stats in data.items():
        if lang in _CLOC_META_KEYS:
            continue
        if not isinstance(stats, dict):
            continue
        languages.append(
            LanguageStats(
                language=lang,
                code=int(stats.get("code", 0)),
                comment=int(stats.get("comment", 0)),
                blank=int(stats.get("blank", 0)),
            )
        )

    # Sort languages by code lines descending for consistent ordering
    languages.sort(key=lambda l: l.code, reverse=True)
    return {"loc": loc, "languages": languages}


async def run_cloc(
    clone_url: str,
    branch: str,
    token: str,  # kept for API symmetry; already embedded in clone_url
    sonar_lang_defs: str,
) -> dict[str, Any]:
    """
    Clone *branch* from *clone_url* into a temporary directory and run cloc.

    The clone URL must already contain credentials (see `build_clone_url`).
    All filesystem work is performed in a throwaway temp directory that is
    always cleaned up, even on error.

    Returns a dict with keys:
        - ``loc``       (int)  — total code lines (SUM.code from cloc)
        - ``languages`` (list) — per-language LanguageStats objects

    On any error (inaccessible repo, empty repo, cloc failure) returns
    ``{"loc": 0, "languages": []}``.
    """
    tmpdir = tempfile.mkdtemp(prefix="cloc_")
    clone_target = str(Path(tmpdir) / "repo")
    empty_result: dict[str, Any] = {"loc": 0, "languages": []}

    try:
        # --- Clone step (offloaded to thread pool to avoid blocking event loop) ---
        clone_result: subprocess.CompletedProcess[str] = await asyncio.to_thread(
            _run_git_clone, clone_url, branch, clone_target
        )

        if clone_result.returncode != 0:
            logger.warning(
                "git clone failed for branch '%s' (rc=%d): %s",
                branch,
                clone_result.returncode,
                clone_result.stderr[:500],
            )
            return empty_result

        # --- Cloc step ---
        cloc_result: subprocess.CompletedProcess[str] = await asyncio.to_thread(
            _run_cloc, clone_target, sonar_lang_defs
        )

        if cloc_result.returncode not in (0, 1):
            # cloc exits 1 for warnings; treat anything else as a real error
            logger.warning(
                "cloc failed for branch '%s' (rc=%d): %s",
                branch,
                cloc_result.returncode,
                cloc_result.stderr[:500],
            )
            return empty_result

        return _parse_cloc_output(cloc_result.stdout)

    except subprocess.TimeoutExpired:
        logger.warning("Timeout while processing branch '%s'", branch)
        return empty_result
    except Exception as exc:  # noqa: BLE001
        logger.exception("Unexpected error processing branch '%s': %s", branch, exc)
        return empty_result
    finally:
        # Always remove the temp directory
        shutil.rmtree(tmpdir, ignore_errors=True)


def build_clone_url(org: str, project: str, repo_name: str, token: str) -> str:
    """Public alias for _build_clone_url — used by main.py."""
    return _build_clone_url(org, project, repo_name, token)
