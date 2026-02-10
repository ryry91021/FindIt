import { describe, expect, it, vi } from 'vitest'

vi.mock('../../src/services/supabaseClient', () => ({
  supabase: {
    auth: {
      signUp: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      getUser: vi.fn(),
      resetPasswordForEmail: vi.fn(),
    },
  },
}))

describe('authService', () => {
  it('signIn delegates to supabase', async () => {
    const { supabase } = await import('../../src/services/supabaseClient')
    ;(supabase.auth.signInWithPassword as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { session: { user: { id: 'u1' } } },
      error: null,
    })

    const { authService } = await import('../../src/services/authService')
    const res = await authService.signIn('a@b.com', 'pw')

    expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'a@b.com',
      password: 'pw',
    })
    expect(res).toBeTruthy()
  })

  it('getCurrentUser returns user', async () => {
    const { supabase } = await import('../../src/services/supabaseClient')
    ;(supabase.auth.getUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: 'u1', email: 'a@b.com' } },
      error: null,
    })

    const { authService } = await import('../../src/services/authService')
    const user = await authService.getCurrentUser()

    expect(user?.id).toBe('u1')
  })
})
