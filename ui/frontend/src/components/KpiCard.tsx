import type { ReactNode } from 'react'
import clsx from 'clsx'

interface KpiCardProps {
  label: string
  value: ReactNode
  sub?: string
  accent?: boolean
  className?: string
}

export default function KpiCard({ label, value, sub, accent = false, className }: KpiCardProps) {
  return (
    <div
      className={clsx(
        'rounded-xl border px-6 py-5 flex flex-col gap-1',
        className,
      )}
      style={{
        backgroundColor: 'var(--color-card)',
        borderColor: accent ? 'rgba(247,148,29,0.4)' : 'var(--color-border)',
        boxShadow: accent ? '0 0 20px rgba(247,148,29,0.08)' : undefined,
      }}
    >
      <p className="text-xs font-medium uppercase tracking-widest" style={{ color: 'var(--color-muted)' }}>
        {label}
      </p>
      <div
        className="text-3xl font-bold mt-1 leading-none"
        style={{ color: accent ? 'var(--color-accent)' : 'var(--color-text)' }}
      >
        {value}
      </div>
      {sub && (
        <p className="text-xs mt-1" style={{ color: 'var(--color-muted)' }}>
          {sub}
        </p>
      )}
    </div>
  )
}
