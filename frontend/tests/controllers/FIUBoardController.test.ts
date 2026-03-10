import { describe, expect, it, vi } from 'vitest'

vi.mock('../../src/models/FIUBoardModel', () => ({
  FIUBoardModel: {
    loadBoardsAndLatestLocations: vi.fn(),
    createBoard: vi.fn(),
    deleteBoard: vi.fn(),
    renameBoard: vi.fn(),
    assignBoardToGroup: vi.fn(),
  },
}))

vi.mock('../../src/models/FIUGroupModel', () => ({
  FIUGroupModel: {
    fetchGroupsForUser: vi.fn(),
  },
}))

describe('FIUBoardController', () => {
  it('loads boards and latest locations', async () => {
    const { FIUBoardModel } = await import('../../src/models/FIUBoardModel')
    const { FIUBoardController } = await import('../../src/controllers/FIUBoardController')

    ;(FIUBoardModel.loadBoardsAndLatestLocations as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      boards: [
        { id: 'd1', display_name: 'Board 1', device_eui: 'EUI-1' },
        { id: 'd2', display_name: 'Board 2', device_eui: 'EUI-2' },
      ],
      locations: [
        {
          device_id: 'd1',
          latitude: 1,
          longitude: 2,
          accuracy_meters: 10,
          recorded_at: '2026-02-10T00:00:00.000Z',
        },
      ],
    })

    const controller = new FIUBoardController()
    const res = await controller.loadBoardsAndLatestLocations('user-1')

    expect(FIUBoardModel.loadBoardsAndLatestLocations).toHaveBeenCalledWith('user-1')
    expect(res.boards).toHaveLength(2)
    expect(res.locations).toHaveLength(1)
  })

  it('throws a friendly error on failure', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { FIUBoardModel } = await import('../../src/models/FIUBoardModel')
    const { FIUBoardController } = await import('../../src/controllers/FIUBoardController')

    ;(FIUBoardModel.loadBoardsAndLatestLocations as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('boom')
    )

    const controller = new FIUBoardController()
    await expect(controller.loadBoardsAndLatestLocations('user-1')).rejects.toThrow(
      'Unable to load dashboard data. Please try again.'
    )
  })
})
