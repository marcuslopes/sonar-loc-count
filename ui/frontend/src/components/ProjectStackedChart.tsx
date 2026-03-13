import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import type { ProjectResult } from '../types'

interface ProjectStackedChartProps {
  projects: ProjectResult[]
  languageTotals: Record<string, number>
}

const LANG_COLORS: Record<string, string> = {
  TypeScript: '#3b82f6',
  JavaScript: '#eab308',
  Python: '#22c55e',
  Java: '#ef4444',
  'C#': '#a855f7',
  Go: '#06b6d4',
  Ruby: '#ec4899',
  PHP: '#8b5cf6',
  'C++': '#f97316',
  C: '#64748b',
  Rust: '#b45309',
  Swift: '#f59e0b',
  Kotlin: '#7c3aed',
  Scala: '#dc2626',
  HTML: '#fb923c',
  CSS: '#60a5fa',
  Other: '#6b7280',
}

function getColor(lang: string, idx: number): string {
  if (lang in LANG_COLORS) return LANG_COLORS[lang]
  const fallback = ['#f7941d', '#3b82f6', '#22c55e', '#a855f7', '#ef4444', '#06b6d4']
  return fallback[idx % fallback.length]
}

interface TooltipPayloadEntry {
  name: string
  value: number
  fill: string
}

interface CustomTooltipProps {
  active?: boolean
  payload?: TooltipPayloadEntry[]
  label?: string
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null
  const total = payload.reduce((s, e) => s + e.value, 0)
  return (
    <div
      className="px-3 py-2 rounded-lg shadow-lg text-xs border min-w-[160px]"
      style={{
        backgroundColor: '#0f1923',
        borderColor: 'var(--color-border)',
        color: 'var(--color-text)',
      }}
    >
      <p className="font-semibold mb-2">{label}</p>
      {payload
        .slice()
        .reverse()
        .map((entry) => (
          <div key={entry.name} className="flex justify-between gap-4 mb-0.5">
            <span style={{ color: entry.fill }}>{entry.name}</span>
            <span style={{ color: 'var(--color-text)' }}>{entry.value.toLocaleString()}</span>
          </div>
        ))}
      <div
        className="flex justify-between gap-4 mt-1.5 pt-1.5 border-t font-semibold"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <span style={{ color: 'var(--color-muted)' }}>Total</span>
        <span style={{ color: 'var(--color-accent)' }}>{total.toLocaleString()}</span>
      </div>
    </div>
  )
}

export default function ProjectStackedChart({
  projects,
  languageTotals,
}: ProjectStackedChartProps) {
  // Get top 5 languages overall
  const top5Langs = Object.entries(languageTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([lang]) => lang)

  // Build chart data per project
  const data = projects
    .slice(0, 12)
    .sort((a, b) => b.total_loc - a.total_loc)
    .map((project) => {
      // Aggregate language totals across all repos/branches in this project
      const langMap: Record<string, number> = {}
      for (const repo of project.repos) {
        for (const branch of repo.branches) {
          for (const ls of branch.languages) {
            langMap[ls.language] = (langMap[ls.language] ?? 0) + ls.code
          }
        }
      }

      const row: Record<string, string | number> = {
        name: project.name.length > 16 ? project.name.slice(0, 14) + '…' : project.name,
      }

      let otherLoc = 0
      for (const [lang, loc] of Object.entries(langMap)) {
        if (top5Langs.includes(lang)) {
          row[lang] = loc
        } else {
          otherLoc += loc
        }
      }
      if (otherLoc > 0) row['Other'] = otherLoc

      return row
    })

  const allLangs = [...top5Langs, 'Other']

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48" style={{ color: 'var(--color-muted)' }}>
        No data
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(36,52,71,0.8)" />
        <XAxis
          dataKey="name"
          tick={{ fill: 'var(--color-muted)', fontSize: 11 }}
          axisLine={{ stroke: 'var(--color-border)' }}
          tickLine={false}
        />
        <YAxis
          tickFormatter={(v: number) =>
            v >= 1_000_000
              ? `${(v / 1_000_000).toFixed(1)}M`
              : v >= 1_000
              ? `${(v / 1_000).toFixed(0)}K`
              : String(v)
          }
          tick={{ fill: 'var(--color-muted)', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(247,148,29,0.04)' }} />
        <Legend
          iconType="square"
          iconSize={10}
          formatter={(value: string) => (
            <span style={{ color: 'var(--color-muted)', fontSize: 11 }}>{value}</span>
          )}
        />
        {allLangs.map((lang, idx) => (
          <Bar
            key={lang}
            dataKey={lang}
            stackId="a"
            fill={getColor(lang, idx)}
            maxBarSize={40}
            radius={idx === allLangs.length - 1 ? [4, 4, 0, 0] : undefined}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}
