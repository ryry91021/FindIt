import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from '../services/supabaseClient'
import type { FIUGeofenceEntity } from '../entities/FIUGeofenceEntity'
import { FIUModel } from './FIUModel'

export type FIUGeofenceCreateInput = {
    name: string
    center_lat: number
    center_lon: number
    radius_meters: number
    group_id?: string | null
    enabled?: boolean
}

export type FIUGeofenceUpdatePatch = Partial<{
    name: string
    center_lat: number
    center_lon: number
    radius_meters: number
    group_id: string | null
    enabled: boolean
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
            group_id: input.group_id ?? null,
            enabled: input.enabled ?? true,
        }

        // If the database doesn't yet have the `enabled` column, fall back to inserting
        // without it (UI will still show toggles but persistence will require the column).
        const { error } = await client.from('geofences').insert(payload)
        if (!error) return

        const message = this.formatSupabaseError(error)
        if (FIUGeofenceModel.isMissingEnabledColumnError(message)) {
            const { error: fallbackErr } = await client
                .from('geofences')
                .insert({
                    owner_id: ownerId,
                    name: input.name,
                    center_lat: input.center_lat,
                    center_lon: input.center_lon,
                    radius_meters: input.radius_meters,
                    group_id: input.group_id ?? null,
                })
            if (!fallbackErr) return
            console.error('FIUGeofenceModel.createGeofence: fallback insert failed', {
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
        const onlyEnabled = hasEnabledInPatch && Object.keys(patch).length === 1

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
            console.error('FIUGeofenceModel.updateGeofence: fallback update failed', {
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
