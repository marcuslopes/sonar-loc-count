import { useState, type FormEvent } from 'react'
import { startScan } from '../lib/api'

interface ConfigPageProps {
  onScanStart: (scanId: string, org: string) => void
}

export default function ConfigPage({ onScanStart }: ConfigPageProps) {
  const [org, setOrg] = useState('')
  const [token, setToken] = useState('')
  const [project, setProject] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!org.trim() || !token.trim()) return

    setLoading(true)
    setError(null)

    try {
      const result = await startScan(token.trim(), org.trim(), project.trim() || undefined)
      onScanStart(result.scan_id, org.trim())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start scan. Please check your credentials.')
      setLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 py-12"
      style={{ backgroundColor: 'var(--color-bg)' }}
    >
      {/* Header */}
      <div className="mb-10 text-center">
        <div className="flex items-center justify-center gap-3 mb-3">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl font-black text-white shadow-lg"
            style={{ backgroundColor: 'var(--color-accent)' }}
          >
            S
          </div>
          <h1
            className="text-3xl font-bold tracking-tight"
            style={{ color: 'var(--color-text)' }}
          >
            Azure DevOps LoC Analyser
          </h1>
        </div>
        <p style={{ color: 'var(--color-muted)' }} className="text-sm">
          Powered by SonarQube licensing intelligence
        </p>
      </div>

      {/* Card */}
      <div
        className="w-full max-w-md rounded-2xl shadow-2xl border"
        style={{
          backgroundColor: 'var(--color-card)',
          borderColor: 'var(--color-border)',
        }}
      >
        <div className="px-8 py-8">
          <h2
            className="text-lg font-semibold mb-1"
            style={{ color: 'var(--color-text)' }}
          >
            Connect to Azure DevOps
          </h2>
          <p className="text-sm mb-6" style={{ color: 'var(--color-muted)' }}>
            Enter your organisation details to begin the analysis
          </p>

          <form onSubmit={(e) => { void handleSubmit(e) }} className="space-y-5">
            {/* Org field */}
            <div>
              <label
                htmlFor="org"
                className="block text-sm font-medium mb-1.5"
                style={{ color: 'var(--color-text)' }}
              >
                Azure DevOps Organisation
                <span style={{ color: 'var(--color-accent)' }}> *</span>
              </label>
              <input
                id="org"
                type="text"
                value={org}
                onChange={(e) => setOrg(e.target.value)}
                placeholder="mycompany"
                required
                className="w-full px-4 py-2.5 rounded-lg text-sm outline-none transition-all border focus:ring-2"
                style={{
                  backgroundColor: '#0f1923',
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-text)',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'var(--color-accent)'
                  e.currentTarget.style.boxShadow = '0 0 0 2px rgba(247,148,29,0.15)'
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'var(--color-border)'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              />
              <p className="text-xs mt-1" style={{ color: 'var(--color-muted)' }}>
                The part after dev.azure.com/
              </p>
            </div>

            {/* Token field */}
            <div>
              <label
                htmlFor="token"
                className="block text-sm font-medium mb-1.5"
                style={{ color: 'var(--color-text)' }}
              >
                Personal Access Token
                <span style={{ color: 'var(--color-accent)' }}> *</span>
              </label>
              <input
                id="token"
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="PAT with Code > Read"
                required
                className="w-full px-4 py-2.5 rounded-lg text-sm outline-none transition-all border"
                style={{
                  backgroundColor: '#0f1923',
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-text)',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'var(--color-accent)'
                  e.currentTarget.style.boxShadow = '0 0 0 2px rgba(247,148,29,0.15)'
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'var(--color-border)'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              />
              <p className="text-xs mt-1" style={{ color: 'var(--color-muted)' }}>
                Requires{' '}
                <span style={{ color: 'var(--color-accent)' }}>Code &gt; Read</span> scope
              </p>
            </div>

            {/* Project filter field */}
            <div>
              <label
                htmlFor="project"
                className="block text-sm font-medium mb-1.5"
                style={{ color: 'var(--color-text)' }}
              >
                Project Filter{' '}
                <span className="font-normal" style={{ color: 'var(--color-muted)' }}>
                  (optional)
                </span>
              </label>
              <input
                id="project"
                type="text"
                value={project}
                onChange={(e) => setProject(e.target.value)}
                placeholder="Leave empty to scan all projects"
                className="w-full px-4 py-2.5 rounded-lg text-sm outline-none transition-all border"
                style={{
                  backgroundColor: '#0f1923',
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-text)',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'var(--color-accent)'
                  e.currentTarget.style.boxShadow = '0 0 0 2px rgba(247,148,29,0.15)'
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'var(--color-border)'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              />
            </div>

            {/* Error */}
            {error && (
              <div
                className="px-4 py-3 rounded-lg text-sm border"
                style={{
                  backgroundColor: 'rgba(239,68,68,0.1)',
                  borderColor: 'rgba(239,68,68,0.3)',
                  color: '#fca5a5',
                }}
              >
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading || !org.trim() || !token.trim()}
              className="w-full py-3 px-6 rounded-lg font-semibold text-sm transition-all duration-200 mt-2 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                backgroundColor: 'var(--color-accent)',
                color: '#fff',
              }}
              onMouseEnter={(e) => {
                if (!loading) e.currentTarget.style.backgroundColor = '#e8850f'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--color-accent)'
              }}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg
                    className="animate-spin h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  Starting scan…
                </span>
              ) : (
                'Start Analysis'
              )}
            </button>
          </form>
        </div>

        {/* Footer note */}
        <div
          className="px-8 py-4 rounded-b-2xl border-t text-xs"
          style={{
            borderColor: 'var(--color-border)',
            color: 'var(--color-muted)',
            backgroundColor: 'rgba(0,0,0,0.15)',
          }}
        >
          This tool counts lines of code across all repositories in your Azure DevOps
          organisation to help right-size your SonarQube licence. Your PAT is never
          stored — it is used only during the scan session.
        </div>
      </div>

      {/* Bottom decoration */}
      <p className="mt-8 text-xs" style={{ color: 'var(--color-muted)' }}>
        Azure DevOps LoC Analyser &mdash; SonarQube Licence Intelligence
      </p>
    </div>
  )
}
