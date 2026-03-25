import { supabase } from './supabaseClient'

/** Thin wrapper around Supabase auth calls used by UI and controllers. */
export const authService = {
  /** Creates a new user account with email/password. */
  async signUp(email: string, password: string, displayName?: string) {
    const trimmedDisplayName = displayName?.trim()

    const { data, error } = await supabase.auth.signUp(
      trimmedDisplayName
        ? {
            email,
            password,
            options: {
              data: {
                display_name: trimmedDisplayName,
              },
            },
          }
        : {
            email,
            password,
          }
    )
    if (error) throw error
    return data
  },

  /** Signs a user in with email/password. */
  async signIn(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    if (error) throw error
    return data
  },

  /** Signs the current user out. */
  async signOut() {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  },

  /** Returns the currently authenticated user (or null). */
  async getCurrentUser() {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser()
    if (error) throw error
    return user
  },

  /** Sends a password reset email. */
  async resetPassword(email: string) {
    const { error } = await supabase.auth.resetPasswordForEmail(email)
    if (error) throw error
  },
}
