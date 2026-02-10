import { supabase } from './supabaseClient'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { FIULocationRecordEntity } from '../entities/FIULocationRecordEntity'

/** Fetches the most recent location record for each requested device. */
export async function fetchLatestLocationsForDevices(
    deviceIds: string[],
    client: SupabaseClient = supabase
): Promise<FIULocationRecordEntity[]> {
    if (!deviceIds || deviceIds.length === 0) return []

    const { data, error } = await client
        .from('location_logs')
        .select('device_id, latitude, longitude, accuracy_meters, recorded_at')
        .in('device_id', deviceIds)
        .order('recorded_at', { ascending: false })

    if (error) throw error

    const latestByDevice = new Map<string, FIULocationRecordEntity>()
    ;((data ?? []) as FIULocationRecordEntity[]).forEach((row) => {
        if (!latestByDevice.has(row.device_id)) {
            latestByDevice.set(row.device_id, row)
        }
    })

    return Array.from(latestByDevice.values())
}
