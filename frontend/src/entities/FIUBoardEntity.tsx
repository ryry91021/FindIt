/*
    Responsibilities:
    - Provides interface for board data from the database
*/

export interface FIUBoardEntity {
    id: string
    owner_id?: string | null
    display_name: string | null
    device_eui: string | null
    group_id?: string | null
}