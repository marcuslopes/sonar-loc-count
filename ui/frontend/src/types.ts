export interface LanguageStats {
  language: string
  code: number
  comment: number
  blank: number
}

export interface BranchResult {
  name: string
  loc: number
  languages: LanguageStats[]
}

export interface RepoResult {
  name: string
  project: string
  branches: BranchResult[]
  max_loc: number
  max_branch: string
}

export interface ProjectResult {
  name: string
  repos: RepoResult[]
  total_loc: number
}

export interface ScanSummary {
  org: string
  total_loc: number
  project_count: number
  repo_count: number
  language_totals: Record<string, number>
  projects: ProjectResult[]
  top_repos: RepoResult[]
}

// SSE event types
export interface ProgressEvent {
  type: 'progress'
  message: string
  pct: number
}

export interface RepoDoneEvent {
  type: 'repo_done'
  project: string
  repo: string
  max_loc: number
}

export interface DoneEvent {
  type: 'done'
  summary: ScanSummary
}

export interface ErrorEvent {
  type: 'error'
  message: string
}

export type ScanEvent = ProgressEvent | RepoDoneEvent | DoneEvent | ErrorEvent
