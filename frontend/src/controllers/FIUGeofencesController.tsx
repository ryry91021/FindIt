import { FIUGeofenceModel } from '../models/FIUGeofenceModel'
import type { FIUGeofenceEntity } from '../entities/FIUGeofenceEntity'
import type { FIUGeofenceCreateInput, FIUGeofenceUpdatePatch } from '../models/FIUGeofenceModel'

export interface FIUGeofencesControllerPort {
    loadGeofences(userId?: string): Promise<FIUGeofenceEntity[]>
    createGeofence(input: FIUGeofenceCreateInput, userId?: string): Promise<void>
    updateGeofence(geofenceId: string, patch: FIUGeofenceUpdatePatch): Promise<void>
    toggleEnabled(geofenceId: string, enabled: boolean): Promise<void>
    deleteGeofence(geofenceId: string): Promise<void>
}

/** Domain controller for Geofence operations (no UI, no cross-domain orchestration). */
export class FIUGeofencesController implements FIUGeofencesControllerPort {
    async loadGeofences(userId?: string): Promise<FIUGeofenceEntity[]> {
        return await FIUGeofenceModel.fetchGeofencesForUser(userId)
    }

    async createGeofence(input: FIUGeofenceCreateInput, userId?: string): Promise<void> {
        await FIUGeofenceModel.createGeofence(input, userId)
    }

    async updateGeofence(geofenceId: string, patch: FIUGeofenceUpdatePatch): Promise<void> {
        await FIUGeofenceModel.updateGeofence(geofenceId, patch)
    }

    async toggleEnabled(geofenceId: string, enabled: boolean): Promise<void> {
        await FIUGeofenceModel.updateGeofence(geofenceId, { enabled })
    }

    async deleteGeofence(geofenceId: string): Promise<void> {
        await FIUGeofenceModel.deleteGeofence(geofenceId)
    }
}
