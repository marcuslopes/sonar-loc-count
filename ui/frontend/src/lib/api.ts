import type { ScanEvent, ScanSummary } from '../types'

const VITE_API_URL =
  (import.meta as { env: Record<string, string> }).env?.VITE_API_URL ??
  'http://localhost:8000'

export async function startScan(
  token: string,
  org: string,
  project?: string,
): Promise<{ scan_id: string }> {
  const body: { token: string; org: string; project?: string } = { token, org }
  if (project) body.project = project

  const response = await fetch(`${VITE_API_URL}/api/scan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Scan failed: ${response.status} ${text}`)
  }

  return response.json() as Promise<{ scan_id: string }>
}

export function streamScan(
  scanId: string,
  onEvent: (event: ScanEvent) => void,
): () => void {
  const es = new EventSource(`${VITE_API_URL}/api/scan/${scanId}/stream`)

  es.onmessage = (e: MessageEvent<string>) => {
    try {
      const parsed = JSON.parse(e.data) as ScanEvent
      onEvent(parsed)
      if (parsed.type === 'done' || parsed.type === 'error') {
        es.close()
      }
    } catch {
      // ignore malformed events
    }
  }

  es.onerror = () => {
    onEvent({ type: 'error', message: 'Stream connection lost' })
    es.close()
  }

  return () => es.close()
}

export async function getResults(scanId: string): Promise<ScanSummary> {
  const response = await fetch(`${VITE_API_URL}/api/results/${scanId}`)
  if (!response.ok) {
    throw new Error(`Failed to fetch results: ${response.status}`)
  }
  return response.json() as Promise<ScanSummary>
}

export function getExportUrl(scanId: string, format: 'csv' | 'pdf'): string {
  return `${VITE_API_URL}/api/export/${scanId}?format=${format}`
}
