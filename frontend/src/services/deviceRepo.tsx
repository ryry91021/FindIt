import { supabase } from './supabaseClient'
import type { FIUBoardEntity } from '../entities/FIUBoardEntity'

export async function fetchBoardsForCurrentUser(): Promise<FIUBoardEntity[]> {
    const { data: authData, error: authErr } = await supabase.auth.getUser()
    if (authErr) throw authErr
    if (!authData.user) return []

    const ownerId = authData.user.id

    const { data, error } = await supabase
        .from('devices')
        .select('id, display_name')
        .eq('owner_id', ownerId)

    if (error) throw error
    return (data ?? []) as FIUBoardEntity[]
}
