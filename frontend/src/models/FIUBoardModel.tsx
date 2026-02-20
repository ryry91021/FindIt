import { FIUModel } from './FIUModel'
import type { FIUBoardEntity } from '../entities/FIUBoardEntity'
import type { FIULocationRecordEntity } from '../entities/FIULocationRecordEntity'
import { supabase } from '../services/supabaseClient'

export class FIUBoardModel extends FIUModel<FIUBoardEntity> {
    get id() {
        return this.entity.id
    }

    get displayName() {
        return this.entity.display_name
    }

    /** Fetches all boards the user owns or has access to. */
    static async fetchBoardsForUser(userId?: string): Promise<FIUBoardEntity[]> {
        // Ensure Supabase auth state is hydrated before any RLS-protected queries.
        // Without this, queries may silently return 0 rows in some cases.
        const { data: sessionData, error: sessionErr } = await supabase.auth.getSession()
        if (sessionErr) {
            console.error('FIUBoardModel.fetchBoardsForUser: auth.getSession failed', sessionErr)
            throw new Error('Unable to load boards.')
        }

        let resolvedUserId = userId

        if (!resolvedUserId) resolvedUserId = sessionData.session?.user?.id

        if (!resolvedUserId) return []

        const { data: memberRows, error: memberErr } = await supabase
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

        const { data: ownedDevices, error: ownedErr } = await supabase
            .from('devices')
            .select('id, display_name')
            .eq('owner_id', resolvedUserId)

        if (ownedErr) {
            console.error('FIUBoardModel.fetchBoardsForUser: owned devices query failed', ownedErr)
            throw new Error('Unable to load boards.')
        }

        let sharedDevices: FIUBoardEntity[] = []
        if (memberDeviceIds.length > 0) {
            const { data: sharedData, error: sharedErr } = await supabase
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

    /** Fetches only the most-recent location record per device. */
    static async fetchLatestLocationsForDevices(
        deviceIds: string[]
    ): Promise<FIULocationRecordEntity[]> {
        if (!deviceIds || deviceIds.length === 0) return []

        const { data, error } = await supabase
            .from('location_logs')
            .select('device_id, latitude, longitude, accuracy_meters, recorded_at')
            .in('device_id', deviceIds)
            .order('recorded_at', { ascending: false })

        if (error) {
            console.error('FIUBoardModel.fetchLatestLocationsForDevices: query failed', error)
            throw new Error('Unable to load locations.')
        }

        const latestByDevice = new Map<string, FIULocationRecordEntity>()
        ;(data ?? []).forEach((row) => {
            const loc = row as FIULocationRecordEntity
            if (loc?.device_id && !latestByDevice.has(loc.device_id)) {
                latestByDevice.set(loc.device_id, loc)
            }
        })

        return Array.from(latestByDevice.values())
    }

    /** Convenience method for dashboard data loading. */
    static async loadBoardsAndLatestLocations(userId?: string): Promise<{
        boards: FIUBoardEntity[]
        locations: FIULocationRecordEntity[]
    }> {
        const boards = await FIUBoardModel.fetchBoardsForUser(userId)
        const deviceIds = boards.map((b) => b.id)
        const locations = await FIUBoardModel.fetchLatestLocationsForDevices(deviceIds)
        return { boards, locations }
    }
}
