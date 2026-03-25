import type { FIUEntity } from './FIUEntity'

export interface FIUGroupEntity extends FIUEntity {
    name: string | null
    /** User id of the group owner/creator. */
    created_by?: string | null
}

// Backward-compatible alias for the requested naming.
export type FIUGroupaEntity = FIUGroupEntity
