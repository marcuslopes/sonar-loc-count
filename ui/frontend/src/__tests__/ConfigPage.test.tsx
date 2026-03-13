/**
 * Tests for the ConfigPage component.
 *
 * ConfigPage is the entry screen where the user provides their Azure DevOps
 * organisation slug and a Personal Access Token.  On submit it invokes the
 * onStart callback with { token, org }.
 *
 * Assumed component signature:
 *   ConfigPage({ onStart }: { onStart: (cfg: { token: string; org: string }) => void })
 */

import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'

import ConfigPage from '../components/ConfigPage'

describe('ConfigPage', () => {
  it('renders an organisation input field', () => {
    /** The page must include a text input (or combobox) for the org slug. */
    render(<ConfigPage onStart={vi.fn()} />)
    // Accept label text or placeholder variations
    const orgInput =
      screen.queryByLabelText(/org(anisation|anization)?/i) ??
      screen.queryByPlaceholderText(/org(anisation|anization)?/i) ??
      screen.queryByRole('textbox', { name: /org/i })
    expect(orgInput).not.toBeNull()
  })

  it('renders a token input field', () => {
    /**
     * The page must include an input for the PAT.  It should be typed as
     * password or have a label/placeholder containing "token".
     */
    render(<ConfigPage onStart={vi.fn()} />)
    const tokenInput =
      screen.queryByLabelText(/token/i) ??
      screen.queryByPlaceholderText(/token/i) ??
      screen.queryByRole('textbox', { name: /token/i }) ??
      (document.querySelector('input[type="password"]') as HTMLElement | null)
    expect(tokenInput).not.toBeNull()
  })

  it('renders a submit button', () => {
    /** There must be a button the user can click to start the scan. */
    render(<ConfigPage onStart={vi.fn()} />)
    const button = screen.getByRole('button')
    expect(button).toBeInTheDocument()
  })

  it('submit button is disabled when both fields are empty', () => {
    /**
     * On initial render, before any input, the submit button must be disabled
     * to prevent accidental scans without credentials.
     */
    render(<ConfigPage onStart={vi.fn()} />)
    const button = screen.getByRole('button')
    expect(button).toBeDisabled()
  })

  it('submit button is disabled when only org is filled', async () => {
    /**
     * Filling in the org field alone is not sufficient — the token is also
     * required before the submit button becomes enabled.
     */
    const user = userEvent.setup()
    render(<ConfigPage onStart={vi.fn()} />)

    const orgInput =
      screen.queryByLabelText(/org/i) ??
      screen.queryByPlaceholderText(/org/i) ??
      screen.getAllByRole('textbox')[0]

    await user.type(orgInput!, 'my-org')
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('submit button is disabled when only token is filled', async () => {
    /**
     * Filling in the token alone is also insufficient — both fields must be
     * populated.
     */
    const user = userEvent.setup()
    render(<ConfigPage onStart={vi.fn()} />)

    const inputs = document.querySelectorAll('input')
    // Type into whichever input is the token field (second input or password)
    const tokenInput =
      (document.querySelector('input[type="password"]') as HTMLInputElement | null) ??
      (inputs[1] as HTMLInputElement | undefined)

    if (tokenInput) {
      await user.type(tokenInput, 'my-pat')
    }
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('submit button becomes enabled when both fields are filled', async () => {
    /**
     * Once both the org and token inputs have values the submit button must
     * become enabled, allowing the user to proceed.
     */
    const user = userEvent.setup()
    render(<ConfigPage onStart={vi.fn()} />)

    const allInputs = document.querySelectorAll('input')
    await user.type(allInputs[0], 'my-org')
    await user.type(allInputs[1], 'super-secret-pat')

    expect(screen.getByRole('button')).not.toBeDisabled()
  })

  it('calls onStart with correct { token, org } on form submit', async () => {
    /**
     * Clicking submit must invoke the onStart callback with an object
     * containing the values the user entered — the org slug and the PAT.
     */
    const user = userEvent.setup()
    const handleStart = vi.fn()
    render(<ConfigPage onStart={handleStart} />)

    const allInputs = document.querySelectorAll('input')
    await user.type(allInputs[0], 'contoso')
    await user.type(allInputs[1], 'my-secret-token')
    await user.click(screen.getByRole('button'))

    expect(handleStart).toHaveBeenCalledOnce()
    const callArg = handleStart.mock.calls[0][0] as { org: string; token: string }
    expect(callArg.org).toBe('contoso')
    expect(callArg.token).toBe('my-secret-token')
  })

  it('does not call onStart when fields are empty and button is clicked programmatically', async () => {
    /**
     * Even if the button is clicked while disabled, onStart must not be invoked.
     * This guards against form submissions bypassing the disabled state.
     */
    const user = userEvent.setup()
    const handleStart = vi.fn()
    render(<ConfigPage onStart={handleStart} />)

    // Attempt to click the disabled button
    const button = screen.getByRole('button')
    await user.click(button)

    expect(handleStart).not.toHaveBeenCalled()
  })
})
