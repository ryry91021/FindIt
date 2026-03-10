import type { SupabaseClient } from '@supabase/supabase-js'
import type { FIUGroupEntity } from '../entities/FIUGroupEntity'
import type {
    FIUGroupJoinRequestEntity,
    FIUGroupMemberEntity,
} from '../entities/FIUGroupMembershipEntities'
import { supabase } from '../services/supabaseClient'
import { FIUModel } from './FIUModel'
import { FIUProfileModel } from './FIUProfileModel'

export type { FIUGroupJoinRequestEntity, FIUGroupMemberEntity }

/** Model wrapper for group entities and group data access methods. */
export class FIUGroupModel extends FIUModel<FIUGroupEntity> {
    get id() {
        return this.entity.id
    }

    get name() {
        return this.entity.name
    }

    private static async resolveUserId(
        userId?: string,
        client: SupabaseClient = supabase
    ): Promise<string | undefined> {
        if (userId) return userId
        const { data, error } = await client.auth.getSession()
        if (error) {
            console.error('FIUGroupModel.resolveUserId: auth.getSession failed', error)
            throw new Error('Unable to resolve user identity.')
        }
        return data.session?.user?.id
    }

    /** Fetches groups available to the user (owned + member groups). */
    static async fetchGroupsForUser(
        userId?: string,
        client: SupabaseClient = supabase
    ): Promise<FIUGroupEntity[]> {
        const resolvedUserId = await FIUGroupModel.resolveUserId(userId, client)
        if (!resolvedUserId) return []

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
        const resolvedUserId = await FIUGroupModel.resolveUserId(userId, client)
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

        const { error: requestsDeleteError } = await client
            .from('group_join_requests')
            .delete()
            .eq('group_id', groupId)

        if (requestsDeleteError) {
            console.warn(
                'FIUGroupModel.deleteGroup: deleting join requests failed',
                requestsDeleteError
            )
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
        const resolvedUserId = await FIUGroupModel.resolveUserId(userId, client)
        if (!resolvedUserId) throw new Error('Unable to request group join without a user session.')

        const { data: groupExists, error: existsError } = await client
            .from('groups')
            .select('id')
            .eq('id', groupId)
            .maybeSingle()

        if (existsError) {
            console.error('FIUGroupModel.requestJoinGroup: group lookup failed', existsError)
            throw new Error('Unable to validate group ID.')
        }

        if (!groupExists) {
            throw new Error('Group UUID not found.')
        }

        const { data: existingMembership } = await client
            .from('group_members')
            .select('group_id')
            .eq('group_id', groupId)
            .eq('user_id', resolvedUserId)
            .maybeSingle()

        if (existingMembership) {
            throw new Error('You are already a member of this group.')
        }

        const { data: pendingRequest } = await client
            .from('group_join_requests')
            .select('id')
            .eq('group_id', groupId)
            .eq('requester_id', resolvedUserId)
            .eq('status', 'pending')
            .maybeSingle()

        if (pendingRequest) {
            throw new Error('You already have a pending request for this group.')
        }

        const { error } = await client.from('group_join_requests').insert({
            group_id: groupId,
            requester_id: resolvedUserId,
            status: 'pending',
        })

        if (error) {
            console.error('FIUGroupModel.requestJoinGroup: insert failed', error)
            throw new Error('Unable to send join request.')
        }
    }

    /** Fetches pending join requests for groups created by the active user. */
    static async fetchPendingJoinRequests(
        userId?: string,
        client: SupabaseClient = supabase
    ): Promise<FIUGroupJoinRequestEntity[]> {
        const resolvedUserId = await FIUGroupModel.resolveUserId(userId, client)
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
        const resolvedUserId = await FIUGroupModel.resolveUserId(userId, client)
        if (!resolvedUserId) throw new Error('Unable to process request without a user session.')

        const { data: request, error: requestErr } = await client
            .from('group_join_requests')
            .select('id, group_id, requester_id, status')
            .eq('id', requestId)
            .maybeSingle()

        if (requestErr) {
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

        const nextStatus = accept ? 'accepted' : 'declined'
        const { error: updateErr } = await client
            .from('group_join_requests')
            .update({ status: nextStatus })
            .eq('id', requestId)

        if (updateErr) {
            console.error('FIUGroupModel.respondToJoinRequest: status update failed', updateErr)
            throw new Error('Unable to update join request.')
        }

        if (accept) {
            const { error: memberErr } = await client.from('group_members').upsert(
                {
                    group_id: requestRow.group_id,
                    user_id: requestRow.requester_id,
                },
                { onConflict: 'group_id,user_id' }
            )

            if (memberErr) {
                console.error('FIUGroupModel.respondToJoinRequest: membership insert failed', memberErr)
                throw new Error('Request accepted, but unable to add member to group.')
            }
        }
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

        try {
            const profileLabels = await FIUProfileModel.fetchLabelsForUsers(uniqueUserIds, client)
            profileLabels.forEach((label, userId) => {
                labelByUserId.set(userId, label)
            })
        } catch (err) {
            console.warn('FIUGroupModel.fetchMembersForGroups: profiles lookup failed', err)
        }

        return rows.map((row) => ({
            group_id: row.group_id,
            user_id: row.user_id,
            user_name: labelByUserId.get(row.user_id) ?? `No name set (${row.user_id.slice(0, 8)})`,
        }))
    }
}
