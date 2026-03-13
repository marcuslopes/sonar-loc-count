import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import type { RepoResult } from '../types'

interface TopReposChartProps {
  repos: RepoResult[]
}

interface TooltipPayloadEntry {
  value: number
}

interface CustomTooltipProps {
  active?: boolean
  payload?: TooltipPayloadEntry[]
  label?: string
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null
  return (
    <div
      className="px-3 py-2 rounded-lg shadow-lg text-xs border"
      style={{
        backgroundColor: '#0f1923',
        borderColor: 'var(--color-border)',
        color: 'var(--color-text)',
      }}
    >
      <p className="font-semibold mb-1" style={{ color: 'var(--color-text)' }}>
        {label}
      </p>
      <p style={{ color: 'var(--color-accent)' }}>
        {payload[0].value.toLocaleString()} LoC
      </p>
    </div>
  )
}

const GRADIENT_COLORS = [
  '#f7941d',
  '#f89d31',
  '#f9a644',
  '#faaf58',
  '#fbb86b',
  '#fcc17f',
  '#fdca92',
  '#fdd3a6',
  '#fddcb9',
  '#fee5cc',
  '#feeedf',
  '#fff0e6',
  '#fff5ee',
  '#fff8f4',
  '#fffcfa',
]

export default function TopReposChart({ repos }: TopReposChartProps) {
  const data = repos
    .slice(0, 15)
    .sort((a, b) => b.max_loc - a.max_loc)
    .map((r) => ({
      name: r.name.length > 28 ? r.name.slice(0, 25) + '…' : r.name,
      fullName: r.name,
      loc: r.max_loc,
    }))

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48" style={{ color: 'var(--color-muted)' }}>
        No data
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={Math.max(280, data.length * 36)}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 0, right: 40, left: 8, bottom: 0 }}
      >
        <CartesianGrid
          strokeDasharray="3 3"
          horizontal={false}
          stroke="rgba(36,52,71,0.8)"
        />
        <XAxis
          type="number"
          tickFormatter={(v: number) =>
            v >= 1_000_000
              ? `${(v / 1_000_000).toFixed(1)}M`
              : v >= 1_000
              ? `${(v / 1_000).toFixed(0)}K`
              : String(v)
          }
          tick={{ fill: 'var(--color-muted)', fontSize: 11 }}
          axisLine={{ stroke: 'var(--color-border)' }}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="name"
          width={160}
          tick={{ fill: '#cbd5e1', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(247,148,29,0.06)' }} />
        <Bar dataKey="loc" radius={[0, 4, 4, 0]} maxBarSize={22}>
          {data.map((_, index) => (
            <Cell
              key={`cell-${index}`}
              fill={GRADIENT_COLORS[Math.min(index, GRADIENT_COLORS.length - 1)]}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
