import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from '../services/supabaseClient'
import type { FIUGeofenceEntity } from '../entities/FIUGeofenceEntity'
import { FIUModel } from './FIUModel'

export type FIUGeofenceCreateInput = {
    name: string
    center_lat: number
    center_lon: number
    radius_meters: number
    enabled?: boolean
    color?: string
}

export type FIUGeofenceUpdatePatch = Partial<{
    name: string
    center_lat: number
    center_lon: number
    radius_meters: number
    enabled: boolean
    color: string
}>

/** Supabase-backed CRUD model for geofences. */
export class FIUGeofenceModel extends FIUModel<FIUGeofenceEntity> {
    private static isMissingEnabledColumnError(errorText: string): boolean {
        const text = (errorText ?? '').toLowerCase()
        if (!text) return false
        if (text.includes('column "enabled"') && text.includes('does not exist')) return true
        if (text.includes("could not find the 'enabled' column")) return true
        if (text.includes('schema cache') && text.includes('enabled')) return true
        // PostgREST missing column error code.
        if (text.includes('pgrst204') && text.includes('enabled')) return true
        return false
    }

    private static isMissingColorColumnError(errorText: string): boolean {
        const text = (errorText ?? '').toLowerCase()
        if (!text) return false
        if (text.includes('column "color"') && text.includes('does not exist')) return true
        if (text.includes("could not find the 'color' column")) return true
        if (text.includes('schema cache') && text.includes('color')) return true
        // PostgREST missing column error code.
        if (text.includes('pgrst204') && text.includes('color')) return true
        return false
    }

    static async fetchGeofencesForUser(
        userId?: string,
        client: SupabaseClient = supabase
    ): Promise<FIUGeofenceEntity[]> {
        const ownerId = await this.resolveUserId(userId, client)
        if (!ownerId) return []

        // Use select('*') so this continues to work even if the `enabled` column
        // hasn't been added yet. (Toggling will require the column.)
        const { data, error } = await client
            .from('geofences')
            .select('*')
            .order('created_at', { ascending: false })

        if (error) {
            console.error('FIUGeofenceModel.fetchGeofencesForUser: select failed', {
                error,
                errorText: this.formatSupabaseError(error),
            })
            throw new Error('Unable to load geofences.')
        }

        return (data ?? []) as FIUGeofenceEntity[]
    }

    static async createGeofence(
        input: FIUGeofenceCreateInput,
        userId?: string,
        client: SupabaseClient = supabase
    ): Promise<void> {
        const ownerId = await this.resolveUserId(userId, client)
        if (!ownerId) throw new Error('Unable to create geofence without a user session.')

        const payload = {
            owner_id: ownerId,
            name: input.name,
            center_lat: input.center_lat,
            center_lon: input.center_lon,
            radius_meters: input.radius_meters,
            enabled: input.enabled ?? true,
            color: input.color ?? '#3388ff',
        }

        // Try to insert with all fields.
        const { error } = await client.from('geofences').insert(payload)
        if (!error) return

        const message = this.formatSupabaseError(error)

        // Handle missing enabled column - retry without it but keep color
        if (FIUGeofenceModel.isMissingEnabledColumnError(message)) {
            const { error: fallbackErr1 } = await client.from('geofences').insert({
                owner_id: ownerId,
                name: input.name,
                center_lat: input.center_lat,
                center_lon: input.center_lon,
                radius_meters: input.radius_meters,
                color: input.color ?? '#3388ff',
            })
            if (!fallbackErr1) return

            // If still failed, it might be the color column - try without that too
            const fallbackMsg1 = this.formatSupabaseError(fallbackErr1)
            if (FIUGeofenceModel.isMissingColorColumnError(fallbackMsg1)) {
                const { error: fallbackErr2 } = await client.from('geofences').insert({
                    owner_id: ownerId,
                    name: input.name,
                    center_lat: input.center_lat,
                    center_lon: input.center_lon,
                    radius_meters: input.radius_meters,
                })
                if (!fallbackErr2) return

                console.error('FIUGeofenceModel.createGeofence: fallback (no enabled, no color) failed', {
                    error: fallbackErr2,
                    errorText: this.formatSupabaseError(fallbackErr2),
                })
            } else {
                console.error('FIUGeofenceModel.createGeofence: fallback (no enabled) failed', {
                    error: fallbackErr1,
                    errorText: fallbackMsg1,
                })
            }
        }
        // Handle missing color column - retry without it but keep enabled
        else if (FIUGeofenceModel.isMissingColorColumnError(message)) {
            const { error: fallbackErr } = await client.from('geofences').insert({
                owner_id: ownerId,
                name: input.name,
                center_lat: input.center_lat,
                center_lon: input.center_lon,
                radius_meters: input.radius_meters,
                enabled: input.enabled ?? true,
            })
            if (!fallbackErr) return

            console.error('FIUGeofenceModel.createGeofence: fallback (no color) failed', {
                error: fallbackErr,
                errorText: this.formatSupabaseError(fallbackErr),
            })
        } else {
            console.error('FIUGeofenceModel.createGeofence: insert failed', {
                error,
                errorText: message,
            })
        }

        throw new Error('Unable to create geofence.')
    }

