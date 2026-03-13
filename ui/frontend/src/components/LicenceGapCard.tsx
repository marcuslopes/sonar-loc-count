import { useState } from 'react'

interface LicenceGapCardProps {
  totalLoc: number
}

export default function LicenceGapCard({ totalLoc }: LicenceGapCardProps) {
  const [licenceLoc, setLicenceLoc] = useState(0)

  const gap = totalLoc - licenceLoc
  const hasGap = gap > 0
  const coveragePct = licenceLoc > 0 ? Math.min(100, (licenceLoc / totalLoc) * 100) : 0

  return (
    <div
      className="rounded-xl border px-6 py-5 flex flex-col gap-3"
      style={{
        backgroundColor: 'var(--color-card)',
        borderColor: hasGap ? 'rgba(239,68,68,0.35)' : 'rgba(34,197,94,0.35)',
        boxShadow: hasGap
          ? '0 0 20px rgba(239,68,68,0.06)'
          : '0 0 20px rgba(34,197,94,0.06)',
      }}
    >
      <p className="text-xs font-medium uppercase tracking-widest" style={{ color: 'var(--color-muted)' }}>
        Licence Gap
      </p>

      {/* Total LoC display */}
      <div>
        <p className="text-xs mb-0.5" style={{ color: 'var(--color-muted)' }}>
          Scanned total
        </p>
        <p className="text-2xl font-bold leading-none" style={{ color: 'var(--color-accent)' }}>
          {totalLoc.toLocaleString()}
        </p>
      </div>

      {/* Input */}
      <div>
        <label
          htmlFor="licence-input"
          className="block text-xs mb-1"
          style={{ color: 'var(--color-muted)' }}
        >
          Current SonarQube licence (LoC)
        </label>
        <input
          id="licence-input"
          type="number"
          min={0}
          value={licenceLoc === 0 ? '' : licenceLoc}
          placeholder="0"
          onChange={(e) => setLicenceLoc(parseInt(e.target.value || '0', 10))}
          className="w-full px-3 py-1.5 rounded-lg text-sm border outline-none"
          style={{
            backgroundColor: '#0f1923',
            borderColor: 'var(--color-border)',
            color: 'var(--color-text)',
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = 'var(--color-accent)'
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = 'var(--color-border)'
          }}
        />
      </div>

      {/* Coverage bar */}
      {licenceLoc > 0 && (
        <div>
          <div
            className="w-full h-1.5 rounded-full overflow-hidden"
            style={{ backgroundColor: '#0f1923' }}
          >
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${coveragePct}%`,
                backgroundColor: hasGap ? '#ef4444' : '#22c55e',
              }}
            />
          </div>
          <p className="text-xs mt-1" style={{ color: 'var(--color-muted)' }}>
            {coveragePct.toFixed(1)}% covered
          </p>
        </div>
      )}

      {/* Result */}
      <div
        className="rounded-lg px-3 py-2.5 text-sm font-semibold flex items-center gap-2"
        style={{
          backgroundColor: hasGap ? 'rgba(239,68,68,0.12)' : 'rgba(34,197,94,0.12)',
          color: hasGap ? '#fca5a5' : '#86efac',
        }}
      >
        {hasGap ? (
          <>
            <span className="text-base">🔴</span>
            <span>
              Deficit:{' '}
              <span className="font-bold text-red-400">
                {gap.toLocaleString()}
              </span>{' '}
              LoC short
            </span>
          </>
        ) : (
          <>
            <span className="text-base">✅</span>
            <span>
              Covered — surplus{' '}
              <span className="font-bold" style={{ color: '#86efac' }}>
                {Math.abs(gap).toLocaleString()}
              </span>{' '}
              LoC
            </span>
          </>
        )}
      </div>
    </div>
  )
}
