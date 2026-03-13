"""Tests for cloc_runner.py — all subprocess and filesystem calls are mocked."""

from __future__ import annotations

import json
import subprocess
from unittest.mock import AsyncMock, MagicMock, call, patch

import pytest

import cloc_runner


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_completed_process(
    stdout: str = "",
    stderr: str = "",
    returncode: int = 0,
) -> subprocess.CompletedProcess:
    """Build a fake subprocess.CompletedProcess with the given attributes."""
    result: subprocess.CompletedProcess = MagicMock(spec=subprocess.CompletedProcess)
    result.stdout = stdout
    result.stderr = stderr
    result.returncode = returncode
    return result


def _make_cloc_json(python_code: int = 1500, js_code: int = 800) -> str:
    """Return a cloc JSON string with Python and JavaScript entries."""
    data = {
        "header": {"cloc_version": "1.98"},
        "Python": {"nFiles": 10, "blank": 100, "comment": 200, "code": python_code},
        "JavaScript": {"nFiles": 5, "blank": 80, "comment": 50, "code": js_code},
        "SUM": {
            "nFiles": 15,
            "blank": 180,
            "comment": 250,
            "code": python_code + js_code,
        },
    }
    return json.dumps(data)


# ---------------------------------------------------------------------------
# run_cloc — success path
# ---------------------------------------------------------------------------


class TestRunClocSuccess:
    @pytest.mark.asyncio
    async def test_run_cloc_success(self, mock_cloc_output):
        """
        run_cloc returns a dict with 'loc' equal to SUM.code and 'languages'
        containing one LanguageStats entry per non-meta language key.
        """
        cloc_json = json.dumps(mock_cloc_output)
        clone_proc = _make_completed_process(returncode=0)
        cloc_proc = _make_completed_process(stdout=cloc_json, returncode=0)

        with (
            patch("cloc_runner.asyncio.to_thread", new_callable=AsyncMock) as mock_thread,
            patch("cloc_runner.tempfile.mkdtemp", return_value="/tmp/cloc_test"),
            patch("cloc_runner.shutil.rmtree"),
        ):
            # First call → git clone, second call → cloc
            mock_thread.side_effect = [clone_proc, cloc_proc]

            result = await cloc_runner.run_cloc(
                clone_url="https://:pat@dev.azure.com/org/project/_git/repo",
                branch="main",
                token="pat",
                sonar_lang_defs="/path/to/sonar-lang-defs.txt",
            )

        assert result["loc"] == 2300
        lang_names = {lang.language for lang in result["languages"]}
        assert "Python" in lang_names
        assert "JavaScript" in lang_names
        assert "SUM" not in lang_names
        assert "header" not in lang_names

    @pytest.mark.asyncio
    async def test_run_cloc_returns_sorted_languages(self, mock_cloc_output):
        """
        Languages in the result are sorted by code lines descending.
        Python (1500) should appear before JavaScript (800).
        """
        cloc_json = json.dumps(mock_cloc_output)
        clone_proc = _make_completed_process(returncode=0)
        cloc_proc = _make_completed_process(stdout=cloc_json, returncode=0)

        with (
            patch("cloc_runner.asyncio.to_thread", new_callable=AsyncMock) as mock_thread,
            patch("cloc_runner.tempfile.mkdtemp", return_value="/tmp/cloc_test"),
            patch("cloc_runner.shutil.rmtree"),
        ):
            mock_thread.side_effect = [clone_proc, cloc_proc]
            result = await cloc_runner.run_cloc(
                clone_url="https://:pat@dev.azure.com/org/proj/_git/repo",
                branch="main",
                token="pat",
                sonar_lang_defs="/path/to/sonar-lang-defs.txt",
            )

        assert result["languages"][0].language == "Python"
        assert result["languages"][1].language == "JavaScript"


# ---------------------------------------------------------------------------
# run_cloc — empty repository
# ---------------------------------------------------------------------------