    static async updateGeofence(
        geofenceId: string,
        patch: FIUGeofenceUpdatePatch,
        client: SupabaseClient = supabase
    ): Promise<void> {
        if (!geofenceId) return
        if (!patch || Object.keys(patch).length === 0) return

        const { error } = await client.from('geofences').update(patch).eq('id', geofenceId)
        if (!error) return

        const message = this.formatSupabaseError(error)
        const hasEnabledInPatch = Object.prototype.hasOwnProperty.call(patch, 'enabled')
        const hasColorInPatch = Object.prototype.hasOwnProperty.call(patch, 'color')
        const onlyEnabled = hasEnabledInPatch && Object.keys(patch).length === 1
        const onlyColor = hasColorInPatch && Object.keys(patch).length === 1

        // Handle missing enabled column
        if (hasEnabledInPatch && FIUGeofenceModel.isMissingEnabledColumnError(message)) {
            if (onlyEnabled) {
                console.error('FIUGeofenceModel.updateGeofence: enabled column missing?', {
                    error,
                    errorText: message,
                })
                throw new Error(
                    'Unable to toggle geofence. Database is missing `geofences.enabled` (boolean) column.'
                )
            }

            // Retry the update without the `enabled` field so other edits can still succeed.
            const fallbackPatch = { ...patch } as FIUGeofenceUpdatePatch
            delete (fallbackPatch as Partial<{ enabled: boolean }>).enabled
            const { error: fallbackErr } = await client
                .from('geofences')
                .update(fallbackPatch)
                .eq('id', geofenceId)

            if (!fallbackErr) return
            console.error('FIUGeofenceModel.updateGeofence: fallback update (no enabled) failed', {
                error: fallbackErr,
                errorText: this.formatSupabaseError(fallbackErr),
            })
            throw new Error('Unable to update geofence.')
        }

        // Handle missing color column
        if (hasColorInPatch && FIUGeofenceModel.isMissingColorColumnError(message)) {
            if (onlyColor) {
                console.warn('FIUGeofenceModel.updateGeofence: color column missing', {
                    error,
                    errorText: message,
                })
                // Don't throw - just warn, since color change is non-critical
                return
            }

            // Retry the update without the `color` field so other edits can still succeed.
            const fallbackPatch = { ...patch } as FIUGeofenceUpdatePatch
            delete (fallbackPatch as Partial<{ color: string }>).color
            const { error: fallbackErr } = await client
                .from('geofences')
                .update(fallbackPatch)
                .eq('id', geofenceId)

            if (!fallbackErr) return
            console.error('FIUGeofenceModel.updateGeofence: fallback update (no color) failed', {
                error: fallbackErr,
                errorText: this.formatSupabaseError(fallbackErr),
            })
            throw new Error('Unable to update geofence.')
        }

        console.error('FIUGeofenceModel.updateGeofence: update failed', {
            error,
            errorText: message,
        })
        throw new Error('Unable to update geofence.')
    }

    static async deleteGeofence(geofenceId: string, client: SupabaseClient = supabase): Promise<void> {
        if (!geofenceId) return

        const { error } = await client.from('geofences').delete().eq('id', geofenceId)
        if (error) {
            console.error('FIUGeofenceModel.deleteGeofence: delete failed', {
                error,
                errorText: this.formatSupabaseError(error),
            })
            throw new Error('Unable to remove geofence.')
        }
    }
}
