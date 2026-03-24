import { FIULocationRecordModel } from '../models/FIULocationRecordModel'
import type { FIULocationRecordEntity } from '../entities/FIULocationRecordEntity'

/** Domain controller for LocationRecord operations (no UI, no cross-domain orchestration). */
export class FIULocationRecordsController {
    async loadLatestLocations(deviceIds: string[]): Promise<FIULocationRecordEntity[]> {
        return await FIULocationRecordModel.fetchLatestLocationsForDevices(deviceIds)
    }
}
