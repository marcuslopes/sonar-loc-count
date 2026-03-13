"""Tests for Pydantic v2 models defined in models.py."""

from __future__ import annotations

import json

import pytest
from pydantic import ValidationError

from models import (
    BranchResult,
    LanguageStats,
    ProjectResult,
    RepoResult,
    ScanStatus,
    ScanSummary,
)


# ---------------------------------------------------------------------------
# LanguageStats
# ---------------------------------------------------------------------------


class TestLanguageStats:
    def test_valid_construction(self):
        """LanguageStats accepts valid integer fields."""
        lang = LanguageStats(language="Python", code=1500, comment=200, blank=100)
        assert lang.language == "Python"
        assert lang.code == 1500
        assert lang.comment == 200
        assert lang.blank == 100

    def test_missing_language_raises(self):
        """LanguageStats raises ValidationError when 'language' is absent."""
        with pytest.raises(ValidationError):
            LanguageStats(code=100, comment=10, blank=5)  # type: ignore[call-arg]

    def test_negative_code_allowed(self):
        """LanguageStats stores negative integers without error (no range constraint)."""
        lang = LanguageStats(language="C", code=-1, comment=0, blank=0)
        assert lang.code == -1


# ---------------------------------------------------------------------------
# BranchResult
# ---------------------------------------------------------------------------


class TestBranchResult:
    def test_valid_construction(self):
        """BranchResult stores name, loc, and a list of LanguageStats."""
        branch = BranchResult(
            name="main",
            loc=2300,
            languages=[
                LanguageStats(language="Python", code=1500, comment=200, blank=100),
                LanguageStats(language="JavaScript", code=800, comment=50, blank=80),
            ],
        )
        assert branch.name == "main"
        assert branch.loc == 2300
        assert len(branch.languages) == 2

    def test_empty_languages_list(self):
        """BranchResult accepts an empty language list (e.g. empty repo)."""
        branch = BranchResult(name="empty-branch", loc=0, languages=[])
        assert branch.loc == 0
        assert branch.languages == []

    def test_missing_name_raises(self):
        """BranchResult raises ValidationError when 'name' is missing."""
        with pytest.raises(ValidationError):
            BranchResult(loc=100, languages=[])  # type: ignore[call-arg]

    def test_loc_must_be_int(self):
        """BranchResult raises ValidationError when loc is a non-numeric string."""
        with pytest.raises(ValidationError):
            BranchResult(name="main", loc="not-a-number", languages=[])  # type: ignore[arg-type]


# ---------------------------------------------------------------------------
# RepoResult
# ---------------------------------------------------------------------------


class TestRepoResult:
    def _make_repo(self) -> RepoResult:
        """Helper: construct a RepoResult with two branches of different LoC."""
        return RepoResult(
            name="api-service",
            project="Alpha",
            branches=[
                BranchResult(
                    name="main",
                    loc=2300,
                    languages=[
                        LanguageStats(language="Python", code=1500, comment=200, blank=100),
                        LanguageStats(language="JavaScript", code=800, comment=50, blank=80),
                    ],
                ),
                BranchResult(
                    name="develop",
                    loc=1800,
                    languages=[
                        LanguageStats(language="Python", code=1200, comment=150, blank=80),
                        LanguageStats(language="JavaScript", code=600, comment=40, blank=60),
                    ],
                ),
            ],
            max_loc=2300,
            max_branch="main",
        )

    def test_max_loc_reflects_highest_branch(self):
        """RepoResult.max_loc equals the highest branch loc."""
        repo = self._make_repo()
        assert repo.max_loc == 2300

    def test_max_branch_is_correct_name(self):
        """RepoResult.max_branch contains the name of the highest-loc branch."""
        repo = self._make_repo()
        assert repo.max_branch == "main"

    def test_multiple_branches_stored(self):
        """RepoResult stores all supplied branches."""
        repo = self._make_repo()
        assert len(repo.branches) == 2
        branch_names = {b.name for b in repo.branches}
        assert branch_names == {"main", "develop"}

    def test_missing_project_raises(self):
        """RepoResult raises ValidationError when 'project' is missing."""
        with pytest.raises(ValidationError):
            RepoResult(  # type: ignore[call-arg]
                name="api-service",
                branches=[],
                max_loc=0,
                max_branch="",
            )

    def test_single_branch_repo(self):
        """RepoResult with one branch sets max_loc and max_branch from that branch."""
        repo = RepoResult(
            name="solo-repo",
            project="Beta",
            branches=[
                BranchResult(name="main", loc=500, languages=[]),
            ],
            max_loc=500,
            max_branch="main",
        )
        assert repo.max_loc == 500
        assert repo.max_branch == "main"


