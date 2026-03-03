/*
    Responsibilities:
    - Fetches board for active
    user from database
*/

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
        const isDev = import.meta.env.MODE === 'development'
        const debug = isDev

        const formatSupabaseErr = (err: unknown) => {
            if (!err) return 'Unknown error'
            if (err instanceof Error) return err.message
            try {
                return JSON.stringify(err)
            } catch {
                return String(err)
            }
        }

        let resolvedUserId = userId

        // Ensure Supabase auth state is hydrated before any RLS-protected queries.
        // Without this, queries may silently return 0 rows in some cases.
        // For external clients (tests), only hydrate when we need the user id.
        if (client === supabase || !resolvedUserId) {
            const { data: sessionData, error: sessionErr } = await client.auth.getSession()
            if (sessionErr) {
                console.error('FIUBoardModel.fetchBoardsForUser: auth.getSession failed', sessionErr)
                throw new Error(
                    isDev
                        ? `Unable to load boards (auth session): ${formatSupabaseErr(sessionErr)}`
                        : 'Unable to load boards.'
                )
            }

            if (!resolvedUserId) resolvedUserId = sessionData.session?.user?.id
        }

        if (!resolvedUserId) return []

        // Prefer a single RLS-filtered query against `devices`.
        // This is the most robust approach when membership tables are not directly selectable.
        const { data: accessibleDevices, error: accessibleErr } = await client
            .from('devices')
            .select('id, display_name')
            .order('created_at', { ascending: false })

        if (accessibleErr) {
            console.error('FIUBoardModel.fetchBoardsForUser: devices query failed', accessibleErr)
            throw new Error(
                isDev
                    ? `Unable to load boards (devices select): ${formatSupabaseErr(accessibleErr)}`
                    : 'Unable to load boards.'
            )
        }

        if (debug) {
            console.info('[FIUBoardModel] devices accessible:', (accessibleDevices ?? []).length)
        }

        const byId = new Map<string, FIUBoardEntity>()
        ;(accessibleDevices ?? []).forEach((d) => {
            const board = d as FIUBoardEntity
            if (board?.id) byId.set(board.id, board)
        })

        // Optional: augment results using explicit membership tables when readable.
        // If these tables are protected by RLS, we treat errors as non-fatal.
        let groupIds: string[] = []
        try {
            const { data: groupMemberRows, error: groupMemberErr } = await client
                .from('group_members')
                .select('group_id')
                .eq('user_id', resolvedUserId)

            if (groupMemberErr) {
                console.warn('FIUBoardModel.fetchBoardsForUser: group_members query failed', groupMemberErr)
            } else {
                const memberGroupIds = (groupMemberRows ?? [])
                    .map((row) => (row as { group_id?: string | null }).group_id)
                    .filter((id): id is string => typeof id === 'string' && id.length > 0)
                groupIds = memberGroupIds

                if (debug) {
                    console.info('[FIUBoardModel] group_members groups:', memberGroupIds.length)
                }
            }
        } catch (e) {
            console.warn('FIUBoardModel.fetchBoardsForUser: group_members lookup threw', e)
        }

        try {
            // Some schemas may not automatically add the creator to group_members.
            // Include groups created by the user as accessible groups.
            const { data: ownedGroupRows, error: ownedGroupErr } = await client
                .from('groups')
                .select('id')
                .eq('created_by', resolvedUserId)

            if (ownedGroupErr) {
                console.warn('FIUBoardModel.fetchBoardsForUser: groups query failed', ownedGroupErr)
            } else {
                const ownedGroupIds = (ownedGroupRows ?? [])
                    .map((row) => (row as { id?: string | null }).id)
                    .filter((id): id is string => typeof id === 'string' && id.length > 0)
                groupIds = Array.from(new Set([...groupIds, ...ownedGroupIds]))

                if (debug) {
                    console.info('[FIUBoardModel] groups created_by:', ownedGroupIds.length)
                }
            }
        } catch (e) {
            console.warn('FIUBoardModel.fetchBoardsForUser: groups lookup threw', e)
        }

        let memberDeviceIds: string[] = []
        try {
            const { data: memberRows, error: memberErr } = await client
                .from('device_members')
                .select('device_id')
                .eq('user_id', resolvedUserId)

            if (memberErr) {
                console.warn('FIUBoardModel.fetchBoardsForUser: device_members query failed', memberErr)
            } else {
                memberDeviceIds = (memberRows ?? [])
                    .map((row) => (row as { device_id?: string | null }).device_id)
                    .filter((id): id is string => typeof id === 'string' && id.length > 0)

                if (debug) {
                    console.info('[FIUBoardModel] device_members devices:', memberDeviceIds.length)
                }
            }
        } catch (e) {
            console.warn('FIUBoardModel.fetchBoardsForUser: device_members lookup threw', e)
        }

        if (memberDeviceIds.length > 0) {
            const { data: sharedData, error: sharedErr } = await client
                .from('devices')
                .select('id, display_name')
                .in('id', memberDeviceIds)

            if (sharedErr) {
                console.warn('FIUBoardModel.fetchBoardsForUser: shared devices query failed', sharedErr)
            } else {
                ;((sharedData ?? []) as FIUBoardEntity[]).forEach((d) => {
                    if (d?.id) byId.set(d.id, d)
                })
            }
        }

        if (groupIds.length > 0) {
            const { data: groupData, error: groupErr } = await client
                .from('devices')
                .select('id, display_name')
                .in('group_id', groupIds)

            if (groupErr) {
                console.warn('FIUBoardModel.fetchBoardsForUser: group devices query failed', groupErr)
            } else {
                ;((groupData ?? []) as FIUBoardEntity[]).forEach((d) => {
                    if (d?.id) byId.set(d.id, d)
                })

                if (debug) {
                    console.info('[FIUBoardModel] devices from groups:', (groupData ?? []).length)
                }
            }
        }

        if (debug) {
            console.info('[FIUBoardModel] boards returned:', byId.size)
        }

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
