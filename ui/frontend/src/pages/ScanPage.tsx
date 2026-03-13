import { useEffect, useRef, useState } from 'react'
import { streamScan } from '../lib/api'
import type { RepoDoneEvent, ScanSummary } from '../types'

interface ScanPageProps {
  scanId: string
  org: string
  onComplete: (summary: ScanSummary) => void
  onReset: () => void
}

interface LogEntry {
  id: number
  project: string
  repo: string
  max_loc: number
}

export default function ScanPage({ scanId, org, onComplete, onReset }: ScanPageProps) {
  const [progress, setProgress] = useState(0)
  const [message, setMessage] = useState('Connecting to Azure DevOps…')
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const logEndRef = useRef<HTMLDivElement>(null)
  const logIdRef = useRef(0)

  useEffect(() => {
    const cleanup = streamScan(scanId, (event) => {
      if (event.type === 'progress') {
        setMessage(event.message)
        setProgress(event.pct)
      } else if (event.type === 'repo_done') {
        const e = event as RepoDoneEvent
        setLogs((prev) => [
          ...prev,
          { id: ++logIdRef.current, project: e.project, repo: e.repo, max_loc: e.max_loc },
        ])
      } else if (event.type === 'done') {
        setDone(true)
        setProgress(100)
        setMessage('Analysis complete!')
        setTimeout(() => onComplete(event.summary), 800)
      } else if (event.type === 'error') {
        setError(event.message)
      }
    })

    return cleanup
  }, [scanId, onComplete])

  // Auto-scroll log to bottom
  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs])

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 py-12"
      style={{ backgroundColor: 'var(--color-bg)' }}
    >
      {/* Header */}
      <div className="mb-8 text-center">
        <div className="flex items-center justify-center gap-3 mb-2">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center text-xl font-black text-white"
            style={{ backgroundColor: 'var(--color-accent)' }}
          >
            S
          </div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>
            Azure DevOps LoC Analyser
          </h1>
        </div>
        <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
          Scanning organisation:{' '}
          <span style={{ color: 'var(--color-accent)' }} className="font-semibold">
            {org}
          </span>
        </p>
      </div>

      <div
        className="w-full max-w-2xl rounded-2xl border shadow-2xl overflow-hidden"
        style={{
          backgroundColor: 'var(--color-card)',
          borderColor: 'var(--color-border)',
        }}
      >
        {/* Status bar */}
        <div className="px-8 py-6 border-b" style={{ borderColor: 'var(--color-border)' }}>
          {error ? (
            <div
              className="flex items-start gap-3 px-4 py-3 rounded-lg border"
              style={{
                backgroundColor: 'rgba(239,68,68,0.1)',
                borderColor: 'rgba(239,68,68,0.3)',
              }}
            >
              <span className="text-red-400 text-lg">✕</span>
              <div>
                <p className="font-semibold text-red-400 text-sm">Scan Error</p>
                <p className="text-sm mt-0.5" style={{ color: '#fca5a5' }}>
                  {error}
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-4">
                {done ? (
                  <div
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: '#22c55e' }}
                  />
                ) : (
                  <div
                    className="w-3 h-3 rounded-full flex-shrink-0 animate-pulse-dot"
                    style={{ backgroundColor: 'var(--color-accent)' }}
                  />
                )}
                <p className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
                  {done ? 'Scan complete — redirecting to dashboard…' : 'Scanning repositories…'}
                </p>
              </div>

              {/* Progress bar */}
              <div
                className="w-full h-2 rounded-full overflow-hidden"
                style={{ backgroundColor: '#0f1923' }}
              >
                <div
                  className={`h-full rounded-full transition-all duration-500 ${!done ? 'progress-bar-shimmer' : ''}`}
                  style={{
                    width: `${progress}%`,
                    backgroundColor: done ? '#22c55e' : 'var(--color-accent)',
                  }}
                />
              </div>

              <div className="flex justify-between mt-2">
                <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
                  {message}
                </p>
                <p
                  className="text-xs font-semibold"
                  style={{ color: 'var(--color-accent)' }}
                >
                  {Math.round(progress)}%
                </p>
              </div>
            </>
          )}
        </div>

        {/* Log area */}
        <div
          className="h-72 overflow-y-auto px-8 py-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.2)' }}
        >
          {logs.length === 0 && !error && (
            <p className="text-xs text-center py-8" style={{ color: 'var(--color-muted)' }}>
              Repository events will appear here as they are processed…
            </p>
          )}
          {logs.map((entry) => (
            <div
              key={entry.id}
              className="flex items-center justify-between py-1.5 border-b animate-slide-in"
              style={{ borderColor: 'rgba(36,52,71,0.5)' }}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span style={{ color: '#22c55e' }} className="text-xs flex-shrink-0">
                  ✓
                </span>
                <span className="text-xs truncate" style={{ color: 'var(--color-muted)' }}>
                  <span style={{ color: 'var(--color-text)' }}>{entry.project}</span>
                  {' / '}
                  <span style={{ color: 'var(--color-text)' }}>{entry.repo}</span>
                </span>
              </div>
              <span
                className="text-xs font-mono flex-shrink-0 ml-4"
                style={{ color: 'var(--color-accent)' }}
              >
                {entry.max_loc.toLocaleString()} LoC
              </span>
            </div>
          ))}
          <div ref={logEndRef} />
        </div>

        {/* Footer */}
        <div
          className="px-8 py-4 border-t flex justify-between items-center"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
            {logs.length} {logs.length === 1 ? 'repository' : 'repositories'} processed
          </p>
          {error && (
            <button
              onClick={onReset}
              className="text-xs px-4 py-1.5 rounded-lg border transition-colors"
              style={{
                borderColor: 'var(--color-border)',
                color: 'var(--color-muted)',
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
              ← Start Over
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
