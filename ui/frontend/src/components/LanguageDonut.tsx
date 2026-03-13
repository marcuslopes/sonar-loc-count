import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'

interface LanguageDonutProps {
  languageTotals: Record<string, number>
}

const COLORS = [
  '#f7941d',
  '#3b82f6',
  '#22c55e',
  '#a855f7',
  '#ef4444',
  '#06b6d4',
  '#eab308',
  '#ec4899',
  '#6b7280',
]

interface TooltipPayloadEntry {
  name: string
  value: number
  payload: { pct: number }
}

interface CustomTooltipProps {
  active?: boolean
  payload?: TooltipPayloadEntry[]
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload?.length) return null
  const item = payload[0]
  return (
    <div
      className="px-3 py-2 rounded-lg shadow-lg text-xs border"
      style={{
        backgroundColor: '#0f1923',
        borderColor: 'var(--color-border)',
        color: 'var(--color-text)',
      }}
    >
      <p className="font-semibold mb-1">{item.name}</p>
      <p style={{ color: 'var(--color-accent)' }}>{item.value.toLocaleString()} LoC</p>
      <p style={{ color: 'var(--color-muted)' }}>{item.payload.pct.toFixed(1)}%</p>
    </div>
  )
}

export default function LanguageDonut({ languageTotals }: LanguageDonutProps) {
  const entries = Object.entries(languageTotals).sort((a, b) => b[1] - a[1])
  const top8 = entries.slice(0, 8)
  const otherSum = entries.slice(8).reduce((s, [, v]) => s + v, 0)
  const total = entries.reduce((s, [, v]) => s + v, 0)

  const data = [
    ...top8.map(([language, loc]) => ({
      name: language,
      value: loc,
      pct: total > 0 ? (loc / total) * 100 : 0,
    })),
    ...(otherSum > 0
      ? [{ name: 'Other', value: otherSum, pct: total > 0 ? (otherSum / total) * 100 : 0 }]
      : []),
  ]

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48" style={{ color: 'var(--color-muted)' }}>
        No data
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="45%"
          innerRadius={60}
          outerRadius={90}
          paddingAngle={2}
          dataKey="value"
          stroke="none"
        >
          {data.map((_, index) => (
            <Cell
              key={`cell-${index}`}
              fill={COLORS[index % COLORS.length]}
            />
          ))}
        </Pie>
        <Tooltip content={<CustomTooltip />} />
        <Legend
          iconType="circle"
          iconSize={8}
          formatter={(value: string) => (
            <span style={{ color: 'var(--color-muted)', fontSize: 11 }}>{value}</span>
          )}
        />
      </PieChart>
    </ResponsiveContainer>
  )
}
