import { useState, useMemo } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  getFilteredRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
} from '@tanstack/react-table'
import type { RepoResult } from '../types'

interface RepoRow {
  project: string
  name: string
  max_loc: number
  max_branch: string
  top_language: string
}

interface RepoTableProps {
  repos: RepoResult[]
}

function getTopLanguage(repo: RepoResult): string {
  const langMap: Record<string, number> = {}
  for (const branch of repo.branches) {
    if (branch.name === repo.max_branch || repo.branches.length === 1) {
      for (const ls of branch.languages) {
        langMap[ls.language] = (langMap[ls.language] ?? 0) + ls.code
      }
    }
  }
  if (Object.keys(langMap).length === 0) {
    // Fallback: aggregate all branches
    for (const branch of repo.branches) {
      for (const ls of branch.languages) {
        langMap[ls.language] = (langMap[ls.language] ?? 0) + ls.code
      }
    }
  }
  const sorted = Object.entries(langMap).sort((a, b) => b[1] - a[1])
  return sorted[0]?.[0] ?? '—'
}

const colHelper = createColumnHelper<RepoRow>()

const columns = [
  colHelper.accessor('project', {
    header: 'Project',
    cell: (info) => (
      <span className="font-medium" style={{ color: 'var(--color-text)' }}>
        {info.getValue()}
      </span>
    ),
  }),
  colHelper.accessor('name', {
    header: 'Repository',
    cell: (info) => (
      <span style={{ color: '#93c5fd' }}>{info.getValue()}</span>
    ),
  }),
  colHelper.accessor('max_loc', {
    header: 'Max LoC',
    cell: (info) => (
      <span
        className="font-mono font-semibold"
        style={{ color: 'var(--color-accent)' }}
      >
        {info.getValue().toLocaleString()}
      </span>
    ),
  }),
  colHelper.accessor('max_branch', {
    header: 'Best Branch',
    cell: (info) => (
      <span
        className="text-xs px-2 py-0.5 rounded font-mono"
        style={{
          backgroundColor: 'rgba(59,130,246,0.12)',
          color: '#93c5fd',
        }}
      >
        {info.getValue()}
      </span>
    ),
  }),
  colHelper.accessor('top_language', {
    header: 'Top Language',
    cell: (info) => (
      <span
        className="text-xs px-2 py-0.5 rounded"
        style={{
          backgroundColor: 'rgba(34,197,94,0.12)',
          color: '#86efac',
        }}
      >
        {info.getValue()}
      </span>
    ),
  }),
]

export default function RepoTable({ repos }: RepoTableProps) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'max_loc', desc: true },
  ])
  const [globalFilter, setGlobalFilter] = useState('')

  const tableData = useMemo<RepoRow[]>(
    () =>
      repos.map((r) => ({
        project: r.project,
        name: r.name,
        max_loc: r.max_loc,
        max_branch: r.max_branch,
        top_language: getTopLanguage(r),
      })),
    [repos],
  )

  const table = useReactTable({
    data: tableData,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    initialState: { pagination: { pageSize: 20 } },
  })

  const { pageIndex, pageSize } = table.getState().pagination
  const totalFiltered = table.getFilteredRowModel().rows.length
  const fromRow = pageIndex * pageSize + 1
  const toRow = Math.min((pageIndex + 1) * pageSize, totalFiltered)

  return (
    <div>
      {/* Search */}
      <div className="mb-4 flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
            style={{ color: 'var(--color-muted)' }}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            type="text"
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder="Search repositories…"
            className="w-full pl-9 pr-4 py-2 rounded-lg text-sm border outline-none"
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
        <span className="text-xs" style={{ color: 'var(--color-muted)' }}>
          {totalFiltered.toLocaleString()} repositories
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--color-border)' }}>
        <table className="w-full text-sm">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr
                key={hg.id}
                style={{ backgroundColor: 'rgba(0,0,0,0.3)', borderBottom: '1px solid var(--color-border)' }}
              >
                {hg.headers.map((header) => (
                  <th
                    key={header.id}
                    onClick={header.column.getToggleSortingHandler()}
                    className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider select-none"
                    style={{
                      color: 'var(--color-muted)',
                      cursor: header.column.getCanSort() ? 'pointer' : 'default',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <span className="flex items-center gap-1.5">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {header.column.getCanSort() && (
                        <span style={{ color: 'var(--color-border)', fontSize: 10 }}>
                          {header.column.getIsSorted() === 'asc'
                            ? '▲'
                            : header.column.getIsSorted() === 'desc'
                            ? '▼'
                            : '⇅'}
                        </span>
                      )}
                    </span>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-8 text-center text-sm"
                  style={{ color: 'var(--color-muted)' }}
                >
                  No repositories match your search
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row, i) => (
                <tr
                  key={row.id}
                  style={{
                    backgroundColor: i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.15)',
                    borderBottom: '1px solid rgba(36,52,71,0.5)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(247,148,29,0.05)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor =
                      i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.15)'
                  }}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-2.5">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalFiltered > pageSize && (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
            Showing {fromRow}–{toRow} of {totalFiltered.toLocaleString()}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => table.setPageIndex(0)}
              disabled={!table.getCanPreviousPage()}
              className="px-2 py-1 rounded text-xs disabled:opacity-30"
              style={{
                backgroundColor: 'var(--color-card)',
                color: 'var(--color-muted)',
                border: '1px solid var(--color-border)',
              }}
            >
              «
            </button>
            <button
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              className="px-2 py-1 rounded text-xs disabled:opacity-30"
              style={{
                backgroundColor: 'var(--color-card)',
                color: 'var(--color-muted)',
                border: '1px solid var(--color-border)',
              }}
            >
              ‹
            </button>
            {Array.from({ length: Math.min(7, table.getPageCount()) }, (_, i) => {
              const p = Math.max(0, Math.min(pageIndex - 3, table.getPageCount() - 7)) + i
              return (
                <button
                  key={p}
                  onClick={() => table.setPageIndex(p)}
                  className="px-2.5 py-1 rounded text-xs font-mono"
                  style={{
                    backgroundColor:
                      p === pageIndex ? 'var(--color-accent)' : 'var(--color-card)',
                    color: p === pageIndex ? '#fff' : 'var(--color-muted)',
                    border: `1px solid ${p === pageIndex ? 'var(--color-accent)' : 'var(--color-border)'}`,
                  }}
                >
                  {p + 1}
                </button>
              )
            })}
            <button
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              className="px-2 py-1 rounded text-xs disabled:opacity-30"
              style={{
                backgroundColor: 'var(--color-card)',
                color: 'var(--color-muted)',
                border: '1px solid var(--color-border)',
              }}
            >
              ›
            </button>
            <button
              onClick={() => table.setPageIndex(table.getPageCount() - 1)}
              disabled={!table.getCanNextPage()}
              className="px-2 py-1 rounded text-xs disabled:opacity-30"
              style={{
                backgroundColor: 'var(--color-card)',
                color: 'var(--color-muted)',
                border: '1px solid var(--color-border)',
              }}
            >
              »
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
