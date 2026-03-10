import type { FIUEntity } from './FIUEntity'

export interface FIUGroupEntity extends FIUEntity {
    name: string | null
}

// Backward-compatible alias for the requested naming.
export type FIUGroupaEntity = FIUGroupEntity
