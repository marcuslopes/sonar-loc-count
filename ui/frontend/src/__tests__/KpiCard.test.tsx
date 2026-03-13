/**
 * Tests for the KpiCard component.
 *
 * KpiCard is expected to display a metric title and a numeric value.
 * It should format large numbers with toLocaleString() and apply a
 * variant CSS class when variant="warning" is provided.
 */

import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'

// KpiCard will be built by another agent; import it from its expected location.
// The component signature is assumed to be:
//   KpiCard({ title, value, variant? }: { title: string; value: number; variant?: string })
import KpiCard from '../components/KpiCard'

describe('KpiCard', () => {
  it('renders the title', () => {
    /** Confirms that the title prop text appears in the rendered output. */
    render(<KpiCard title="Total LoC" value={12345} />)
    expect(screen.getByText('Total LoC')).toBeInTheDocument()
  })

  it('renders a small numeric value without formatting', () => {
    /** Numbers below 1000 are rendered as-is without thousand separators. */
    render(<KpiCard title="Repos" value={42} />)
    expect(screen.getByText('42')).toBeInTheDocument()
  })

  it('formats large numbers with toLocaleString()', () => {
    /**
     * Numbers ≥ 1000 must be formatted using toLocaleString() so that
     * 1234567 appears as "1,234,567" (or the locale-equivalent separator).
     */
    render(<KpiCard title="Total LoC" value={1234567} />)
    const formatted = (1234567).toLocaleString()
    expect(screen.getByText(formatted)).toBeInTheDocument()
  })

  it('formats a value of exactly 1000', () => {
    /** Edge case: 1000 should also receive locale formatting. */
    render(<KpiCard title="Files" value={1000} />)
    const formatted = (1000).toLocaleString()
    expect(screen.getByText(formatted)).toBeInTheDocument()
  })

  it('renders a value of zero', () => {
    /** Zero is a valid metric value and must be displayed. */
    render(<KpiCard title="Errors" value={0} />)
    expect(screen.getByText('0')).toBeInTheDocument()
  })

  it('applies the warning CSS class when variant="warning"', () => {
    /**
     * When variant="warning" is passed the rendered container element must
     * include a CSS class that contains the word "warning", allowing callers
     * to style the card differently for alerting scenarios.
     */
    const { container } = render(
      <KpiCard title="Licence Gap" value={500000} variant="warning" />,
    )
    // Find any element inside the card that carries a warning-related class
    const warningEl = container.querySelector('[class*="warning"]')
    expect(warningEl).not.toBeNull()
  })

  it('does not apply warning class when variant is omitted', () => {
    /**
     * Without a variant prop the component must not apply warning styles,
     * ensuring the default appearance is neutral.
     */
    const { container } = render(<KpiCard title="Projects" value={5} />)
    const warningEl = container.querySelector('[class*="warning"]')
    expect(warningEl).toBeNull()
  })

  it('does not apply warning class when variant="default"', () => {
    /** An explicit variant="default" must also produce no warning styling. */
    const { container } = render(
      <KpiCard title="Projects" value={5} variant="default" />,
    )
    const warningEl = container.querySelector('[class*="warning"]')
    expect(warningEl).toBeNull()
  })
})
