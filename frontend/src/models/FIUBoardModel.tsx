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

    /** Device EUI used to identify hardware on LoRaWAN network server. */
    get deviceEui() {
        return this.entity.device_eui
    }

    /** Creates a board/device for the authenticated user. */
    static async createBoard(
        displayName: string,
        deviceEui: string,
        userId?: string,
        client: SupabaseClient = supabase
    ): Promise<void> {
        const ownerId = await this.resolveUserId(userId, client)
        if (!ownerId) throw new Error('Unable to create board without a user session.')

        const { error } = await client.from('devices').insert({
            owner_id: ownerId,
            display_name: displayName,
            device_eui: deviceEui,
        })

        if (error) {
            console.error('FIUBoardModel.createBoard: insert failed', error)
            throw new Error('Unable to create board.')
        }
    }

    /** Deletes a board/device by id. */
    static async deleteBoard(
        boardId: string,
        client: SupabaseClient = supabase
    ): Promise<void> {
        const { error } = await client.from('devices').delete().eq('id', boardId)
        if (error) {
            console.error('FIUBoardModel.deleteBoard: delete failed', error)
            throw new Error('Unable to remove board.')
        }
    }

    /** Renames a board/device. */
    static async renameBoard(
        boardId: string,
        displayName: string,
        client: SupabaseClient = supabase
    ): Promise<void> {
        const { error } = await client
            .from('devices')
            .update({ display_name: displayName })
            .eq('id', boardId)

        if (error) {
            console.error('FIUBoardModel.renameBoard: update failed', error)
            throw new Error('Unable to rename board.')
        }
    }

    /** Assigns a board/device to a group. */
    static async assignBoardToGroup(
        boardId: string,
        groupId: string,
        client: SupabaseClient = supabase
    ): Promise<void> {
        const { error } = await client
            .from('devices')
            .update({ group_id: groupId })
            .eq('id', boardId)

        if (error) {
            console.error('FIUBoardModel.assignBoardToGroup: update failed', error)
            throw new Error('Unable to add board to group.')
        }
    }

    /** Fetches all boards the user owns or has access to. */
    static async fetchBoardsForUser(
        userId?: string,
        client: SupabaseClient = supabase
    ): Promise<FIUBoardEntity[]> {
        let resolvedUserId = userId

        // Ensure Supabase auth state is hydrated before any RLS-protected queries.
        // In dev (React StrictMode) the caller-provided `userId` can temporarily differ
        // from the current Supabase session user; prefer the session user id when available.
        if (client === supabase) {
            const { data: sessionData, error: sessionErr } = await client.auth.getSession()
            if (sessionErr) {
                console.error('FIUBoardModel.fetchBoardsForUser: auth.getSession failed', {
                    error: sessionErr,
                    errorText: this.formatSupabaseError(sessionErr),
                })
                throw new Error('Unable to load boards.')
            }

            const sessionUserId = sessionData.session?.user?.id
            if (sessionUserId) resolvedUserId = sessionUserId
        } else if (!resolvedUserId) {
            // For external clients (tests), only hydrate when we need the user id.
            const { data: sessionData, error: sessionErr } = await client.auth.getSession()
            if (sessionErr) {
                console.error('FIUBoardModel.fetchBoardsForUser: auth.getSession failed', {
                    error: sessionErr,
                    errorText: this.formatSupabaseError(sessionErr),
                })
                throw new Error('Unable to load boards.')
            }
            resolvedUserId = sessionData.session?.user?.id
        }

        if (!resolvedUserId) return []

        // Prefer a single RLS-filtered query against `devices`.
        // This is the most robust approach when membership tables are not directly selectable.
        const { data: accessibleDevices, error: accessibleErr } = await client
            .from('devices')
            .select('id, display_name, device_eui, group_id')
            .order('created_at', { ascending: false })

        if (accessibleErr) {
            console.error('FIUBoardModel.fetchBoardsForUser: devices query failed', {
                error: accessibleErr,
                errorText: this.formatSupabaseError(accessibleErr),
            })
            throw new Error('Unable to load boards.')
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
            }
        } catch (e) {
            console.warn('FIUBoardModel.fetchBoardsForUser: device_members lookup threw', e)
        }

        if (memberDeviceIds.length > 0) {
            const { data: sharedData, error: sharedErr } = await client
                .from('devices')
                .select('id, display_name, device_eui, group_id')
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
                .select('id, display_name, device_eui, group_id')
                .in('group_id', groupIds)

            if (groupErr) {
                console.warn('FIUBoardModel.fetchBoardsForUser: group devices query failed', groupErr)
            } else {
                ;((groupData ?? []) as FIUBoardEntity[]).forEach((d) => {
                    if (d?.id) byId.set(d.id, d)
                })
            }
        }

        return Array.from(byId.values())
    }

    /** Replaces the selected board assignments for a given group. */
    static async setBoardsForGroup(
        groupId: string,
        selectedBoardIds: string[],
        accessibleBoardIds: string[],
        currentGroupBoardIds: string[],
        client: SupabaseClient = supabase
    ): Promise<void> {
        const selectedSet = new Set(selectedBoardIds)
        const currentGroupSet = new Set(currentGroupBoardIds)

        // First clear any currently assigned boards for this group that are no longer selected.
        const idsToClear = accessibleBoardIds.filter(
            (boardId) => !selectedSet.has(boardId) && currentGroupSet.has(boardId)
        )

        for (const boardId of idsToClear) {
            const { data, error } = await client
                .from('devices')
                .update({ group_id: null })
                .eq('id', boardId)
                .select('id')
                .maybeSingle()

            if (error) {
                console.error('FIUBoardModel.setBoardsForGroup: clear failed', error)
                throw new Error('Unable to remove board from group.')
            }

            if (!data) {
                throw new Error('Unable to remove board from group (not permitted by policy).')
            }
        }

        // Then assign every selected board to the target group.
        for (const boardId of selectedBoardIds) {
            const { data, error } = await client
                .from('devices')
                .update({ group_id: groupId })
                .eq('id', boardId)
                .select('id, group_id')
                .maybeSingle()

            if (error) {
                console.error('FIUBoardModel.setBoardsForGroup: assign failed', error)
                throw new Error('Unable to assign selected boards to group.')
            }

            if (!data) {
                throw new Error('Unable to assign selected boards to group (not permitted by policy).')
            }

            const updated = data as { group_id?: string | null }
            if (updated.group_id !== groupId) {
                throw new Error('Unable to assign selected boards to group (assignment not persisted).')
            }
        }
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
