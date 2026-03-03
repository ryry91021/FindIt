/*
    Responsibilities:

*/

import { authService } from '../services/authService'
import { supabase } from '../services/supabaseClient'

/** Coordinates authenticated user and account actions. */
export class FIUAccountController {
    /** Returns the currently authenticated user (or null). */
    async getAuthenticatedUser() {
        const { data, error } = await supabase.auth.getUser()
        if (error) {
            console.error('supabase.auth.getUser error:', error)
            return null
        }
        return data.user ?? null
    }

    /** Signs the current user out. */
    async signOut() {
        await authService.signOut()
    }
}
