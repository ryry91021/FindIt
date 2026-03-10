export interface FIUGroupJoinRequestEntity {
    id: string
    group_id: string
    requester_id: string
    status: string
}

export interface FIUGroupMemberEntity {
    group_id: string
    user_id: string
    user_name: string
}
