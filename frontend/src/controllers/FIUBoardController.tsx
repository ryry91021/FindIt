import type { FIUBoardEntity } from '../entities/FIUBoardEntity'
import type { FIULocationRecordEntity } from '../entities/FIULocationRecordEntity'
import { fetchBoardsForCurrentUser } from '../services/deviceRepo'
import { fetchLatestLocationsForDevices } from '../services/locationRepo'

/** Loads board and location data for the dashboard/map. */
export class FIUBoardController {
    /** Loads boards for a user and fetches their latest locations. */
    async loadBoardsAndLatestLocations(userId?: string): Promise<{
        boards: FIUBoardEntity[]
        locations: FIULocationRecordEntity[]
    }> {
        try {
            const boards = await fetchBoardsForCurrentUser(userId)
            const deviceIds = boards.map((b) => b.id)
            const locations = await fetchLatestLocationsForDevices(deviceIds)
            return { boards, locations }
        } catch (err) {
            console.error('FIUBoardController.loadBoardsAndLatestLocations failed', err)
            throw new Error('Unable to load dashboard data. Please try again.')
        }
    }
}
