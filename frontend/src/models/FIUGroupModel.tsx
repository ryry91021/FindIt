import type { SupabaseClient } from '@supabase/supabase-js'
import type { FIUGroupEntity } from '../entities/FIUGroupEntity'
import type {
    FIUGroupJoinRequestEntity,
    FIUGroupMemberEntity,
} from '../entities/FIUGroupMembershipEntities'
import { supabase } from '../services/supabaseClient'
import { FIUModel } from './FIUModel'

export type { FIUGroupJoinRequestEntity, FIUGroupMemberEntity }

/** Model wrapper for group entities and group data access methods. */
export class FIUGroupModel extends FIUModel<FIUGroupEntity> {
    private static joinRequestsTableMissing: boolean | null = null

    /**
     * Best-effort: if this user has any accepted join requests,
     * attempt to create their own membership rows.
     *
     * This is designed to work with common RLS policies that allow
     * `group_members` inserts only when `user_id = auth.uid()`.
     */
    private static async finalizeAcceptedJoinRequestsForUser(
        resolvedUserId: string,
        client: SupabaseClient
    ): Promise<void> {
        if (this.joinRequestsTableMissing === true) return

        const { data: accepted, error } = await client
            .from('group_join_requests')
            .select('group_id')
            .eq('requester_id', resolvedUserId)
            .eq('status', 'accepted')

        if (error) {
            if (this.isMissingTableError(error, 'group_join_requests')) {
                this.joinRequestsTableMissing = true
            }
            return
        }

        const groupIds = (accepted ?? [])
            .map((row) => (row as { group_id?: string | null }).group_id)
            .filter((id): id is string => typeof id === 'string' && id.length > 0)

        if (groupIds.length === 0) return

        // Insert memberships for this user; ignore per-row failures.
        await Promise.all(
            groupIds.map(async (groupId) => {
                const { error: memberErr } = await client.from('group_members').upsert(
                    { group_id: groupId, user_id: resolvedUserId },
                    { onConflict: 'group_id,user_id' }
                )

                if (memberErr && !this.isRlsViolation(memberErr)) {
                    console.warn('FIUGroupModel.finalizeAcceptedJoinRequestsForUser: upsert failed', memberErr)
                }
            })
        )
    }

    private static isPostgresCode(error: unknown, code: string): boolean {
        if (!error || typeof error !== 'object') return false
        const err = error as { code?: unknown }
        return err.code === code
    }

    private static isForeignKeyViolation(error: unknown): boolean {
        return this.isPostgresCode(error, '23503')
    }

    private static isRlsViolation(error: unknown): boolean {
        if (this.isPostgresCode(error, '42501')) return true
        if (!error || typeof error !== 'object') return false
        const err = error as { message?: unknown; details?: unknown }
        const text = `${String(err.message ?? '')} ${String(err.details ?? '')}`.toLowerCase()
        return text.includes('row level security') || text.includes('row-level security')
    }

    private static isMissingTableError(error: unknown, tableName: string): boolean {
        if (!error || typeof error !== 'object') return false
        const err = error as { code?: unknown; message?: unknown }
        if (err.code !== 'PGRST205') return false
        return typeof err.message === 'string' && err.message.includes(`public.${tableName}`)
    }

    private static isMissingColumnError(error: unknown): boolean {
        if (!error || typeof error !== 'object') return false
        const err = error as { code?: unknown; message?: unknown }
        if (err.code === '42703') return true
        return (
            typeof err.message === 'string' &&
            err.message.toLowerCase().includes('column') &&
            err.message.toLowerCase().includes('does not exist')
        )
    }

    get id() {
        return this.entity.id
    }

    get name() {
        return this.entity.name
    }

