import { supabase } from './supabaseClient'
import type { FIUBoardEntity } from '../entities/FIUBoardEntity'

/** Fetches boards/devices visible to the current user (owned or shared). */
export async function fetchBoardsForCurrentUser(userId?: string): Promise<FIUBoardEntity[]> {
    let resolvedUserId = userId

    if (!resolvedUserId) {
        const { data: sessionData, error: sessionErr } = await supabase.auth.getSession()
        if (sessionErr) {
            console.error('fetchBoardsForCurrentUser: auth.getSession failed', sessionErr)
            throw new Error('Unable to load boards.')
        }
        resolvedUserId = sessionData.session?.user?.id
    }

    if (!resolvedUserId) return []

    // Support both ownership and shared access via device_members
    const { data: memberRows, error: memberErr } = await supabase
        .from('device_members')
        .select('device_id')
        .eq('user_id', resolvedUserId)

    if (memberErr) {
        console.error('fetchBoardsForCurrentUser: device_members query failed', memberErr)
        throw new Error('Unable to load boards.')
    }

    const memberDeviceIds = (memberRows ?? [])
        .map((row: any) => row.device_id as string)
        .filter(Boolean)

    const { data: ownedDevices, error: ownedErr } = await supabase
        .from('devices')
        .select('id, display_name')
        .eq('owner_id', resolvedUserId)

    if (ownedErr) {
        console.error('fetchBoardsForCurrentUser: owned devices query failed', ownedErr)
        throw new Error('Unable to load boards.')
    }

    let sharedDevices: FIUBoardEntity[] = []
    if (memberDeviceIds.length > 0) {
        const { data: sharedData, error: sharedErr } = await supabase
            .from('devices')
            .select('id, display_name')
            .in('id', memberDeviceIds)

        if (sharedErr) {
            console.error('fetchBoardsForCurrentUser: shared devices query failed', sharedErr)
            throw new Error('Unable to load boards.')
        }

        sharedDevices = (sharedData ?? []) as FIUBoardEntity[]
    }

    const byId = new Map<string, FIUBoardEntity>()
    ;(ownedDevices ?? []).forEach((d: any) => {
        if (d?.id) byId.set(d.id, d as FIUBoardEntity)
    })
    sharedDevices.forEach((d) => {
        if (d?.id) byId.set(d.id, d)
    })

    return Array.from(byId.values())
}
