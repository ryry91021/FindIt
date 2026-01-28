import type { FIUBoardEntity } from '../entities/FIUBoardEntity'
import type { FIULocationRecordEntity } from '../entities/FIULocationRecordEntity'
import { fetchBoardsForCurrentUser } from '../services/deviceRepo'
import { fetchLatestLocationsForDevices } from '../services/locationRepo'

export class FIUBoardController {
    async loadBoardsAndLatestLocations(): Promise<{
        boards: FIUBoardEntity[]
        locations: FIULocationRecordEntity[]
    }> {
        const boards = await fetchBoardsForCurrentUser()
        const deviceIds = boards.map((b) => b.id)
        const locations = await fetchLatestLocationsForDevices(deviceIds)
        return { boards, locations }
    }
}
