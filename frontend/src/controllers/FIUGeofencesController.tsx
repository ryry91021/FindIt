import { FIUGeofenceModel } from '../models/FIUGeofenceModel'
import type { FIUGeofenceEntity } from '../entities/FIUGeofenceEntity'
import type { FIUGeofenceCreateInput, FIUGeofenceUpdatePatch } from '../models/FIUGeofenceModel'

/** Domain controller for Geofence operations (no UI, no cross-domain orchestration). */
export class FIUGeofencesController {
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
}