# ---------------------------------------------------------------------------
# ProjectResult
# ---------------------------------------------------------------------------


class TestProjectResult:
    def test_total_loc_is_stored(self):
        """ProjectResult stores total_loc correctly."""
        project = ProjectResult(
            name="Alpha",
            repos=[],
            total_loc=5000,
        )
        assert project.total_loc == 5000

    def test_with_repos(self):
        """ProjectResult stores a list of RepoResult objects."""
        repo = RepoResult(
            name="api-service",
            project="Alpha",
            branches=[],
            max_loc=2300,
            max_branch="main",
        )
        project = ProjectResult(name="Alpha", repos=[repo], total_loc=2300)
        assert len(project.repos) == 1
        assert project.repos[0].name == "api-service"


# ---------------------------------------------------------------------------
# ScanSummary
# ---------------------------------------------------------------------------


class TestScanSummary:
    def _make_summary(self) -> ScanSummary:
        """Helper: construct a minimal but valid ScanSummary."""
        repo = RepoResult(
            name="api-service",
            project="Alpha",
            branches=[
                BranchResult(
                    name="main",
                    loc=2300,
                    languages=[
                        LanguageStats(language="Python", code=1500, comment=200, blank=100),
                    ],
                )
            ],
            max_loc=2300,
            max_branch="main",
        )
        project = ProjectResult(name="Alpha", repos=[repo], total_loc=2300)
        return ScanSummary(
            org="my-org",
            total_loc=2300,
            project_count=1,
            repo_count=1,
            language_totals={"Python": 1500, "JavaScript": 800},
            projects=[project],
            top_repos=[repo],
        )

    def test_serialises_to_json_without_error(self):
        """ScanSummary.model_dump_json() produces valid JSON."""
        summary = self._make_summary()
        raw = summary.model_dump_json()
        parsed = json.loads(raw)
        assert parsed["org"] == "my-org"
        assert parsed["total_loc"] == 2300

    def test_language_totals_is_dict(self):
        """ScanSummary.language_totals is a plain dict mapping str → int."""
        summary = self._make_summary()
        assert isinstance(summary.language_totals, dict)
        assert summary.language_totals["Python"] == 1500

    def test_top_repos_list(self):
        """ScanSummary.top_repos contains the expected repos."""
        summary = self._make_summary()
        assert len(summary.top_repos) == 1
        assert summary.top_repos[0].name == "api-service"

    def test_missing_org_raises(self):
        """ScanSummary raises ValidationError when 'org' is absent."""
        with pytest.raises(ValidationError):
            ScanSummary(  # type: ignore[call-arg]
                total_loc=0,
                project_count=0,
                repo_count=0,
                language_totals={},
                projects=[],
                top_repos=[],
            )


# ---------------------------------------------------------------------------
# ScanStatus
# ---------------------------------------------------------------------------


class TestScanStatus:
    def test_running_status_no_summary(self):
        """ScanStatus with status='running' allows summary=None."""
        status = ScanStatus(
            scan_id="some-uuid",
            status="running",
            progress_pct=42.0,
        )
        assert status.summary is None
        assert status.error is None

    def test_done_status_with_summary(self):
        """ScanStatus with status='done' can carry a full ScanSummary."""
        summary = ScanSummary(
            org="my-org",
            total_loc=100,
            project_count=1,
            repo_count=1,
            language_totals={},
            projects=[],
            top_repos=[],
        )
        status = ScanStatus(
            scan_id="done-uuid",
            status="done",
            progress_pct=100.0,
            summary=summary,
        )
        assert status.summary is not None
        assert status.summary.org == "my-org"

    def test_error_status_carries_message(self):
        """ScanStatus with status='error' stores the error string."""
        status = ScanStatus(
            scan_id="err-uuid",
            status="error",
            progress_pct=0.0,
            error="connection refused",
        )
        assert status.error == "connection refused"

    def test_invalid_progress_type_raises(self):
        """ScanStatus raises ValidationError when progress_pct is non-numeric."""
        with pytest.raises(ValidationError):
            ScanStatus(
                scan_id="x",
                status="running",
                progress_pct="not-a-float",  # type: ignore[arg-type]
            )
