/**
 * Tests for the ScanPage component.
 *
 * ScanPage connects to a Server-Sent Events stream for a scan_id and renders:
 *   - A progress bar that updates on 'progress' events
 *   - A live log that gains new lines on 'repo_done' events
 *   - Calls onComplete when a 'done' event is received
 *   - Shows an error message when an 'error' event is received
 *
 * Assumed component signature:
 *   ScanPage({
 *     scanId,
 *     onComplete,
 *   }: {
 *     scanId: string
 *     onComplete: (summary: ScanSummary) => void
 *   })
 *
 * The component is expected to instantiate an EventSource pointed at
 * /api/stream/{scanId}.  We mock the global EventSource class to feed
 * synthetic events without a real server.
 */

import React from 'react'
import { render, screen, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import type { ScanSummary } from '../types'
import ScanPage from '../components/ScanPage'

// ---------------------------------------------------------------------------
// EventSource mock
// ---------------------------------------------------------------------------

/**
 * A controllable fake EventSource.  Tests hold a reference via
 * MockEventSource.instance and can dispatch events by calling
 * instance.dispatchEvent(new MessageEvent('message', { data: '...' })).
 */
class MockEventSource extends EventTarget {
  static instance: MockEventSource | null = null
  public url: string
  public readyState: number = 0 // CONNECTING

  // Handler properties used by components that assign onmessage etc.
  onmessage: ((evt: MessageEvent) => void) | null = null
  onerror: ((evt: Event) => void) | null = null
  onopen: ((evt: Event) => void) | null = null

  constructor(url: string) {
    super()
    this.url = url
    this.readyState = 1 // OPEN
    MockEventSource.instance = this
  }

  close() {
    this.readyState = 2 // CLOSED
  }

  /** Helper used by tests to simulate an incoming SSE message. */
  simulateMessage(eventType: string, data: unknown) {
    const raw = JSON.stringify(data)
    const evt = new MessageEvent(eventType, { data: raw })
    // Invoke the handler if set directly on the instance
    if (eventType === 'message' && this.onmessage) {
      this.onmessage(evt)
    }
    // Also dispatch for addEventListener listeners
    this.dispatchEvent(evt)
  }
}

// ---------------------------------------------------------------------------
// Test setup / teardown
// ---------------------------------------------------------------------------

const originalEventSource = global.EventSource

beforeEach(() => {
  MockEventSource.instance = null
  // @ts-expect-error — replacing global EventSource with test double
  global.EventSource = MockEventSource
})

afterEach(() => {
  global.EventSource = originalEventSource
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeScanSummary(): ScanSummary {
  return {
    org: 'my-org',
    total_loc: 2300,
    project_count: 1,
    repo_count: 1,
    language_totals: { Python: 1500 },
    projects: [],
    top_repos: [],
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ScanPage', () => {
  it('shows a progress bar at 0% on initial render', () => {
    /**
     * Before any SSE events arrive the progress bar should be visible and
     * display 0% (or an aria-valuenow of 0).
     */
    render(<ScanPage scanId="test-scan-1" onComplete={vi.fn()} />)

    const progressBar = screen.getByRole('progressbar')
    expect(progressBar).toBeInTheDocument()

    const valueNow = progressBar.getAttribute('aria-valuenow')
    if (valueNow !== null) {
      expect(Number(valueNow)).toBe(0)
    } else {
      // Some implementations use text like "0%" instead of aria-valuenow
      expect(screen.getByText(/0\s*%/)).toBeInTheDocument()
    }
  })

  it('updates the progress bar when a progress SSE event is received', async () => {
    /**
     * A 'progress' event with pct=45 should update the progress bar so that
     * aria-valuenow equals 45 (or the text "45%" is visible).
     */
    render(<ScanPage scanId="test-scan-2" onComplete={vi.fn()} />)

    await act(async () => {
      MockEventSource.instance!.simulateMessage('message', {
        type: 'progress',
        message: 'Scanning repo…',
        pct: 45,
      })
    })

    const progressBar = screen.getByRole('progressbar')
    const valueNow = progressBar.getAttribute('aria-valuenow')
    if (valueNow !== null) {
      expect(Number(valueNow)).toBe(45)
    } else {
      expect(screen.getByText(/45\s*%/)).toBeInTheDocument()
    }
  })

  it('adds a log line when a repo_done SSE event is received', async () => {
    /**
     * Each 'repo_done' event must produce a new line in the live log region,
     * containing at least the repo name so the user can track progress.
     */
    render(<ScanPage scanId="test-scan-3" onComplete={vi.fn()} />)

    await act(async () => {
      MockEventSource.instance!.simulateMessage('message', {
        type: 'repo_done',
        project: 'Alpha',
        repo: 'api-service',
        max_loc: 2300,
      })
    })

    expect(screen.getByText(/api-service/i)).toBeInTheDocument()
  })

  it('adds multiple log lines for multiple repo_done events', async () => {
    /**
     * When two 'repo_done' events arrive both repos should appear in the log
     * simultaneously, not just the most recent one.
     */
    render(<ScanPage scanId="test-scan-4" onComplete={vi.fn()} />)

    await act(async () => {
      MockEventSource.instance!.simulateMessage('message', {
        type: 'repo_done',
        project: 'Alpha',
        repo: 'api-service',
        max_loc: 2300,
      })
      MockEventSource.instance!.simulateMessage('message', {
        type: 'repo_done',
        project: 'Beta',
        repo: 'web-app',
        max_loc: 800,
      })
    })

    expect(screen.getByText(/api-service/i)).toBeInTheDocument()
    expect(screen.getByText(/web-app/i)).toBeInTheDocument()
  })

  it('calls onComplete with the summary when a done SSE event is received', async () => {
    /**
     * A 'done' event must trigger the onComplete callback with the ScanSummary
     * payload so the parent component can navigate to the results view.
     */
    const handleComplete = vi.fn()
    const summary = makeScanSummary()

    render(<ScanPage scanId="test-scan-5" onComplete={handleComplete} />)

    await act(async () => {
      MockEventSource.instance!.simulateMessage('message', {
        type: 'done',
        summary,
      })
    })

    expect(handleComplete).toHaveBeenCalledOnce()
    expect(handleComplete).toHaveBeenCalledWith(
      expect.objectContaining({ org: 'my-org', total_loc: 2300 }),
    )
  })

  it('shows an error message when an error SSE event is received', async () => {
    /**
     * An 'error' event with a message string must cause that message to appear
     * in the UI so the user understands what went wrong.
     */
    render(<ScanPage scanId="test-scan-6" onComplete={vi.fn()} />)

    await act(async () => {
      MockEventSource.instance!.simulateMessage('message', {
        type: 'error',
        message: 'Azure DevOps connection refused',
      })
    })

    expect(
      screen.getByText(/Azure DevOps connection refused/i),
    ).toBeInTheDocument()
  })

  it('does not call onComplete for a progress event', async () => {
    /**
     * The onComplete callback must only fire for 'done' events, not for
     * intermediate progress events.
     */
    const handleComplete = vi.fn()
    render(<ScanPage scanId="test-scan-7" onComplete={handleComplete} />)

    await act(async () => {
      MockEventSource.instance!.simulateMessage('message', {
        type: 'progress',
        message: 'Still scanning…',
        pct: 50,
      })
    })

    expect(handleComplete).not.toHaveBeenCalled()
  })

  it('opens an EventSource pointed at the correct URL', () => {
    /**
     * The component must connect to /api/stream/{scanId} so the backend can
     * push SSE events for that specific scan.
     */
    render(<ScanPage scanId="my-unique-scan-id" onComplete={vi.fn()} />)
    expect(MockEventSource.instance).not.toBeNull()
    expect(MockEventSource.instance!.url).toContain('my-unique-scan-id')
  })

  it('progress bar reaches 100% after a done event', async () => {
    /**
     * On scan completion the progress bar should advance to 100% regardless
     * of the final progress event value.
     */
    render(<ScanPage scanId="test-scan-8" onComplete={vi.fn()} />)

    await act(async () => {
      MockEventSource.instance!.simulateMessage('message', {
        type: 'done',
        summary: makeScanSummary(),
      })
    })

    const progressBar = screen.getByRole('progressbar')
    const valueNow = progressBar.getAttribute('aria-valuenow')
    if (valueNow !== null) {
      expect(Number(valueNow)).toBe(100)
    } else {
      expect(screen.getByText(/100\s*%/)).toBeInTheDocument()
    }
  })
})
