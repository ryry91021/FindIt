/*
    Responsibilities:
    - Provides interface for geofence data from the database
*/

export interface FIUGeofenceEntity {
    id: string
    owner_id: string | null
    name: string
    center_lat: number
    center_lon: number
    radius_meters: number
    created_at?: string | null
    group_id?: string | null
    /** Whether this geofence should be shown on the map. Persisted via `geofences.enabled` when available. */
    enabled?: boolean | null
    /** Color of the geofence circle on the map (hex color code). Defaults to '#3388ff' if not specified. */
    color?: string | null
}
