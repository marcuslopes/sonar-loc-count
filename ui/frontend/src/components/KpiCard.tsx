import type { ReactNode } from 'react'
import clsx from 'clsx'

interface KpiCardProps {
  /** Display label shown above the value (used internally) */
  label?: string
  /** Alias for label — matches the test-expected API */
  title?: string
  value: ReactNode
  sub?: string
  accent?: boolean
  /** 'warning' applies a red border accent */
  variant?: 'default' | 'warning'
  className?: string
}

export default function KpiCard({
  label,
  title,
  value,
  sub,
  accent = false,
  variant,
  className,
}: KpiCardProps) {
  const displayLabel = label ?? title ?? ''
  const isWarning = variant === 'warning'

  return (
    <div
      className={clsx(
        'rounded-xl border px-6 py-5 flex flex-col gap-1',
        isWarning && 'warning',
        className,
      )}
      style={{
        backgroundColor: 'var(--color-card)',
        borderColor: isWarning
          ? 'rgba(239,68,68,0.4)'
          : accent
          ? 'rgba(247,148,29,0.4)'
          : 'var(--color-border)',
        boxShadow: isWarning
          ? '0 0 20px rgba(239,68,68,0.08)'
          : accent
          ? '0 0 20px rgba(247,148,29,0.08)'
          : undefined,
      }}
    >
      <p className="text-xs font-medium uppercase tracking-widest" style={{ color: 'var(--color-muted)' }}>
        {displayLabel}
      </p>
      <div
        className="text-3xl font-bold mt-1 leading-none"
        style={{
          color: isWarning ? '#fca5a5' : accent ? 'var(--color-accent)' : 'var(--color-text)',
        }}
      >
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
      {sub && (
        <p className="text-xs mt-1" style={{ color: 'var(--color-muted)' }}>
          {sub}
        </p>
      )}
    </div>
  )
}