class TestRunClocEmptyRepo:
    @pytest.mark.asyncio
    async def test_run_cloc_empty_repo(self):
        """
        When cloc reports only a header and SUM with code=0, run_cloc returns
        loc=0 and an empty languages list.
        """
        empty_cloc_json = json.dumps({"header": {}, "SUM": {"code": 0, "comment": 0, "blank": 0}})
        clone_proc = _make_completed_process(returncode=0)
        cloc_proc = _make_completed_process(stdout=empty_cloc_json, returncode=0)

        with (
            patch("cloc_runner.asyncio.to_thread", new_callable=AsyncMock) as mock_thread,
            patch("cloc_runner.tempfile.mkdtemp", return_value="/tmp/cloc_empty"),
            patch("cloc_runner.shutil.rmtree"),
        ):
            mock_thread.side_effect = [clone_proc, cloc_proc]
            result = await cloc_runner.run_cloc(
                clone_url="https://:pat@dev.azure.com/org/proj/_git/empty-repo",
                branch="main",
                token="pat",
                sonar_lang_defs="/path/to/sonar-lang-defs.txt",
            )

        assert result["loc"] == 0
        assert result["languages"] == []


# ---------------------------------------------------------------------------
# run_cloc — cleanup on error
# ---------------------------------------------------------------------------


class TestRunClocCleanup:
    @pytest.mark.asyncio
    async def test_run_cloc_cleanup_on_error(self):
        """
        The temporary directory is always removed via shutil.rmtree, even when
        asyncio.to_thread raises an unexpected exception during clone.
        """
        with (
            patch("cloc_runner.asyncio.to_thread", new_callable=AsyncMock) as mock_thread,
            patch("cloc_runner.tempfile.mkdtemp", return_value="/tmp/cloc_err"),
            patch("cloc_runner.shutil.rmtree") as mock_rmtree,
        ):
            mock_thread.side_effect = RuntimeError("simulated failure")

            result = await cloc_runner.run_cloc(
                clone_url="https://:pat@dev.azure.com/org/proj/_git/repo",
                branch="main",
                token="pat",
                sonar_lang_defs="/path/to/sonar-lang-defs.txt",
            )

        # Cleanup must have been called regardless of the exception
        mock_rmtree.assert_called_once_with("/tmp/cloc_err", ignore_errors=True)
        # run_cloc swallows the error and returns the empty result
        assert result == {"loc": 0, "languages": []}

    @pytest.mark.asyncio
    async def test_run_cloc_cleanup_on_clone_failure(self):
        """
        The temp directory is cleaned up even when git clone returns a non-zero
        exit code (inaccessible or private repository).
        """
        clone_proc = _make_completed_process(
            returncode=128, stderr="fatal: repository not found"
        )

        with (
            patch("cloc_runner.asyncio.to_thread", new_callable=AsyncMock) as mock_thread,
            patch("cloc_runner.tempfile.mkdtemp", return_value="/tmp/cloc_clone_fail"),
            patch("cloc_runner.shutil.rmtree") as mock_rmtree,
        ):
            mock_thread.side_effect = [clone_proc]
            result = await cloc_runner.run_cloc(
                clone_url="https://:pat@dev.azure.com/org/proj/_git/private",
                branch="main",
                token="pat",
                sonar_lang_defs="/path/to/sonar-lang-defs.txt",
            )

        mock_rmtree.assert_called_once_with("/tmp/cloc_clone_fail", ignore_errors=True)
        assert result["loc"] == 0

    @pytest.mark.asyncio
    async def test_run_cloc_cleanup_on_timeout(self):
        """
        The temp directory is cleaned up when subprocess.TimeoutExpired is raised.
        """
        with (
            patch("cloc_runner.asyncio.to_thread", new_callable=AsyncMock) as mock_thread,
            patch("cloc_runner.tempfile.mkdtemp", return_value="/tmp/cloc_timeout"),
            patch("cloc_runner.shutil.rmtree") as mock_rmtree,
        ):
            mock_thread.side_effect = subprocess.TimeoutExpired(cmd="git clone", timeout=300)
            result = await cloc_runner.run_cloc(
                clone_url="https://:pat@dev.azure.com/org/proj/_git/slow-repo",
                branch="develop",
                token="pat",
                sonar_lang_defs="/path/to/sonar-lang-defs.txt",
            )

        mock_rmtree.assert_called_once_with("/tmp/cloc_timeout", ignore_errors=True)
        assert result["loc"] == 0


# ---------------------------------------------------------------------------
# run_cloc — git clone argument verification
# ---------------------------------------------------------------------------