    /** Fetches groups available to the user (owned + member groups). */
    static async fetchGroupsForUser(
        userId?: string,
        client: SupabaseClient = supabase
    ): Promise<FIUGroupEntity[]> {
        const resolvedUserId = await this.resolveUserId(userId, client)
        if (!resolvedUserId) return []

        // If a group owner has accepted any join requests for this user, ensure the membership exists.
        // This avoids requiring the owner to insert membership rows for other users (often blocked by RLS).
        await this.finalizeAcceptedJoinRequestsForUser(resolvedUserId, client)

        const byId = new Map<string, FIUGroupEntity>()

        const { data: ownedGroups, error: ownedErr } = await client
            .from('groups')
            .select('id, name')
            .eq('created_by', resolvedUserId)

        if (ownedErr) {
            console.warn('FIUGroupModel.fetchGroupsForUser: groups query failed', ownedErr)
        } else {
            ;(ownedGroups ?? []).forEach((row) => {
                const item = row as { id?: string | null; name?: string | null }
                if (!item.id) return
                byId.set(item.id, {
                    id: item.id,
                    name: item.name ?? 'Untitled Group',
                })
            })
        }

        const { data: membershipRows, error: memberErr } = await client
            .from('group_members')
            .select('group_id')
            .eq('user_id', resolvedUserId)

        if (memberErr) {
            console.warn('FIUGroupModel.fetchGroupsForUser: group_members query failed', memberErr)
            return Array.from(byId.values())
        }

        const memberGroupIds = (membershipRows ?? [])
            .map((row) => (row as { group_id?: string | null }).group_id)
            .filter((id): id is string => typeof id === 'string' && id.length > 0)

        if (memberGroupIds.length > 0) {
            const { data: memberGroups, error: groupsErr } = await client
                .from('groups')
                .select('id, name')
                .in('id', memberGroupIds)

            if (groupsErr) {
                console.warn(
                    'FIUGroupModel.fetchGroupsForUser: member groups query failed',
                    groupsErr
                )
            } else {
                ;(memberGroups ?? []).forEach((row) => {
                    const item = row as { id?: string | null; name?: string | null }
                    if (!item.id) return
                    byId.set(item.id, {
                        id: item.id,
                        name: item.name ?? 'Untitled Group',
                    })
                })
            }
        }

        return Array.from(byId.values())
    }

    /** Creates a group and optionally assigns selected boards to it. */
    static async createGroup(
        name: string,
        boardIds: string[],
        userId?: string,
        client: SupabaseClient = supabase
    ): Promise<FIUGroupEntity> {
        const resolvedUserId = await this.resolveUserId(userId, client)
        if (!resolvedUserId) throw new Error('Unable to create group without a user session.')

        const insertVariants: Array<Record<string, unknown>> = [
            { name, created_by: resolvedUserId },
            { id: crypto.randomUUID(), name, created_by: resolvedUserId },
            { name },
        ]

        let createdGroup: { id: string; name: string | null } | null = null
        let lastInsertError: unknown = null

        for (const payload of insertVariants) {
            const { data, error } = await client
                .from('groups')
                .insert(payload)
                .select('id, name')
                .single()

            if (!error && data) {
                createdGroup = data as { id: string; name: string | null }
                break
            }

            lastInsertError = error
            console.warn('FIUGroupModel.createGroup: insert variant failed', {
                payloadKeys: Object.keys(payload),
                error,
            })
        }

        if (!createdGroup) {
            const message =
                typeof lastInsertError === 'object' &&
                lastInsertError !== null &&
                'message' in lastInsertError &&
                typeof (lastInsertError as { message?: unknown }).message === 'string'
                    ? (lastInsertError as { message: string }).message
                    : 'Unknown insert error'

            throw new Error(`Unable to create group: ${message}`)
        }

        const groupId = createdGroup.id

        const { error: memberError } = await client.from('group_members').upsert(
            {
                group_id: groupId,
                user_id: resolvedUserId,
            },
            { onConflict: 'group_id,user_id' }
        )

        if (memberError) {
            console.warn('FIUGroupModel.createGroup: unable to add creator membership', memberError)
        }

        if (boardIds.length > 0) {
            const { error: updateError } = await client
                .from('devices')
                .update({ group_id: groupId })
                .in('id', boardIds)

            if (updateError) {
                console.error('FIUGroupModel.createGroup: assigning boards failed', updateError)
                throw new Error('Group created, but unable to assign selected boards.')
            }
        }

        const row = createdGroup
        return {
            id: row.id,
            name: row.name,
        }
    }

    /** Renames an existing group. */
    static async renameGroup(
        groupId: string,
        name: string,
        client: SupabaseClient = supabase
    ): Promise<void> {
        const { error } = await client.from('groups').update({ name }).eq('id', groupId)
        if (error) {
            console.error('FIUGroupModel.renameGroup: update failed', error)
            throw new Error('Unable to rename group.')
        }
    }

    /** Deletes an existing group and clears board group references. */
    static async deleteGroup(groupId: string, client: SupabaseClient = supabase): Promise<void> {
        const { error: clearDevicesError } = await client
            .from('devices')
            .update({ group_id: null })
            .eq('group_id', groupId)

        if (clearDevicesError) {
            console.warn(
                'FIUGroupModel.deleteGroup: clearing device group_id failed',
                clearDevicesError
            )
        }

        if (this.joinRequestsTableMissing !== true) {
            const { error: requestsDeleteError } = await client
                .from('group_join_requests')
                .delete()
                .eq('group_id', groupId)

            if (requestsDeleteError) {
                if (this.isMissingTableError(requestsDeleteError, 'group_join_requests')) {
                    this.joinRequestsTableMissing = true
                } else {
                    console.warn(
                        'FIUGroupModel.deleteGroup: deleting join requests failed',
                        requestsDeleteError
                    )
                }
            }
        }

        const { error: memberDeleteError } = await client
            .from('group_members')
            .delete()
            .eq('group_id', groupId)

        if (memberDeleteError) {
            console.warn('FIUGroupModel.deleteGroup: deleting memberships failed', memberDeleteError)
        }

        const { error } = await client.from('groups').delete().eq('id', groupId)
        if (error) {
            console.error('FIUGroupModel.deleteGroup: delete failed', error)
            throw new Error('Unable to remove group.')
        }
    }

