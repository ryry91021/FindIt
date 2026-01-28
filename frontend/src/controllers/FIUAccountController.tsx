import { authService } from '../services/authService'
import { supabase } from '../services/supabaseClient'

export class FIUAccountController {
    async getAuthenticatedUser() {
        const { data, error } = await supabase.auth.getUser()
        if (error) {
            console.error('supabase.auth.getUser error:', error)
            return null
        }
        return data.user ?? null
    }

    async signOut() {
        await authService.signOut()
    }
}
