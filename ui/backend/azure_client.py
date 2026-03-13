"""Async Azure DevOps REST API client."""

from __future__ import annotations

import logging
from typing import Any

import httpx

logger = logging.getLogger(__name__)

BASE_URL = "https://dev.azure.com"
API_VERSION = "7.0"


def _auth(token: str) -> tuple[str, str]:
    """Basic auth tuple for Azure DevOps PAT (username is empty)."""
    return ("", token)


async def _get_paged(
    client: httpx.AsyncClient,
    url: str,
    token: str,
    params: dict[str, str] | None = None,
) -> list[dict[str, Any]]:
    """
    Perform a GET request and follow Azure DevOps continuation-token pagination.

    Azure DevOps returns a `x-ms-continuationtoken` header (and sometimes a
    `continuationToken` field in the JSON body) when there are more results.
    We collect all pages and return the combined `.value` list.
    """
    results: list[dict[str, Any]] = []
    next_params: dict[str, str] = dict(params or {})
    next_params.setdefault("api-version", API_VERSION)

    while True:
        response = await client.get(url, params=next_params, auth=_auth(token))
        response.raise_for_status()
        data: dict[str, Any] = response.json()

        page_items: list[dict[str, Any]] = data.get("value", [])
        results.extend(page_items)

        # Check for continuation token in response header first, then body
        continuation = response.headers.get("x-ms-continuationtoken") or data.get(
            "continuationToken"
        )
        if not continuation:
            break

        next_params["continuationToken"] = continuation

    return results


async def list_projects(org: str, token: str) -> list[dict[str, Any]]:
    """
    Return all well-formed projects in the given Azure DevOps organisation.

    Skips projects whose state is not 'wellFormed' (e.g. deleted or disabled).
    """
    url = f"{BASE_URL}/{org}/_apis/projects"
    async with httpx.AsyncClient(timeout=30) as client:
        projects = await _get_paged(client, url, token)

    well_formed = [p for p in projects if p.get("state") == "wellFormed"]
    logger.debug("Found %d well-formed projects in org '%s'", len(well_formed), org)
    return well_formed


async def list_repositories(
    org: str, project_name: str, token: str
) -> list[dict[str, Any]]:
    """Return all git repositories for the given project."""
    # Encode spaces as %20 for the URL path segment
    encoded_project = project_name.replace(" ", "%20")
    url = f"{BASE_URL}/{org}/{encoded_project}/_apis/git/repositories"
    async with httpx.AsyncClient(timeout=30) as client:
        repos = await _get_paged(client, url, token)

    logger.debug(
        "Found %d repositories in project '%s'", len(repos), project_name
    )
    return repos


async def list_branches(
    org: str, project_name: str, repo_id: str, token: str
) -> list[str]:
    """
    Return branch names (without the 'refs/heads/' prefix) for a repository.

    Uses the `refs?filter=heads/` endpoint to fetch only branch refs.
    """
    encoded_project = project_name.replace(" ", "%20")
    url = (
        f"{BASE_URL}/{org}/{encoded_project}/_apis/git/repositories/{repo_id}/refs"
    )
    params = {"filter": "heads/", "api-version": API_VERSION}

    async with httpx.AsyncClient(timeout=30) as client:
        refs = await _get_paged(client, url, token, params=params)

    # Strip the 'refs/heads/' prefix from each ref name
    branches = [
        ref["name"].removeprefix("refs/heads/")
        for ref in refs
        if ref.get("name", "").startswith("refs/heads/")
    ]
    logger.debug(
        "Found %d branches in repo '%s'", len(branches), repo_id
    )
    return branches
