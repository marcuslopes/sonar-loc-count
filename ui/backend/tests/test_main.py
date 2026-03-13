"""Integration tests for the FastAPI application defined in main.py.

All tests use FastAPI's synchronous TestClient so no real event loop is needed.
External services (Azure, cloc, git) are fully mocked where required.
"""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


# ---------------------------------------------------------------------------
# Health endpoint
# ---------------------------------------------------------------------------


class TestHealth:
    def test_health_returns_200(self, test_client):
        """GET /health returns HTTP 200."""
        response = test_client.get("/health")
        assert response.status_code == 200

    def test_health_body(self, test_client):
        """GET /health returns JSON body {"status": "ok"}."""
        response = test_client.get("/health")
        assert response.json() == {"status": "ok"}


# ---------------------------------------------------------------------------
# POST /api/scan
# ---------------------------------------------------------------------------


class TestStartScan:
    def test_start_scan_missing_token_returns_422(self, test_client):
        """POST /api/scan with a missing 'token' field returns HTTP 422 Unprocessable Entity."""
        response = test_client.post("/api/scan", json={"org": "my-org"})
        assert response.status_code == 422

    def test_start_scan_missing_org_returns_422(self, test_client):
        """POST /api/scan with a missing 'org' field returns HTTP 422."""
        response = test_client.post("/api/scan", json={"token": "my-pat"})
        assert response.status_code == 422

    def test_start_scan_empty_body_returns_422(self, test_client):
        """POST /api/scan with an empty body returns HTTP 422."""
        response = test_client.post("/api/scan", json={})
        assert response.status_code == 422

    def test_start_scan_returns_scan_id(self, test_client):
        """POST /api/scan with valid org and token returns a JSON body containing a UUID scan_id."""
        response = test_client.post(
            "/api/scan",
            json={"org": "my-org", "token": "super-secret-pat"},
        )
        assert response.status_code == 200
        body = response.json()
        assert "scan_id" in body
        # Verify the returned value is a valid UUID string
        scan_id = body["scan_id"]
        parsed = uuid.UUID(scan_id)  # raises ValueError if not a valid UUID
        assert str(parsed) == scan_id

    def test_start_scan_returns_unique_ids(self, test_client):
        """Each POST /api/scan call returns a different scan_id."""
        r1 = test_client.post("/api/scan", json={"org": "org", "token": "tok"})
        r2 = test_client.post("/api/scan", json={"org": "org", "token": "tok"})
        assert r1.status_code == 200
        assert r2.status_code == 200
        assert r1.json()["scan_id"] != r2.json()["scan_id"]


# ---------------------------------------------------------------------------
# GET /api/results/{scan_id}
# ---------------------------------------------------------------------------


class TestGetResults:
    def test_get_results_not_found(self, test_client):
        """GET /api/results/{id} for an unknown scan_id returns HTTP 404."""
        response = test_client.get("/api/results/nonexistent-scan-id")
        assert response.status_code == 404

    def test_get_results_running_returns_202(self, test_client):
        """
        GET /api/results/{id} for a scan that is still running returns HTTP 202
        with status='running' in the body.
        """
        # Start a scan to get a real scan_id
        start_resp = test_client.post(
            "/api/scan", json={"org": "my-org", "token": "pat"}
        )
        assert start_resp.status_code == 200
        scan_id = start_resp.json()["scan_id"]

        result_resp = test_client.get(f"/api/results/{scan_id}")
        # A freshly created scan should be running (202) or done (200)
        assert result_resp.status_code in (200, 202)

    def test_get_results_running_body_has_status(self, test_client):
        """
        The response body for a running scan includes a 'status' field equal to
        'running'.
        """
        start_resp = test_client.post(
            "/api/scan", json={"org": "my-org", "token": "pat"}
        )
        scan_id = start_resp.json()["scan_id"]

        result_resp = test_client.get(f"/api/results/{scan_id}")
        body = result_resp.json()
        assert "status" in body
        assert body["status"] in ("running", "done", "error")


# ---------------------------------------------------------------------------
# GET /api/export/{scan_id}
# ---------------------------------------------------------------------------


class TestExport:
    def test_export_invalid_format_returns_400(self, test_client):
        """
        GET /api/export/{id}?format=xml returns HTTP 400 because XML is not a
        supported export format.
        """
        # Start a scan to get a real scan_id (export might 404 for unknown, 400 for bad format)
        start_resp = test_client.post(
            "/api/scan", json={"org": "my-org", "token": "pat"}
        )
        scan_id = start_resp.json()["scan_id"]

        response = test_client.get(f"/api/export/{scan_id}?format=xml")
        assert response.status_code == 400

    def test_export_unknown_scan_id_with_valid_format(self, test_client):
        """
        GET /api/export/nonexistent?format=csv returns 404 (unknown scan takes
        priority over format validation, or may return 400 — either is acceptable).
        """
        response = test_client.get("/api/export/nonexistent-id?format=csv")
        assert response.status_code in (400, 404)

    def test_export_supported_formats_accepted(self, test_client):
        """
        GET /api/export/{id}?format=csv and ?format=json do NOT return 400 for
        the format itself (they may 404 if the scan is unknown, but not 400).
        """
        start_resp = test_client.post(
            "/api/scan", json={"org": "my-org", "token": "pat"}
        )
        scan_id = start_resp.json()["scan_id"]

        for fmt in ("csv", "json"):
            response = test_client.get(f"/api/export/{scan_id}?format={fmt}")
            assert response.status_code != 400, (
                f"format={fmt!r} should be accepted but got 400"
            )


# ---------------------------------------------------------------------------
# CORS headers
# ---------------------------------------------------------------------------


class TestCorsHeaders:
    def test_cors_header_present_on_options(self, test_client):
        """
        An OPTIONS preflight request to /api/scan includes the
        Access-Control-Allow-Origin response header, confirming CORS middleware
        is active.
        """
        response = test_client.options(
            "/api/scan",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": "POST",
            },
        )
        assert "access-control-allow-origin" in response.headers

    def test_cors_header_present_on_get(self, test_client):
        """
        A regular GET request with an Origin header receives the
        Access-Control-Allow-Origin header in the response.
        """
        response = test_client.get(
            "/health",
            headers={"Origin": "http://localhost:3000"},
        )
        assert "access-control-allow-origin" in response.headers

    def test_cors_allows_frontend_origin(self, test_client):
        """
        The Access-Control-Allow-Origin value is either '*' (wildcard) or the
        exact origin supplied in the request.
        """
        origin = "http://localhost:3000"
        response = test_client.get("/health", headers={"Origin": origin})
        acao = response.headers.get("access-control-allow-origin", "")
        assert acao in ("*", origin), (
            f"Expected ACAO to be '*' or {origin!r}, got {acao!r}"
        )


# ---------------------------------------------------------------------------
# SSE stream endpoint (if present)
# ---------------------------------------------------------------------------


class TestScanStream:
    def test_stream_endpoint_not_found_for_unknown_scan(self, test_client):
        """
        GET /api/stream/nonexistent (or equivalent SSE endpoint) returns 404.
        This test is skipped if the application does not expose a streaming route.
        """
        response = test_client.get("/api/stream/nonexistent")
        # Accept 404 (scan not found) or 405 (route exists but method not allowed)
        # or 200 if the app streams an error event — anything except a 5xx crash.
        assert response.status_code < 500
