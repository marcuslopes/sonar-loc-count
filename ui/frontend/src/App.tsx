import { useState } from 'react'
import type { ScanSummary } from './types'
import ConfigPage from './pages/ConfigPage'
import ScanPage from './pages/ScanPage'
import DashboardPage from './pages/DashboardPage'

type AppState = 'config' | 'scanning' | 'dashboard'

interface ScanningState {
  scanId: string
  org: string
}

export default function App() {
  const [appState, setAppState] = useState<AppState>('config')
  const [scanningState, setScanningState] = useState<ScanningState | null>(null)
  const [summary, setSummary] = useState<ScanSummary | null>(null)

  function handleScanStart(scanId: string, org: string) {
    setScanningState({ scanId, org })
    setAppState('scanning')
  }

  function handleScanComplete(result: ScanSummary) {
    setSummary(result)
    setAppState('dashboard')
  }

  function handleReset() {
    setScanningState(null)
    setSummary(null)
    setAppState('config')
  }

  if (appState === 'scanning' && scanningState) {
    return (
      <ScanPage
        scanId={scanningState.scanId}
        org={scanningState.org}
        onComplete={handleScanComplete}
        onReset={handleReset}
      />
    )
  }

  if (appState === 'dashboard' && summary) {
    return (
      <DashboardPage
        summary={summary}
        scanId={scanningState?.scanId ?? ''}
        onReset={handleReset}
      />
    )
  }

  return <ConfigPage onScanStart={handleScanStart} />
}
