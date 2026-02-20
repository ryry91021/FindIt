import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../src/views/FIUMapView', () => {
  return {
    FIUMapView: class {
      init() {}
      render() {}
    },
  }
})

describe('FIUBoardView', () => {
  it('renders board legend after load', async () => {
    const { FIUBoardView } = await import('../../src/views/FIUBoardView')

    render(
      <FIUBoardView
        userEmail="a@b.com"
        boards={[{ id: 'd1', display_name: 'Board 1' }]}
        locations={[
          {
            device_id: 'd1',
            latitude: 1,
            longitude: 2,
            accuracy_meters: 10,
            recorded_at: '2026-02-10T00:00:00.000Z',
          },
        ]}
        error={null}
        onSignOut={vi.fn()}
      />
    )

    expect(await screen.findByText('Boards')).toBeInTheDocument()
    expect(await screen.findByText('Board 1')).toBeInTheDocument()
  })
})
