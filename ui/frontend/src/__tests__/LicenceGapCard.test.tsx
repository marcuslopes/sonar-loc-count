/**
 * Tests for the LicenceGapCard component.
 *
 * LicenceGapCard lets users enter their current Sonar licence limit and
 * compares it against the scanned total_loc to show a deficit or surplus
 * message.
 *
 * Assumed component signature:
 *   LicenceGapCard({ totalLoc }: { totalLoc: number })
 *
 * The component renders an <input> for the licence limit and a message area
 * that reflects the gap between the limit and totalLoc.
 */

import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect } from 'vitest'

import LicenceGapCard from '../components/LicenceGapCard'

describe('LicenceGapCard', () => {
  it('shows 0 gap when totalLoc is 0 and input is 0', () => {
    /**
     * Default state: with no scanned code and no licence limit entered
     * the displayed gap value should be zero.
     */
    render(<LicenceGapCard totalLoc={0} />)
    // The input should start at 0 (or empty, treated as 0)
    const input = screen.getByRole('spinbutton') as HTMLInputElement
    expect(Number(input.value) || 0).toBe(0)
    // No deficit or surplus message should display a non-zero gap
    expect(screen.queryByText(/[\d,]+/)).not.toMatch(/[1-9]/)
  })

  it('shows a deficit message when totalLoc exceeds licence input', async () => {
    /**
     * When the scanned total_loc (1 234 567) exceeds the user-entered licence
     * limit (500 000) the component must display a message indicating a deficit.
     * The shortfall is 734 567 lines.
     */
    const user = userEvent.setup()
    render(<LicenceGapCard totalLoc={1234567} />)

    const input = screen.getByRole('spinbutton')
    await user.clear(input)
    await user.type(input, '500000')

    // Expect some form of deficit / over-limit / gap indication in the UI
    const deficit = screen.queryByText(/deficit|over|exceed|gap|short/i)
    expect(deficit).not.toBeNull()
  })

  it('shows a "covered" message when licence input exceeds totalLoc', async () => {
    /**
     * When the entered licence limit is greater than total_loc the component
     * must indicate that the current usage is covered / within limits.
     */
    const user = userEvent.setup()
    render(<LicenceGapCard totalLoc={500000} />)

    const input = screen.getByRole('spinbutton')
    await user.clear(input)
    await user.type(input, '1000000')

    const covered = screen.queryByText(/covered|within|ok|surplus|safe/i)
    expect(covered).not.toBeNull()
  })

  it('updates the displayed gap when the input value changes', async () => {
    /**
     * The gap readout must be reactive: changing the licence input from one
     * value to another should produce a different displayed gap.
     */
    const user = userEvent.setup()
    render(<LicenceGapCard totalLoc={1000000} />)

    const input = screen.getByRole('spinbutton')

    // First value
    await user.clear(input)
    await user.type(input, '500000')
    const firstGap = screen.getByText(/[\d,]+/)?.textContent ?? ''

    // Second value — gap should differ
    await user.clear(input)
    await user.type(input, '800000')
    const secondGap = screen.getByText(/[\d,]+/)?.textContent ?? ''

    expect(firstGap).not.toBe(secondGap)
  })

  it('renders the licence limit input field', () => {
    /** The component must include a numeric input for the licence limit. */
    render(<LicenceGapCard totalLoc={100000} />)
    const input = screen.getByRole('spinbutton')
    expect(input).toBeInTheDocument()
  })

  it('displays a formatted totalLoc value somewhere in the card', () => {
    /**
     * The card should surface the total_loc so users can compare it visually
     * against their licence without mental arithmetic.
     */
    render(<LicenceGapCard totalLoc={1234567} />)
    const formatted = (1234567).toLocaleString()
    expect(screen.getByText(formatted)).toBeInTheDocument()
  })

  it('gap is zero when licence equals totalLoc exactly', async () => {
    /**
     * Edge case: when the licence limit equals total_loc the gap is exactly 0
     * and the component should indicate that the usage is covered (not over).
     */
    const user = userEvent.setup()
    render(<LicenceGapCard totalLoc={750000} />)

    const input = screen.getByRole('spinbutton')
    await user.clear(input)
    await user.type(input, '750000')

    // No deficit indicator should be visible
    const deficit = screen.queryByText(/deficit|over|exceed|short/i)
    expect(deficit).toBeNull()
  })
})
