import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../src/controllers/FIUBoardController', () => {
  return {
    FIUBoardController: class {
      loadBoardsAndLatestLocations = async () => ({
        boards: [{ id: 'd1', display_name: 'Board 1' }],
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
    },
  }
})

vi.mock('../../src/views/FIUMapView', () => {
  return {
    FIUMapView: class {
      init() {}
      render() {}
    },
  }
})

vi.mock('../../src/services/authService', () => ({
  authService: { signOut: vi.fn() },
}))

describe('FIUBoardView', () => {
  it('renders board legend after load', async () => {
    const { FIUBoardView } = await import('../../src/views/FIUBoardView')

    render(
      <FIUBoardView userEmail="a@b.com" userId="u1" onLogout={vi.fn()} />
    )

    expect(await screen.findByText('Boards')).toBeInTheDocument()
    expect(await screen.findByText('Board 1')).toBeInTheDocument()
  })
})
