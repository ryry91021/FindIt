import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

    const legend = document.querySelector('.boards-legend')
    expect(legend).not.toBeNull()

    expect(within(legend as HTMLElement).getByText('Boards')).toBeInTheDocument()
    expect(within(legend as HTMLElement).getByText('Board 1')).toBeInTheDocument()
  })

  it('opens the sidebar when clicking the hamburger', async () => {
    const user = userEvent.setup()
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

    await user.click(screen.getByLabelText('Open menu'))
    expect(screen.getByText('Menu')).toBeInTheDocument()
    expect(screen.queryByLabelText('Open menu')).not.toBeInTheDocument()
  })
})
