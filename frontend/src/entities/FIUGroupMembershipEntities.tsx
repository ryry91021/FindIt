export interface FIUGroupJoinRequestEntity {
    id: string
    group_id: string
    requester_id: string
    status: string
}

export type FIUGroupRole = 'owner' | 'admin' | 'member'

export interface FIUGroupMemberEntity {
    group_id: string
    user_id: string
    user_name: string
    /** Role stored in group_members.role when available. */
    role?: FIUGroupRole
}
