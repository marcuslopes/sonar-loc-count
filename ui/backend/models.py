"""Pydantic v2 models for the LoC analysis dashboard."""

from __future__ import annotations

from pydantic import BaseModel


class LanguageStats(BaseModel):
    language: str
    code: int
    comment: int
    blank: int


class BranchResult(BaseModel):
    name: str
    loc: int  # sum of code lines across all languages for this branch
    languages: list[LanguageStats]


class RepoResult(BaseModel):
    name: str
    project: str
    branches: list[BranchResult]
    max_loc: int  # highest loc across all branches
    max_branch: str  # name of the branch with the highest loc


class ProjectResult(BaseModel):
    name: str
    repos: list[RepoResult]
    total_loc: int  # sum of max_loc across all repos in this project


class ScanSummary(BaseModel):
    org: str
    total_loc: int
    project_count: int
    repo_count: int
    language_totals: dict[str, int]  # language name -> total code lines across all repos
    projects: list[ProjectResult]
    top_repos: list[RepoResult]  # top 20 repos sorted by max_loc descending


class ScanStatus(BaseModel):
    scan_id: str
    status: str  # "running" | "done" | "error"
    progress_pct: float
    summary: ScanSummary | None = None
    error: str | None = None