class TestRunClocGitCloneArgs:
    @pytest.mark.asyncio
    async def test_run_cloc_git_clone_args(self):
        """
        _run_git_clone is called with 'git clone --depth 1 --branch <branch>'
        followed by the clone URL and target directory.
        """
        clone_proc = _make_completed_process(returncode=0)
        cloc_proc = _make_completed_process(
            stdout=json.dumps({"header": {}, "SUM": {"code": 0}}), returncode=0
        )

        with (
            patch("cloc_runner.asyncio.to_thread", new_callable=AsyncMock) as mock_thread,
            patch("cloc_runner.tempfile.mkdtemp", return_value="/tmp/cloc_args"),
            patch("cloc_runner.shutil.rmtree"),
        ):
            mock_thread.side_effect = [clone_proc, cloc_proc]
            await cloc_runner.run_cloc(
                clone_url="https://:pat@dev.azure.com/org/proj/_git/repo",
                branch="feature/my-branch",
                token="pat",
                sonar_lang_defs="/path/to/sonar-lang-defs.txt",
            )

        # The first to_thread call wraps _run_git_clone
        first_call = mock_thread.call_args_list[0]
        func_called = first_call[0][0]  # positional arg[0] = the function
        assert func_called is cloc_runner._run_git_clone

        # Verify the args passed through to _run_git_clone
        _, kwargs_or_positional = first_call[0], first_call[1]
        called_args = first_call[0][1:]  # (clone_url, branch, target_dir)
        clone_url_arg, branch_arg, target_dir_arg = called_args

        assert clone_url_arg == "https://:pat@dev.azure.com/org/proj/_git/repo"
        assert branch_arg == "feature/my-branch"
        assert "/tmp/cloc_args" in target_dir_arg

    def test_run_git_clone_subprocess_command(self):
        """
        _run_git_clone passes exactly ['git','clone','--depth','1','--branch',
        branch, clone_url, target_dir] to subprocess.run.
        """
        with patch("cloc_runner.subprocess.run") as mock_run:
            mock_run.return_value = _make_completed_process(returncode=0)
            cloc_runner._run_git_clone(
                clone_url="https://:tok@dev.azure.com/org/proj/_git/r",
                branch="main",
                target_dir="/tmp/target",
            )

        cmd = mock_run.call_args[0][0]
        assert cmd[:6] == ["git", "clone", "--depth", "1", "--branch", "main"]
        assert "https://:tok@dev.azure.com/org/proj/_git/r" in cmd
        assert "/tmp/target" in cmd


# ---------------------------------------------------------------------------
# _parse_cloc_output — unit tests for the pure parsing helper
# ---------------------------------------------------------------------------


class TestParseClocOutput:
    def test_parse_valid_output(self, mock_cloc_output):
        """_parse_cloc_output extracts loc and builds LanguageStats objects."""
        raw = json.dumps(mock_cloc_output)
        result = cloc_runner._parse_cloc_output(raw)
        assert result["loc"] == 2300
        lang_names = {l.language for l in result["languages"]}
        assert lang_names == {"Python", "JavaScript"}

    def test_parse_invalid_json(self):
        """_parse_cloc_output returns loc=0 and empty languages for bad JSON."""
        result = cloc_runner._parse_cloc_output("not-valid-json")
        assert result == {"loc": 0, "languages": []}

    def test_parse_excludes_meta_keys(self, mock_cloc_output):
        """_parse_cloc_output never creates LanguageStats for 'header' or 'SUM'."""
        raw = json.dumps(mock_cloc_output)
        result = cloc_runner._parse_cloc_output(raw)
        meta_found = [l for l in result["languages"] if l.language in {"SUM", "header"}]
        assert meta_found == []


# ---------------------------------------------------------------------------
# build_clone_url — public alias
# ---------------------------------------------------------------------------


class TestBuildCloneUrl:
    def test_build_clone_url_format(self):
        """build_clone_url embeds the PAT and percent-encodes spaces in project names."""
        url = cloc_runner.build_clone_url(
            org="my-org",
            project="My Project",
            repo_name="api-service",
            token="secret-token",
        )
        assert url == "https://:secret-token@dev.azure.com/my-org/My%20Project/_git/api-service"

    def test_build_clone_url_no_spaces(self):
        """build_clone_url works without any spaces in the project name."""
        url = cloc_runner.build_clone_url(
            org="contoso", project="Contoso", repo_name="core", token="tok"
        )
        assert url == "https://:tok@dev.azure.com/contoso/Contoso/_git/core"
