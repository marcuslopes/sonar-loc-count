"""Tests for azure_client.py — all HTTP calls are mocked, no network access."""

from __future__ import annotations

import base64
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

import azure_client


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_response(json_body: dict, headers: dict | None = None) -> MagicMock:
    """
    Build a mock httpx.Response whose .json() returns *json_body* and whose
    .headers mapping contains *headers*.  .raise_for_status() is a no-op.
    """
    response = MagicMock(spec=httpx.Response)
    response.json.return_value = json_body
    response.headers = httpx.Headers(headers or {})
    response.raise_for_status = MagicMock()
    return response


def _encode_pat(token: str) -> str:
    """Reproduce the Basic-auth encoding used by httpx for ('', token)."""
    raw = f":{token}"
    return "Basic " + base64.b64encode(raw.encode()).decode()


# ---------------------------------------------------------------------------
# list_projects
# ---------------------------------------------------------------------------


class TestListProjects:
    @pytest.mark.asyncio
    async def test_list_projects_success(self, mock_azure_projects):
        """list_projects returns all well-formed projects from the API response."""
        response = _make_response({"value": mock_azure_projects, "count": 2})

        with patch("azure_client.httpx.AsyncClient") as MockClient:
            instance = AsyncMock()
            instance.get = AsyncMock(return_value=response)
            instance.__aenter__ = AsyncMock(return_value=instance)
            instance.__aexit__ = AsyncMock(return_value=False)
            MockClient.return_value = instance

            result = await azure_client.list_projects(org="my-org", token="pat-token")

        assert len(result) == 2
        assert result[0]["name"] == "Alpha"
        assert result[1]["name"] == "Beta"

    @pytest.mark.asyncio
    async def test_list_projects_filters_non_wellformed(self):
        """list_projects excludes projects whose state is not 'wellFormed'."""
        projects = [
            {"name": "Good", "id": "g-1", "state": "wellFormed"},
            {"name": "Deleted", "id": "d-1", "state": "deleted"},
            {"name": "Disabled", "id": "dis-1", "state": "disabled"},
        ]
        response = _make_response({"value": projects})

        with patch("azure_client.httpx.AsyncClient") as MockClient:
            instance = AsyncMock()
            instance.get = AsyncMock(return_value=response)
            instance.__aenter__ = AsyncMock(return_value=instance)
            instance.__aexit__ = AsyncMock(return_value=False)
            MockClient.return_value = instance

            result = await azure_client.list_projects(org="my-org", token="pat-token")

        assert len(result) == 1
        assert result[0]["name"] == "Good"

    @pytest.mark.asyncio
    async def test_list_projects_empty_org(self):
        """list_projects returns an empty list when the org has no projects."""
        response = _make_response({"value": []})

        with patch("azure_client.httpx.AsyncClient") as MockClient:
            instance = AsyncMock()
            instance.get = AsyncMock(return_value=response)
            instance.__aenter__ = AsyncMock(return_value=instance)
            instance.__aexit__ = AsyncMock(return_value=False)
            MockClient.return_value = instance

            result = await azure_client.list_projects(org="empty-org", token="pat")

        assert result == []


# ---------------------------------------------------------------------------
# list_repositories
# ---------------------------------------------------------------------------


class TestListRepositories:
    @pytest.mark.asyncio
    async def test_list_repositories_success(self, mock_repos):
        """list_repositories parses and returns all repos from the API response."""
        response = _make_response({"value": mock_repos})

        with patch("azure_client.httpx.AsyncClient") as MockClient:
            instance = AsyncMock()
            instance.get = AsyncMock(return_value=response)
            instance.__aenter__ = AsyncMock(return_value=instance)
            instance.__aexit__ = AsyncMock(return_value=False)
            MockClient.return_value = instance

            result = await azure_client.list_repositories(
                org="my-org", project_name="Alpha", token="pat"
            )

        assert len(result) == 2
        names = {r["name"] for r in result}
        assert names == {"api-service", "web-app"}

    @pytest.mark.asyncio
    async def test_list_repositories_url_encodes_spaces(self):
        """list_repositories percent-encodes spaces in project names in the URL."""
        response = _make_response({"value": []})
        captured_url: list[str] = []

        async def fake_get(url: str, **kwargs):  # noqa: ANN001
            captured_url.append(url)
            return response

        with patch("azure_client.httpx.AsyncClient") as MockClient:
            instance = AsyncMock()
            instance.get = fake_get
            instance.__aenter__ = AsyncMock(return_value=instance)
            instance.__aexit__ = AsyncMock(return_value=False)
            MockClient.return_value = instance

            await azure_client.list_repositories(
                org="my-org", project_name="My Project", token="pat"
            )

        assert captured_url, "get() was not called"
        assert "My%20Project" in captured_url[0]


