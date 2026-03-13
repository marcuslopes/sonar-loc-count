import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import type { ProjectResult } from '../types'

interface ProjectDonutProps {
  projects: ProjectResult[]
}

const COLORS = [
  '#3b82f6',
  '#f7941d',
  '#22c55e',
  '#a855f7',
  '#ef4444',
  '#06b6d4',
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
      <p style={{ color: '#3b82f6' }}>{item.value.toLocaleString()} LoC</p>
      <p style={{ color: 'var(--color-muted)' }}>{item.payload.pct.toFixed(1)}%</p>
    </div>
  )
}

export default function ProjectDonut({ projects }: ProjectDonutProps) {
  const sorted = [...projects].sort((a, b) => b.total_loc - a.total_loc)
  const top6 = sorted.slice(0, 6)
  const otherSum = sorted.slice(6).reduce((s, p) => s + p.total_loc, 0)
  const total = sorted.reduce((s, p) => s + p.total_loc, 0)

  const data = [
    ...top6.map((p) => ({
      name: p.name,
      value: p.total_loc,
      pct: total > 0 ? (p.total_loc / total) * 100 : 0,
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