    /** Sends a request to join a group by UUID. */
    static async requestJoinGroup(
        groupId: string,
        userId?: string,
        client: SupabaseClient = supabase
    ): Promise<void> {
        if (this.joinRequestsTableMissing === true) {
            throw new Error('Group join requests are not enabled (missing `group_join_requests` table).')
        }

        const resolvedUserId = await this.resolveUserId(userId, client)
        if (!resolvedUserId) throw new Error('Unable to request group join without a user session.')

        const { data: existingMembership } = await client
            .from('group_members')
            .select('group_id')
            .eq('group_id', groupId)
            .eq('user_id', resolvedUserId)
            .maybeSingle()

        if (existingMembership) {
            throw new Error('You are already a member of this group.')
        }

        const { data: pendingRequest, error: pendingErr } = await client
            .from('group_join_requests')
            .select('id')
            .eq('group_id', groupId)
            .eq('requester_id', resolvedUserId)
            .eq('status', 'pending')
            .maybeSingle()

        if (pendingErr && this.isMissingTableError(pendingErr, 'group_join_requests')) {
            this.joinRequestsTableMissing = true
            throw new Error('Group join requests are not enabled (missing `group_join_requests` table).')
        }

        if (pendingRequest) {
            throw new Error('You already have a pending request for this group.')
        }

        const { error } = await client.from('group_join_requests').insert({
            group_id: groupId,
            requester_id: resolvedUserId,
            status: 'pending',
        })

        if (error) {
            if (this.isMissingTableError(error, 'group_join_requests')) {
                this.joinRequestsTableMissing = true
                throw new Error('Group join requests are not enabled (missing `group_join_requests` table).')
            }

            // Under strict RLS, non-members cannot `SELECT` from `groups`, so we avoid a pre-check.
            // If the UUID is invalid, the FK constraint on group_id will raise a 23503.
            if (this.isForeignKeyViolation(error)) {
                throw new Error('Group UUID not found.')
            }

            if (this.isRlsViolation(error)) {
                throw new Error('Unable to send join request (not permitted by policy).')
            }

            console.error('FIUGroupModel.requestJoinGroup: insert failed', error)
            throw new Error('Unable to send join request.')
        }
    }

    /** Fetches pending join requests for groups created by the active user. */
    static async fetchPendingJoinRequests(
        userId?: string,
        client: SupabaseClient = supabase
    ): Promise<FIUGroupJoinRequestEntity[]> {
        if (this.joinRequestsTableMissing === true) return []

        const resolvedUserId = await this.resolveUserId(userId, client)
        if (!resolvedUserId) return []

        const { data: ownedGroups, error: ownedErr } = await client
            .from('groups')
            .select('id')
            .eq('created_by', resolvedUserId)

        if (ownedErr) {
            console.warn('FIUGroupModel.fetchPendingJoinRequests: groups query failed', ownedErr)
            return []
        }

        const groupIds = (ownedGroups ?? [])
            .map((row) => (row as { id?: string | null }).id)
            .filter((id): id is string => typeof id === 'string' && id.length > 0)

        if (groupIds.length === 0) return []

        const { data: requests, error } = await client
            .from('group_join_requests')
            .select('id, group_id, requester_id, status')
            .in('group_id', groupIds)
            .eq('status', 'pending')

        if (error) {
            if (this.isMissingTableError(error, 'group_join_requests')) {
                this.joinRequestsTableMissing = true
                return []
            }
            console.warn('FIUGroupModel.fetchPendingJoinRequests: query failed', error)
            return []
        }

        return (requests ?? []) as FIUGroupJoinRequestEntity[]
    }

