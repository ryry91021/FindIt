import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../src/services/authService', () => ({
  authService: {
    signIn: vi.fn(),
  },
}))

describe('Login', () => {
  it('submits credentials and calls onLoginSuccess', async () => {
    const user = userEvent.setup()
    const { authService } = await import('../../src/services/authService')
    ;(authService.signIn as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({})

    const onLoginSuccess = vi.fn()
    const onSwitchToSignup = vi.fn()

    const { Login } = await import('../../src/components/Login')
    render(
      <Login onLoginSuccess={onLoginSuccess} onSwitchToSignup={onSwitchToSignup} />
    )

    await user.type(screen.getByLabelText('Email'), 'a@b.com')
    await user.type(screen.getByLabelText('Password'), 'pw')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    expect(authService.signIn).toHaveBeenCalledWith('a@b.com', 'pw')
    expect(onLoginSuccess).toHaveBeenCalled()
  })

  it('shows an error on failure', async () => {
    const user = userEvent.setup()
    const { authService } = await import('../../src/services/authService')
    ;(authService.signIn as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('bad creds')
    )

    const { Login } = await import('../../src/components/Login')
    render(
      <Login onLoginSuccess={vi.fn()} onSwitchToSignup={vi.fn()} />
    )

    await user.type(screen.getByLabelText('Email'), 'a@b.com')
    await user.type(screen.getByLabelText('Password'), 'pw')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    expect(await screen.findByText('bad creds')).toBeInTheDocument()
  })
})
