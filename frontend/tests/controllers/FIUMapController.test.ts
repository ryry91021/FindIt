import { describe, expect, it, vi } from 'vitest'

vi.mock('../../src/models/FIUBoardModel', () => ({
  FIUBoardModel: {
    fetchBoardsForUser: vi.fn(),
    createBoard: vi.fn(),
    deleteBoard: vi.fn(),
    renameBoard: vi.fn(),
    assignBoardToGroup: vi.fn(),
    setBoardsForGroup: vi.fn(),
  },
}))

vi.mock('../../src/models/FIULocationRecordModel', () => ({
  FIULocationRecordModel: {
    fetchLatestLocationsForDevices: vi.fn(),
  },
}))

vi.mock('../../src/models/FIUGroupModel', () => ({
  FIUGroupModel: {
    fetchGroupsForUser: vi.fn(),
    fetchPendingJoinRequests: vi.fn(),
    fetchMembersForGroups: vi.fn(),
    createGroup: vi.fn(),
    deleteGroup: vi.fn(),
    renameGroup: vi.fn(),
    requestJoinGroup: vi.fn(),
    respondToJoinRequest: vi.fn(),
  },
}))

vi.mock('../../src/models/FIUGeofenceModel', () => ({
  FIUGeofenceModel: {
    fetchGeofencesForUser: vi.fn(),
    createGeofence: vi.fn(),
    updateGeofence: vi.fn(),
  },
}))

describe('FIUMapController', () => {
  it('loads boards and latest locations', async () => {
    const { FIUBoardModel } = await import('../../src/models/FIUBoardModel')
    const { FIULocationRecordModel } = await import('../../src/models/FIULocationRecordModel')
    const { FIUMapController } = await import('../../src/controllers/FIUMapController')

    ;(FIUBoardModel.fetchBoardsForUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'd1', display_name: 'Board 1', device_eui: 'EUI-1' },
      { id: 'd2', display_name: 'Board 2', device_eui: 'EUI-2' },
    ])

    ;(FIULocationRecordModel.fetchLatestLocationsForDevices as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        device_id: 'd1',
        latitude: 1,
        longitude: 2,
        accuracy_meters: 10,
        recorded_at: '2026-02-10T00:00:00.000Z',
      },
    ])

    const controller = new FIUMapController({ userEmail: undefined, userId: undefined, onLogout: () => {} })
    const res = await controller.loadBoardsAndLatestLocations('user-1')

    expect(FIUBoardModel.fetchBoardsForUser).toHaveBeenCalledWith('user-1')
    expect(FIULocationRecordModel.fetchLatestLocationsForDevices).toHaveBeenCalledWith(['d1', 'd2'])
    expect(res.boards).toHaveLength(2)
    expect(res.locations).toHaveLength(1)
  })

  it('throws a friendly error on failure', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { FIUBoardModel } = await import('../../src/models/FIUBoardModel')
    const { FIUMapController } = await import('../../src/controllers/FIUMapController')

    ;(FIUBoardModel.fetchBoardsForUser as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('boom'))

    const controller = new FIUMapController({ userEmail: undefined, userId: undefined, onLogout: () => {} })
    await expect(controller.loadBoardsAndLatestLocations('user-1')).rejects.toThrow(
      'Unable to load map data. Please try again.'
    )
  })
})
