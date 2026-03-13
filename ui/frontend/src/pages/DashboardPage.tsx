import type { ScanSummary } from '../types'
import { getExportUrl } from '../lib/api'
import KpiCard from '../components/KpiCard'
import LicenceGapCard from '../components/LicenceGapCard'
import TopReposChart from '../components/TopReposChart'
import LanguageDonut from '../components/LanguageDonut'
import ProjectDonut from '../components/ProjectDonut'
import ProjectStackedChart from '../components/ProjectStackedChart'
import RepoTable from '../components/RepoTable'

interface DashboardPageProps {
  summary: ScanSummary
  scanId: string
  onReset: () => void
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="text-sm font-semibold uppercase tracking-widest mb-4"
      style={{ color: 'var(--color-muted)' }}
    >
      {children}
    </h2>
  )
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="rounded-xl border p-6"
      style={{
        backgroundColor: 'var(--color-card)',
        borderColor: 'var(--color-border)',
      }}
    >
      <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--color-text)' }}>
        {title}
      </h3>
      {children}
    </div>
  )
}

function handleExport(scanId: string, format: 'csv' | 'pdf') {
  const url = getExportUrl(scanId, format)
  window.open(url, '_blank')
}

export default function DashboardPage({ summary, scanId, onReset }: DashboardPageProps) {
  const scanDate = new Date().toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })

  const languageCount = Object.keys(summary.language_totals).length

  // Flatten all repos for the table
  const allRepos = summary.projects.flatMap((p) => p.repos)

  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: 'var(--color-bg)' }}
    >
      {/* Header bar */}
      <header
        className="sticky top-0 z-10 border-b px-8 py-4"
        style={{
          backgroundColor: 'rgba(15,25,35,0.95)',
          borderColor: 'var(--color-border)',
          backdropFilter: 'blur(8px)',
        }}
      >
        <div className="max-w-screen-xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center text-lg font-black text-white flex-shrink-0"
              style={{ backgroundColor: 'var(--color-accent)' }}
            >
              S
            </div>
            <div>
              <h1 className="text-base font-bold leading-tight" style={{ color: 'var(--color-text)' }}>
                {summary.org}
              </h1>
              <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
                Scanned {scanDate}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleExport(scanId, 'csv')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors"
              style={{
                borderColor: 'var(--color-border)',
                color: 'var(--color-muted)',
                backgroundColor: 'transparent',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--color-accent)'
                e.currentTarget.style.color = 'var(--color-accent)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--color-border)'
                e.currentTarget.style.color = 'var(--color-muted)'
              }}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
              </svg>
              Export CSV
            </button>
            <button
              onClick={() => handleExport(scanId, 'pdf')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors"
              style={{
                borderColor: 'var(--color-border)',
                color: 'var(--color-muted)',
                backgroundColor: 'transparent',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#a855f7'
                e.currentTarget.style.color = '#a855f7'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--color-border)'
                e.currentTarget.style.color = 'var(--color-muted)'
              }}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              Export PDF
            </button>
            <button
              onClick={onReset}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ml-2"
              style={{
                borderColor: 'rgba(247,148,29,0.4)',
                color: 'var(--color-accent)',
                backgroundColor: 'rgba(247,148,29,0.08)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(247,148,29,0.15)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(247,148,29,0.08)'
              }}
            >
              ← New Scan
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-screen-xl mx-auto px-8 py-8 space-y-10">
        {/* KPI Cards */}
        <section>
          <SectionTitle>Overview</SectionTitle>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              label="Total Lines of Code"
              value={summary.total_loc.toLocaleString()}
              sub={`across ${summary.repo_count} repositories`}
              accent
            />
            <KpiCard
              label="Repositories Scanned"
              value={summary.repo_count.toLocaleString()}
              sub={`in ${summary.project_count} projects`}
            />
            <KpiCard
              label="Languages Detected"
              value={languageCount.toLocaleString()}
              sub="unique programming languages"
            />
            <LicenceGapCard totalLoc={summary.total_loc} />
          </div>
        </section>

        {/* Top Repos Chart */}
        <section>
          <SectionTitle>Top Repositories by Lines of Code</SectionTitle>
          <ChartCard title="Top 15 Repositories">
            <TopReposChart repos={summary.top_repos.length > 0 ? summary.top_repos : allRepos} />
          </ChartCard>
        </section>

        {/* Donuts */}
        <section>
          <SectionTitle>Language &amp; Project Breakdown</SectionTitle>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartCard title="LoC by Language">
              <LanguageDonut languageTotals={summary.language_totals} />
            </ChartCard>
            <ChartCard title="LoC by Project">
              <ProjectDonut projects={summary.projects} />
            </ChartCard>
          </div>
        </section>

        {/* Stacked chart */}
        <section>
          <SectionTitle>Project Composition by Language</SectionTitle>
          <ChartCard title="Lines of Code per Project — stacked by top 5 languages">
            <ProjectStackedChart
              projects={summary.projects}
              languageTotals={summary.language_totals}
            />
          </ChartCard>
        </section>

        {/* Repo table */}
        <section>
          <SectionTitle>All Repositories</SectionTitle>
          <div
            className="rounded-xl border p-6"
            style={{
              backgroundColor: 'var(--color-card)',
              borderColor: 'var(--color-border)',
            }}
          >
            <RepoTable repos={allRepos} />
          </div>
        </section>

        {/* Footer */}
        <footer className="pb-8 pt-4 text-center">
          <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
            Azure DevOps LoC Analyser &mdash; SonarQube Licence Intelligence &mdash; Generated {scanDate}
          </p>
        </footer>
      </main>
    </div>
  )
}
