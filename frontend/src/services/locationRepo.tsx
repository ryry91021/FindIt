import { supabase } from './supabaseClient'
import type { FIULocationRecordEntity } from '../entities/FIULocationRecordEntity'

export async function fetchLatestLocationsForDevices(
    deviceIds: string[]
): Promise<FIULocationRecordEntity[]> {
    if (!deviceIds || deviceIds.length === 0) return []

    const { data, error } = await supabase
        .from('location_logs')
        .select('device_id, latitude, longitude, accuracy_meters, recorded_at')
        .in('device_id', deviceIds)
        .order('recorded_at', { ascending: false })

    if (error) throw error

    const latestByDevice = new Map<string, FIULocationRecordEntity>()
        ; (data ?? []).forEach((row: any) => {
            if (!latestByDevice.has(row.device_id)) {
                latestByDevice.set(row.device_id, row as FIULocationRecordEntity)
            }
        })

    return Array.from(latestByDevice.values())
}
