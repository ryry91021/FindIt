import { FIUModel } from './FIUModel'
import type { FIUBoardEntity } from '../entities/FIUBoardEntity'
import type { FIULocationRecordEntity } from '../entities/FIULocationRecordEntity'
import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from '../services/supabaseClient'
import { FIULocationRecordModel } from './FIULocationRecordModel'

/** UI-friendly model for a board/device entity. */
export class FIUBoardModel extends FIUModel<FIUBoardEntity> {
    /** Board ID. */
    get id() {
        return this.entity.id
    }

    /** Display name for the board. */
    get displayName() {
        return this.entity.display_name
    }

    /** Fetches all boards the user owns or has access to. */
    static async fetchBoardsForUser(
        userId?: string,
        client: SupabaseClient = supabase
    ): Promise<FIUBoardEntity[]> {
        let resolvedUserId = userId

        // Ensure Supabase auth state is hydrated before any RLS-protected queries.
        // Without this, queries may silently return 0 rows in some cases.
        // For external clients (tests), only hydrate when we need the user id.
        if (client === supabase || !resolvedUserId) {
            const { data: sessionData, error: sessionErr } = await client.auth.getSession()
            if (sessionErr) {
                console.error('FIUBoardModel.fetchBoardsForUser: auth.getSession failed', sessionErr)
                throw new Error('Unable to load boards.')
            }

            if (!resolvedUserId) resolvedUserId = sessionData.session?.user?.id
        }

        if (!resolvedUserId) return []

        const { data: memberRows, error: memberErr } = await client
            .from('device_members')
            .select('device_id')
            .eq('user_id', resolvedUserId)

        if (memberErr) {
            console.error('FIUBoardModel.fetchBoardsForUser: device_members query failed', memberErr)
            throw new Error('Unable to load boards.')
        }

        const memberDeviceIds = (memberRows ?? [])
            .map((row) => (row as { device_id?: string | null }).device_id)
            .filter((id): id is string => typeof id === 'string' && id.length > 0)

        const { data: ownedDevices, error: ownedErr } = await client
            .from('devices')
            .select('id, display_name')
            .eq('owner_id', resolvedUserId)

        if (ownedErr) {
            console.error('FIUBoardModel.fetchBoardsForUser: owned devices query failed', ownedErr)
            throw new Error('Unable to load boards.')
        }

        let sharedDevices: FIUBoardEntity[] = []
        if (memberDeviceIds.length > 0) {
            const { data: sharedData, error: sharedErr } = await client
                .from('devices')
                .select('id, display_name')
                .in('id', memberDeviceIds)

            if (sharedErr) {
                console.error('FIUBoardModel.fetchBoardsForUser: shared devices query failed', sharedErr)
                throw new Error('Unable to load boards.')
            }

            sharedDevices = (sharedData ?? []) as FIUBoardEntity[]
        }

        const byId = new Map<string, FIUBoardEntity>()
        ;(ownedDevices ?? []).forEach((d) => {
            const board = d as FIUBoardEntity
            if (board?.id) byId.set(board.id, board)
        })
        sharedDevices.forEach((d) => {
            if (d?.id) byId.set(d.id, d)
        })

        return Array.from(byId.values())
    }

    /** Convenience method for dashboard data loading. */
    static async loadBoardsAndLatestLocations(
        userId?: string,
        client: SupabaseClient = supabase
    ): Promise<{
        boards: FIUBoardEntity[]
        locations: FIULocationRecordEntity[]
    }> {
        const boards = await FIUBoardModel.fetchBoardsForUser(userId, client)
        const deviceIds = boards.map((b) => b.id)
        const locations = await FIULocationRecordModel.fetchLatestLocationsForDevices(deviceIds, client)
        return { boards, locations }
    }
}
