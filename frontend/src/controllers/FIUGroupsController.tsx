import { FIUGroupModel } from '../models/FIUGroupModel'
import type { FIUGroupEntity } from '../entities/FIUGroupEntity'
import type { FIUGroupJoinRequestEntity, FIUGroupMemberEntity } from '../models/FIUGroupModel'

export interface FIUGroupsControllerPort {
    loadGroups(userId?: string): Promise<FIUGroupEntity[]>
    loadPendingJoinRequests(userId?: string): Promise<FIUGroupJoinRequestEntity[]>
    loadMembersForGroups(groupIds: string[]): Promise<FIUGroupMemberEntity[]>

    createGroup(name: string, boardIds: string[], userId?: string): Promise<void>
    deleteGroup(groupId: string): Promise<void>
    renameGroup(groupId: string, name: string): Promise<void>
    requestJoinGroup(groupId: string, userId?: string): Promise<void>
    respondToJoinRequest(requestId: string, accept: boolean, userId?: string): Promise<void>
    leaveGroup(groupId: string, userId?: string): Promise<void>
    setMemberRole(groupId: string, memberUserId: string, role: 'admin' | 'member'): Promise<void>
    removeMember(groupId: string, memberUserId: string): Promise<void>
    transferOwnership(groupId: string, newOwnerUserId: string, userId?: string): Promise<void>
}

/** Domain controller for Group operations (no UI, no cross-domain orchestration). */
export class FIUGroupsController implements FIUGroupsControllerPort {
    async loadGroups(userId?: string): Promise<FIUGroupEntity[]> {
        return await FIUGroupModel.fetchGroupsForUser(userId)
    }

    async loadPendingJoinRequests(userId?: string): Promise<FIUGroupJoinRequestEntity[]> {
        return await FIUGroupModel.fetchPendingJoinRequests(userId)
    }

    async loadMembersForGroups(groupIds: string[]): Promise<FIUGroupMemberEntity[]> {
        return await FIUGroupModel.fetchMembersForGroups(groupIds)
    }

    async createGroup(name: string, boardIds: string[], userId?: string): Promise<void> {
        await FIUGroupModel.createGroup(name, boardIds, userId)
    }

    async deleteGroup(groupId: string): Promise<void> {
        await FIUGroupModel.deleteGroup(groupId)
    }

    async renameGroup(groupId: string, name: string): Promise<void> {
        await FIUGroupModel.renameGroup(groupId, name)
    }

    async requestJoinGroup(groupId: string, userId?: string): Promise<void> {
        await FIUGroupModel.requestJoinGroup(groupId, userId)
    }

    async respondToJoinRequest(requestId: string, accept: boolean, userId?: string): Promise<void> {
        await FIUGroupModel.respondToJoinRequest(requestId, accept, userId)
    }

    async leaveGroup(groupId: string, userId?: string): Promise<void> {
        await FIUGroupModel.leaveGroup(groupId, userId)
    }

    async setMemberRole(groupId: string, memberUserId: string, role: 'admin' | 'member'): Promise<void> {
        await FIUGroupModel.setMemberRole(groupId, memberUserId, role)
    }

    async removeMember(groupId: string, memberUserId: string): Promise<void> {
        await FIUGroupModel.removeMember(groupId, memberUserId)
    }

    async transferOwnership(groupId: string, newOwnerUserId: string, userId?: string): Promise<void> {
        await FIUGroupModel.transferOwnership(groupId, newOwnerUserId, userId)
    }
}
