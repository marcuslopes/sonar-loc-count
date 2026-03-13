"""Shared pytest fixtures for the LoC dashboard backend test suite."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def mock_azure_projects() -> list[dict]:
    """Two well-formed Azure DevOps project stubs."""
    return [
        {"name": "Alpha", "id": "abc-1", "state": "wellFormed"},
        {"name": "Beta", "id": "abc-2", "state": "wellFormed"},
    ]


@pytest.fixture
def mock_repos() -> list[dict]:
    """Two repository stubs returned by the Azure DevOps Git API."""
    return [
        {"name": "api-service", "id": "repo-1"},
        {"name": "web-app", "id": "repo-2"},
    ]


@pytest.fixture
def mock_branches() -> list[str]:
    """Branch ref names as returned by the Azure DevOps refs endpoint."""
    return ["refs/heads/main", "refs/heads/develop"]


@pytest.fixture
def mock_cloc_output() -> dict:
    """
    Cloc JSON output structure with two languages and a SUM entry.

    Matches the format produced by `cloc --json --sum-one`.
    """
    return {
        "header": {
            "cloc_url": "https://github.com/AlDanial/cloc",
            "cloc_version": "1.98",
            "elapsed_seconds": 1.23,
            "n_files": 15,
            "n_lines": 2730,
        },
        "Python": {
            "nFiles": 10,
            "blank": 100,
            "comment": 200,
            "code": 1500,
        },
        "JavaScript": {
            "nFiles": 5,
            "blank": 80,
            "comment": 50,
            "code": 800,
        },
        "SUM": {
            "nFiles": 15,
            "blank": 180,
            "comment": 250,
            "code": 2300,
        },
    }


@pytest.fixture
def test_client() -> TestClient:
    """
    FastAPI TestClient wrapping the application.

    Imported lazily so that the fixture fails gracefully when main.py has not
    been created yet, rather than at collection time.
    """
    from main import app  # noqa: PLC0415 — intentional lazy import

    return TestClient(app, raise_server_exceptions=False)
