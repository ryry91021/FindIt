/*
    Responsibilities:
    - Provides interface for boards’ data structure from the database
*/

export interface FIUBoardEntity {
    id: string
    display_name: string | null
}