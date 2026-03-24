import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../src/views/FIUMapView', () => {
  return {
    FIUMapView: class {
      init() {}
      render() {}
      renderGeofences() {}
      destroy() {}
    },
  }
})

describe('FIUBoardView', () => {
  it('renders board legend after load', async () => {
    const { FIUBoardView } = await import('../../src/views/FIUBoardView')

    render(
      <FIUBoardView
        userEmail="a@b.com"
        boards={[{ id: 'd1', display_name: 'Board 1', device_eui: 'EUI-1' }]}
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
        groups={[]}
        groupMembers={[]}
        pendingGroupJoinRequests={[]}
        onSignOut={vi.fn()}
        onSidebarAction={vi.fn()}
        onCreateBoard={vi.fn(async () => {})}
        onDeleteBoard={vi.fn(async () => {})}
        onRenameBoard={vi.fn(async () => {})}
        onAddBoardToGroup={vi.fn(async () => {})}
        onCreateGroup={vi.fn(async () => {})}
        onDeleteGroup={vi.fn(async () => {})}
        onRenameGroup={vi.fn(async () => {})}
        onUpdateGroupBoards={vi.fn(async () => {})}
        onJoinGroup={vi.fn(async () => {})}
        onRespondToGroupJoinRequest={vi.fn(async () => {})}
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
        boards={[{ id: 'd1', display_name: 'Board 1', device_eui: 'EUI-1' }]}
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
        groups={[]}
        groupMembers={[]}
        pendingGroupJoinRequests={[]}
        onSignOut={vi.fn()}
        onSidebarAction={vi.fn()}
        onCreateBoard={vi.fn(async () => {})}
        onDeleteBoard={vi.fn(async () => {})}
        onRenameBoard={vi.fn(async () => {})}
        onAddBoardToGroup={vi.fn(async () => {})}
        onCreateGroup={vi.fn(async () => {})}
        onDeleteGroup={vi.fn(async () => {})}
        onRenameGroup={vi.fn(async () => {})}
        onUpdateGroupBoards={vi.fn(async () => {})}
        onJoinGroup={vi.fn(async () => {})}
        onRespondToGroupJoinRequest={vi.fn(async () => {})}
      />
    )

    await user.click(screen.getByLabelText('Open menu'))
    expect(screen.getByText('Menu')).toBeInTheDocument()
    expect(screen.queryByLabelText('Open menu')).not.toBeInTheDocument()
  })

  it('opens compact modal from sidebar and closes with X', async () => {
    const user = userEvent.setup()
    const onSidebarAction = vi.fn()
    const { FIUBoardView } = await import('../../src/views/FIUBoardView')

    render(
      <FIUBoardView
        userEmail="a@b.com"
        boards={[{ id: 'd1', display_name: 'Board 1', device_eui: 'EUI-1' }]}
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
        groups={[{ id: 'g1', name: 'Group One' }]}
        groupMembers={[]}
        pendingGroupJoinRequests={[]}
        onSignOut={vi.fn()}
        onSidebarAction={onSidebarAction}
        onCreateBoard={vi.fn(async () => {})}
        onDeleteBoard={vi.fn(async () => {})}
        onRenameBoard={vi.fn(async () => {})}
        onAddBoardToGroup={vi.fn(async () => {})}
        onCreateGroup={vi.fn(async () => {})}
        onDeleteGroup={vi.fn(async () => {})}
        onRenameGroup={vi.fn(async () => {})}
        onUpdateGroupBoards={vi.fn(async () => {})}
        onJoinGroup={vi.fn(async () => {})}
        onRespondToGroupJoinRequest={vi.fn(async () => {})}
      />
    )

    await user.click(screen.getByLabelText('Open menu'))
    await user.click(screen.getByRole('button', { name: 'Board Management' }))

    expect(onSidebarAction).toHaveBeenCalledWith('board-management')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByLabelText('Open menu')).toBeInTheDocument()
    expect(document.getElementById('dashboard-sidebar')).toHaveAttribute('aria-hidden', 'true')

    await user.click(screen.getByLabelText('Close modal'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('disables edit submit until rename input has text', async () => {
    const user = userEvent.setup()
    const onRenameBoard = vi.fn(async () => {})
    const { FIUBoardView } = await import('../../src/views/FIUBoardView')

    render(
      <FIUBoardView
        userEmail="a@b.com"
        boards={[{ id: 'd1', display_name: 'Board 1', device_eui: 'EUI-1' }]}
        locations={[]}
        groups={[{ id: 'g1', name: 'Group One' }]}
        groupMembers={[]}
        pendingGroupJoinRequests={[]}
        error={null}
        onSignOut={vi.fn()}
        onSidebarAction={vi.fn()}
        onCreateBoard={vi.fn(async () => {})}
        onDeleteBoard={vi.fn(async () => {})}
        onRenameBoard={onRenameBoard}
        onAddBoardToGroup={vi.fn(async () => {})}
        onCreateGroup={vi.fn(async () => {})}
        onDeleteGroup={vi.fn(async () => {})}
        onRenameGroup={vi.fn(async () => {})}
        onUpdateGroupBoards={vi.fn(async () => {})}
        onJoinGroup={vi.fn(async () => {})}
        onRespondToGroupJoinRequest={vi.fn(async () => {})}
      />
    )

    await user.click(screen.getByLabelText('Open menu'))
    await user.click(screen.getByRole('button', { name: 'Board Management' }))
    await user.click(screen.getByRole('button', { name: 'Edit' }))

    const renameInput = screen.getByPlaceholderText('Change device name')
    await user.clear(renameInput)

    const submitButton = screen.getByRole('button', { name: 'Submit' })
    expect(submitButton).toBeDisabled()

    await user.type(renameInput, 'Renamed Device')
    expect(submitButton).not.toBeDisabled()

    expect(onRenameBoard).not.toHaveBeenCalled()
  })
})
