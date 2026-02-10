import { describe, expect, it, vi } from 'vitest'

vi.mock('../../src/services/deviceRepo', () => ({
  fetchBoardsForCurrentUser: vi.fn(),
}))

vi.mock('../../src/services/locationRepo', () => ({
  fetchLatestLocationsForDevices: vi.fn(),
}))

describe('FIUBoardController', () => {
  it('loads boards and latest locations', async () => {
    const { fetchBoardsForCurrentUser } = await import('../../src/services/deviceRepo')
    const { fetchLatestLocationsForDevices } = await import('../../src/services/locationRepo')
    const { FIUBoardController } = await import('../../src/controllers/FIUBoardController')

    ;(fetchBoardsForCurrentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'd1', display_name: 'Board 1' },
      { id: 'd2', display_name: 'Board 2' },
    ])

    ;(fetchLatestLocationsForDevices as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        device_id: 'd1',
        latitude: 1,
        longitude: 2,
        accuracy_meters: 10,
        recorded_at: '2026-02-10T00:00:00.000Z',
      },
    ])

    const controller = new FIUBoardController()
    const res = await controller.loadBoardsAndLatestLocations('user-1')

    expect(fetchBoardsForCurrentUser).toHaveBeenCalledWith('user-1')
    expect(fetchLatestLocationsForDevices).toHaveBeenCalledWith(['d1', 'd2'])
    expect(res.boards).toHaveLength(2)
    expect(res.locations).toHaveLength(1)
  })

  it('throws a friendly error on failure', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { fetchBoardsForCurrentUser } = await import('../../src/services/deviceRepo')
    const { FIUBoardController } = await import('../../src/controllers/FIUBoardController')

    ;(fetchBoardsForCurrentUser as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('boom')
    )

    const controller = new FIUBoardController()
    await expect(controller.loadBoardsAndLatestLocations('user-1')).rejects.toThrow(
      'Unable to load dashboard data. Please try again.'
    )
  })
})
