export interface FIULocationRecordEntity {
  device_id: string
  latitude: number
  longitude: number
  accuracy_meters: number | null
  recorded_at: string
}
