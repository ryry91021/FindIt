/*
    Responsibilities:
    - UI accessors for location
            records:
                - deviceID
                - Lat, lon
                - Timestamp label
      Retrieves location data from
        - database for user’s boards
*/

import type { SupabaseClient } from '@supabase/supabase-js'

import { FIUModel } from './FIUModel'
import type { FIULocationRecordEntity } from '../entities/FIULocationRecordEntity'
import { supabase } from '../services/supabaseClient'




/** UI-friendly model for a single device location record. */
export class FIULocationRecordModel extends FIUModel<FIULocationRecordEntity> {
    /** Fetches the most recent location record for each requested device. */
    static async fetchLatestLocationsForDevices(
        deviceIds: string[],
        client: SupabaseClient = supabase
    ): Promise<FIULocationRecordEntity[]> {
        if (!deviceIds || deviceIds.length === 0) return []

        const { data, error } = await client
            .from('location_logs')
            .select('device_id, latitude, longitude, accuracy_meters, recorded_at')
            .in('device_id', deviceIds)
            .order('recorded_at', { ascending: false })

        if (error) {
            console.error('FIULocationRecordModel.fetchLatestLocationsForDevices: query failed', error)
            throw new Error('Unable to load locations.')
        }

        const latestByDevice = new Map<string, FIULocationRecordEntity>()
        ;((data ?? []) as FIULocationRecordEntity[]).forEach((row) => {
            if (row?.device_id && !latestByDevice.has(row.device_id)) {
                latestByDevice.set(row.device_id, row)
            }
        })

        return Array.from(latestByDevice.values())
    }

    /** Device ID associated with this location record. */
    get deviceId() {
        return this.entity.device_id
    }

    /** Latitude in degrees. */
    get lat() {
        return this.entity.latitude
    }

    /** Longitude in degrees. */
    get lng() {
        return this.entity.longitude
    }

    /** Horizontal accuracy in meters (if present). */
    get accuracyMeters() {
        return this.entity.accuracy_meters
    }

    /** Timestamp (ISO string) when the record was captured. */
    get recordedAt() {
        return this.entity.recorded_at
    }

    /** Human-readable timestamp label for UI. */
    get timestampLabel() {
        return new Date(this.entity.recorded_at).toLocaleString()
    }
}