    /** Accepts or declines a pending join request. */
    static async respondToJoinRequest(
        requestId: string,
        accept: boolean,
        userId?: string,
        client: SupabaseClient = supabase
    ): Promise<void> {
        if (this.joinRequestsTableMissing === true) {
            throw new Error('Group join requests are not enabled.')
        }

        const resolvedUserId = await this.resolveUserId(userId, client)
        if (!resolvedUserId) throw new Error('Unable to process request without a user session.')

        const { data: request, error: requestErr } = await client
            .from('group_join_requests')
            .select('id, group_id, requester_id, status')
            .eq('id', requestId)
            .maybeSingle()

        if (requestErr) {
            if (this.isMissingTableError(requestErr, 'group_join_requests')) {
                this.joinRequestsTableMissing = true
                throw new Error('Group join requests are not enabled.')
            }
            console.error('FIUGroupModel.respondToJoinRequest: request lookup failed', requestErr)
            throw new Error('Unable to load join request.')
        }

        if (!request) throw new Error('Join request not found.')

        const requestRow = request as FIUGroupJoinRequestEntity

        const { data: ownerGroup, error: ownerErr } = await client
            .from('groups')
            .select('id')
            .eq('id', requestRow.group_id)
            .eq('created_by', resolvedUserId)
            .maybeSingle()

        if (ownerErr) {
            console.error('FIUGroupModel.respondToJoinRequest: ownership lookup failed', ownerErr)
            throw new Error('Unable to verify group permissions.')
        }

        if (!ownerGroup) {
            throw new Error('Only the group owner can respond to this request.')
        }

        if (accept) {
            const { error: memberErr } = await client.from('group_members').upsert(
                {
                    group_id: requestRow.group_id,
                    user_id: requestRow.requester_id,
                },
                { onConflict: 'group_id,user_id' }
            )

            // Many RLS configurations only allow users to insert their *own* membership rows.
            // If that policy is in place, the upsert will fail for owners adding other users.
            // In that case, we still accept the request and let the requester finalize membership client-side.
            if (memberErr && !this.isRlsViolation(memberErr)) {
                console.error('FIUGroupModel.respondToJoinRequest: membership insert failed', memberErr)
                throw new Error('Unable to add member to group.')
            }
        }

        const nextStatus = accept ? 'accepted' : 'declined'
        const { error: updateErr } = await client
            .from('group_join_requests')
            .update({ status: nextStatus })
            .eq('id', requestId)

        if (updateErr) {
            if (this.isMissingTableError(updateErr, 'group_join_requests')) {
                this.joinRequestsTableMissing = true
                throw new Error('Group join requests are not enabled.')
            }
            console.error('FIUGroupModel.respondToJoinRequest: status update failed', updateErr)
            throw new Error('Unable to update join request.')
        }

        // Note: membership insertion happens above; status update is the authoritative owner action.
    }

    /** Fetches group member rows for the provided group ids. */
    static async fetchMembersForGroups(
        groupIds: string[],
        client: SupabaseClient = supabase
    ): Promise<FIUGroupMemberEntity[]> {
        if (groupIds.length === 0) return []

        const { data, error } = await client
            .from('group_members')
            .select('group_id, user_id')
            .in('group_id', groupIds)

        if (error) {
            console.warn('FIUGroupModel.fetchMembersForGroups: query failed', error)
            return []
        }

        const rows = (data ?? []) as Array<{ group_id: string; user_id: string }>
        const uniqueUserIds = Array.from(
            new Set(rows.map((row) => row.user_id).filter((id) => typeof id === 'string' && id.length > 0))
        )

        const labelByUserId = new Map<string, string>()
        uniqueUserIds.forEach((id) => {
            labelByUserId.set(id, `No name set (${id.slice(0, 8)})`)
        })

        if (uniqueUserIds.length > 0) {
            // Your schema defines only: profiles(id, display_name, created_at, updated_at)
            // Keep the query minimal to avoid 400s for missing columns.
            const selectVariants = ['id, display_name', 'id']

            let profiles: unknown[] | null = null
            let lastProfileError: unknown = null

            for (const select of selectVariants) {
                const { data, error: profileErr } = await client
                    .from('profiles')
                    .select(select)
                    .in('id', uniqueUserIds)

                if (!profileErr) {
                    profiles = (data ?? []) as unknown[]
                    lastProfileError = null
                    break
                }

                lastProfileError = profileErr

                if (this.isMissingTableError(profileErr, 'profiles')) {
                    profiles = []
                    lastProfileError = null
                    break
                }

                if (!this.isMissingColumnError(profileErr)) {
                    break
                }
            }

            if (lastProfileError) {
                console.warn('FIUGroupModel.fetchMembersForGroups: profiles query failed', lastProfileError)
            }

            ;(profiles ?? []).forEach((profile) => {
                const item = profile as {
                    id?: string | null
                    display_name?: string | null
                }
                if (!item.id) return
                const label = item.display_name?.trim()
                if (label) labelByUserId.set(item.id, label)
            })
        }

        return rows.map((row) => ({
            group_id: row.group_id,
            user_id: row.user_id,
            user_name: labelByUserId.get(row.user_id) ?? `No name set (${row.user_id.slice(0, 8)})`,
        }))
    }
}
