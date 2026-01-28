import { FIUModel } from './FIUModel'
import type { FIULocationRecordEntity } from '../entities/FIULocationRecordEntity.tsx'

export class FIULocationRecordModel extends FIUModel<FIULocationRecordEntity> {
    get deviceId() {
        return this.entity.device_id
    }

    get lat() {
        return this.entity.latitude
    }

    get lng() {
        return this.entity.longitude
    }

    get accuracyMeters() {
        return this.entity.accuracy_meters
    }

    get recordedAt() {
        return this.entity.recorded_at
    }

    get timestampLabel() {
        return new Date(this.entity.recorded_at).toLocaleString()
    }
}
