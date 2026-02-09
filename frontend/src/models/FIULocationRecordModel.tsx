import { FIUModel } from './FIUModel'
import type { FIULocationRecordEntity } from '../entities/FIULocationRecordEntity.tsx'

/** UI-friendly model for a single device location record. */
export class FIULocationRecordModel extends FIUModel<FIULocationRecordEntity> {
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
