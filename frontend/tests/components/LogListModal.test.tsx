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
      listRunsForGroup: vi.fn(),
      fetchRunRecords: vi.fn(),
      renameRun: vi.fn(),
      deleteRun: vi.fn(),
    },
  }
})

describe('LogListModal', () => {
  it('renders runs and supports board filtering + play', async () => {
    const user = userEvent.setup()

    const { FIULogModel } = await import('../../src/models/FIULogModel')
    ;(FIULogModel.listRunsForGroup as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        runId: 'run_1',
        name: 'Morning',
        boardId: 'b1',
        startAt: '2026-05-04T10:00:00.000Z',
        endAt: '2026-05-04T10:05:00.000Z',
        recordCount: 3,
      },
      {
        runId: 'run_2',
        name: 'Afternoon',
        boardId: 'b2',
        startAt: '2026-05-04T14:00:00.000Z',
        endAt: '2026-05-04T14:10:00.000Z',
        recordCount: 2,
      },
    ])

    ;(FIULogModel.fetchRunRecords as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([])

    const { LogListModal } = await import('../../src/components/LogListModal')

    render(
      <LogListModal
        open
        onClose={vi.fn()}
        initialGroupId={'g1'}
        groups={[{ id: 'g1', name: 'Group 1', owner_id: 'u1', created_at: null }]}
        boards={[
          { id: 'b1', owner_id: 'u1', display_name: 'Board 1', device_eui: 'e1', group_id: 'g1' },
          { id: 'b2', owner_id: 'u1', display_name: 'Board 2', device_eui: 'e2', group_id: 'g1' },
        ]}
      />
    )

    // Ensure the date filter doesn't exclude our hardcoded runs.
    await user.click(screen.getByRole('button', { name: /clear date/i }))

    expect(await screen.findByText('Morning')).toBeInTheDocument()
    expect(screen.getByText('Afternoon')).toBeInTheDocument()

    // Display fields
    expect(screen.getAllByText(/Start:/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/End:/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Records:/i).length).toBeGreaterThan(0)

    // Board filter should narrow results.
    const boardFilter = screen.getByLabelText(/Board filter/i)
    await user.selectOptions(boardFilter, 'b1')

    expect(screen.getByText('Morning')).toBeInTheDocument()
    expect(screen.queryByText('Afternoon')).not.toBeInTheDocument()

    // Clicking play should open playback modal.
    await user.click(screen.getByRole('button', { name: /play/i }))
    expect(await screen.findByRole('dialog', { name: /log playback/i })).toBeInTheDocument()
  })

  it('date filtering keeps runs that overlap selected day (inclusive boundaries)', async () => {
    const user = userEvent.setup()

    const selectedDate = '2026-05-04'
    const dayStartLocal = new Date(2026, 4, 4, 0, 0, 0, 0)
    const dayEndLocal = new Date(2026, 4, 4, 23, 59, 59, 999)

    const { FIULogModel } = await import('../../src/models/FIULogModel')
    ;(FIULogModel.listRunsForGroup as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([
      // Overlaps day start boundary: ends exactly at dayStart -> should keep (inclusive)
      {
        runId: 'run_a',
        name: 'Ends at day start',
        boardId: 'b1',
        startAt: new Date(dayStartLocal.getTime() - 60 * 60 * 1000).toISOString(),
        endAt: dayStartLocal.toISOString(),
        recordCount: 1,
      },
      // Overlaps day end boundary: starts exactly at dayEnd -> should keep (inclusive)
      {
        runId: 'run_b',
        name: 'Starts at day end',
        boardId: 'b1',
        startAt: dayEndLocal.toISOString(),
        endAt: new Date(dayEndLocal.getTime() + 5 * 60 * 1000).toISOString(),
        recordCount: 1,
      },
      // Outside day window
      {
        runId: 'run_c',
        name: 'Outside',
        boardId: 'b1',
        startAt: new Date(dayStartLocal.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        endAt: new Date(dayStartLocal.getTime() - 2 * 24 * 60 * 60 * 1000 + 5 * 60 * 1000).toISOString(),
        recordCount: 1,
      },
    ])

    const { LogListModal } = await import('../../src/components/LogListModal')

    render(
      <LogListModal
        open
        onClose={vi.fn()}
        initialGroupId={'g1'}
        groups={[{ id: 'g1', name: 'Group 1', owner_id: 'u1', created_at: null }]}
        boards={[{ id: 'b1', owner_id: 'u1', display_name: 'Board 1', device_eui: 'e1', group_id: 'g1' }]}
      />
    )

    // Set a known date so the inclusive-boundary runs are in-window.
    const dateInput = screen.getByLabelText(/calendar filter/i)
    await user.clear(dateInput)
    await user.type(dateInput, selectedDate)

    expect(await screen.findByText('Ends at day start')).toBeInTheDocument()
    expect(screen.getByText('Starts at day end')).toBeInTheDocument()
    expect(screen.queryByText('Outside')).not.toBeInTheDocument()

    // Clear date should show all.
    await user.click(screen.getByRole('button', { name: /clear date/i }))
    expect(await screen.findByText('Outside')).toBeInTheDocument()
  })
})
