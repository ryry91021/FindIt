import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../src/views/FIUMapView', () => {
  class FIUMapView {
    init() {}
    render() {}
    destroy() {}
  }

  return { FIUMapView }
})

vi.mock('../../src/models/FIULogModel', () => {
  return {
    FIULogModel: {
      fetchRunRecords: vi.fn(),
    },
  }
})

describe('LogPlaybackPanel', () => {
  it('loads records and shows timestamp + toggles play/pause', async () => {
    const user = userEvent.setup()

    const { FIULogModel } = await import('../../src/models/FIULogModel')
    ;(FIULogModel.fetchRunRecords as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        device_id: 'b1',
        latitude: 1,
        longitude: 2,
        accuracy_meters: null,
        recorded_at: '2026-05-04T10:00:00.000Z',
        runId: 'run_1',
      },
      {
        device_id: 'b1',
        latitude: 3,
        longitude: 4,
        accuracy_meters: null,
        recorded_at: '2026-05-04T10:00:01.000Z',
        runId: 'run_1',
      },
    ])

    const { LogPlaybackPanel } = await import('../../src/components/LogPlaybackPanel')

    render(
      <LogPlaybackPanel
        open
        onClose={vi.fn()}
        run={{
          runId: 'run_1',
          name: 'Morning',
          boardId: 'b1',
          startAt: '2026-05-04T10:00:00.000Z',
          endAt: '2026-05-04T10:00:01.000Z',
          recordCount: 2,
        }}
        board={{ id: 'b1', owner_id: 'u1', display_name: 'Board 1', device_eui: 'e1', group_id: 'g1' }}
      />
    )

    expect(await screen.findByText(/Timestamp:/i)).toBeInTheDocument()

    const pauseBtn = screen.getByRole('button', { name: /pause/i })
    await user.click(pauseBtn)
    expect(screen.getByRole('button', { name: /^play$/i })).toBeInTheDocument()

    // Speed control exists
    expect(screen.getByLabelText(/Speed/i)).toBeInTheDocument()
  })
})
