import { describe, expect, it, vi } from 'vitest'

const order = vi.fn()
const query = {
  select: vi.fn(() => query),
  in: vi.fn(() => query),
  order,
}

vi.mock('../../src/services/supabaseClient', () => ({
  supabase: {
    from: vi.fn(() => query),
  },
}))

describe('fetchLatestLocationsForDevices', () => {
  it('returns only the newest record per device', async () => {
    order.mockResolvedValue({
      data: [
        {
          device_id: 'd1',
          latitude: 1,
          longitude: 1,
          accuracy_meters: null,
          recorded_at: '2026-02-10T10:00:00.000Z',
        },
        {
          device_id: 'd1',
          latitude: 0,
          longitude: 0,
          accuracy_meters: null,
          recorded_at: '2026-02-09T10:00:00.000Z',
        },
        {
          device_id: 'd2',
          latitude: 2,
          longitude: 2,
          accuracy_meters: 5,
          recorded_at: '2026-02-10T09:00:00.000Z',
        },
      ],
      error: null,
    })

    const { fetchLatestLocationsForDevices } = await import('../../src/services/locationRepo')
    const res = await fetchLatestLocationsForDevices(['d1', 'd2'])

    expect(res).toHaveLength(2)
    expect(res.find((r) => r.device_id === 'd1')?.latitude).toBe(1)
    expect(res.find((r) => r.device_id === 'd2')?.latitude).toBe(2)
  })

  it('returns empty array when no deviceIds', async () => {
    const { fetchLatestLocationsForDevices } = await import('../../src/services/locationRepo')
    expect(await fetchLatestLocationsForDevices([])).toEqual([])
  })
})