# ---------------------------------------------------------------------------
# list_branches
# ---------------------------------------------------------------------------


class TestListBranches:
    @pytest.mark.asyncio
    async def test_list_branches_strips_refs_prefix(self, mock_branches):
        """
        list_branches removes the 'refs/heads/' prefix so callers receive plain
        branch names such as 'main' and 'develop'.
        """
        refs = [{"name": b} for b in mock_branches]
        response = _make_response({"value": refs})

        with patch("azure_client.httpx.AsyncClient") as MockClient:
            instance = AsyncMock()
            instance.get = AsyncMock(return_value=response)
            instance.__aenter__ = AsyncMock(return_value=instance)
            instance.__aexit__ = AsyncMock(return_value=False)
            MockClient.return_value = instance

            result = await azure_client.list_branches(
                org="my-org", project_name="Alpha", repo_id="repo-1", token="pat"
            )

        assert result == ["main", "develop"]

    @pytest.mark.asyncio
    async def test_list_branches_handles_empty(self):
        """list_branches returns an empty list when the repository has no branches."""
        response = _make_response({"value": []})

        with patch("azure_client.httpx.AsyncClient") as MockClient:
            instance = AsyncMock()
            instance.get = AsyncMock(return_value=response)
            instance.__aenter__ = AsyncMock(return_value=instance)
            instance.__aexit__ = AsyncMock(return_value=False)
            MockClient.return_value = instance

            result = await azure_client.list_branches(
                org="my-org", project_name="Alpha", repo_id="empty-repo", token="pat"
            )

        assert result == []

    @pytest.mark.asyncio
    async def test_list_branches_ignores_non_head_refs(self):
        """list_branches silently drops any ref that does not start with 'refs/heads/'."""
        refs = [
            {"name": "refs/heads/main"},
            {"name": "refs/tags/v1.0"},   # tag — must be excluded
            {"name": "refs/pull/42/head"},  # PR ref — must be excluded
        ]
        response = _make_response({"value": refs})

        with patch("azure_client.httpx.AsyncClient") as MockClient:
            instance = AsyncMock()
            instance.get = AsyncMock(return_value=response)
            instance.__aenter__ = AsyncMock(return_value=instance)
            instance.__aexit__ = AsyncMock(return_value=False)
            MockClient.return_value = instance

            result = await azure_client.list_branches(
                org="my-org", project_name="Alpha", repo_id="repo-1", token="pat"
            )

        assert result == ["main"]


# ---------------------------------------------------------------------------
# Authentication
# ---------------------------------------------------------------------------


class TestApiAuthHeader:
    @pytest.mark.asyncio
    async def test_api_auth_header(self):
        """
        Requests are sent with a Basic auth header derived from an empty username
        and the supplied PAT.  Azure DevOps requires this exact format.
        """
        token = "super-secret-pat"
        response = _make_response({"value": []})
        captured_kwargs: list[dict] = []

        async def fake_get(url: str, **kwargs):  # noqa: ANN001
            captured_kwargs.append(kwargs)
            return response

        with patch("azure_client.httpx.AsyncClient") as MockClient:
            instance = AsyncMock()
            instance.get = fake_get
            instance.__aenter__ = AsyncMock(return_value=instance)
            instance.__aexit__ = AsyncMock(return_value=False)
            MockClient.return_value = instance

            await azure_client.list_projects(org="my-org", token=token)

        assert captured_kwargs, "get() was not called"
        auth_arg = captured_kwargs[0].get("auth")
        assert auth_arg is not None, "auth kwarg was not passed to client.get()"
        # httpx receives a tuple ("", token) and builds the Basic header
        assert auth_arg == ("", token)

    def test_auth_helper_returns_empty_username(self):
        """_auth() returns a tuple of ('', token) for Basic auth with no username."""
        result = azure_client._auth("my-token")
        assert result == ("", "my-token")


# ---------------------------------------------------------------------------
# Pagination (_get_paged)
# ---------------------------------------------------------------------------


class TestGetPaged:
    @pytest.mark.asyncio
    async def test_pagination_follows_continuation_token(self):
        """
        _get_paged follows x-ms-continuationtoken headers to retrieve all pages
        and concatenates their 'value' lists.
        """
        page1 = _make_response(
            {"value": [{"id": "p1"}]},
            headers={"x-ms-continuationtoken": "token-page2"},
        )
        page2 = _make_response({"value": [{"id": "p2"}]})

        call_count = 0

        async def fake_get(url: str, params: dict, auth: tuple):  # noqa: ANN001
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return page1
            return page2

        async with httpx.AsyncClient() as _:
            pass  # just to verify httpx is importable

        client_mock = AsyncMock()
        client_mock.get = fake_get

        result = await azure_client._get_paged(
            client_mock, "https://example.com/api", "pat"
        )

        assert len(result) == 2
        assert call_count == 2
