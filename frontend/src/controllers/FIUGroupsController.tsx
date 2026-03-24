import { FIUGroupModel } from '../models/FIUGroupModel'
import type { FIUGroupEntity } from '../entities/FIUGroupEntity'
import type { FIUGroupJoinRequestEntity, FIUGroupMemberEntity } from '../models/FIUGroupModel'

/** Domain controller for Group operations (no UI, no cross-domain orchestration). */
export class FIUGroupsController {
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
}
