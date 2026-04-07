import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/services/authService', () => ({
  authService: {
    signUp: vi.fn(),
  },
}))

let Signup: typeof import('../../src/components/Signup').Signup

beforeAll(async () => {
  ;({ Signup } = await import('../../src/components/Signup'))
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('Signup', () => {
  it('validates confirm password mismatch', async () => {
    const user = userEvent.setup()
    render(<Signup onSignupSuccess={vi.fn()} onSwitchToLogin={vi.fn()} />)

    await user.type(screen.getByLabelText('Display name'), 'Ryan')
    await user.type(screen.getByLabelText('Email'), 'a@b.com')
    await user.type(screen.getByLabelText('Password'), 'password')
    await user.type(screen.getByLabelText('Confirm Password'), 'different')
    await user.click(screen.getByRole('button', { name: /sign up/i }))

    expect(await screen.findByText('Passwords do not match')).toBeInTheDocument()
  })

  it('submits and shows success state on success', async () => {
    const user = userEvent.setup()

    const { authService } = await import('../../src/services/authService')
    ;(authService.signUp as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({})

    render(<Signup onSignupSuccess={vi.fn()} onSwitchToLogin={vi.fn()} />)

    await user.type(screen.getByLabelText('Display name'), 'Ryan Davis')
    await user.type(screen.getByLabelText('Email'), 'a@b.com')
    await user.type(screen.getByLabelText('Password'), 'password')
    await user.type(screen.getByLabelText('Confirm Password'), 'password')
    await user.click(screen.getByRole('button', { name: /sign up/i }))

    expect(authService.signUp).toHaveBeenCalledWith('a@b.com', 'password', 'Ryan Davis')
    expect(await screen.findByText(/sign up successful/i)).toBeInTheDocument()
  })
})
