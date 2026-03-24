/*
    Responsibilities:
        - Creates boards legend

    - Provides status of the
            boards
            boards

    - Handle data clearing on
            sign-out
            sign-out
*/

import { createRef } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import type { FIUBoardEntity } from '../entities/FIUBoardEntity'
import type { FIULocationRecordEntity } from '../entities/FIULocationRecordEntity'
import type { FIUGeofenceEntity } from '../entities/FIUGeofenceEntity'
import { FIUMapView } from './FIUMapView'
import { FIUAccountView } from './FIUAccountView'
import { FIUGeofenceView } from './FIUGeofenceView'
import { FIUGroupView } from './FIUGroupView'
import { FIUView } from './FIUView'
import type { FIUGroupEntity } from '../entities/FIUGroupEntity'
import type { FIUGroupJoinRequestEntity } from '../models/FIUGroupModel'
import type { FIUGroupMemberEntity } from '../models/FIUGroupModel'
import { Modal } from '../components/Modal'
import { ConfirmDialog } from '../components/ConfirmDialog'
import '../components/Dashboard.css'

export type SidebarModalAction =
    | 'board-management'
    | 'geofence-management'
    | 'group-settings'

interface Props {
    userId?: string
    userEmail?: string
    boards: FIUBoardEntity[]
    locations: FIULocationRecordEntity[]
    geofences: FIUGeofenceEntity[]
    groups: FIUGroupEntity[]
    groupMembers: FIUGroupMemberEntity[]
    pendingGroupJoinRequests: FIUGroupJoinRequestEntity[]
    error: string | null
    onSignOut: () => void
    onSidebarAction: (action: SidebarModalAction) => void
    onCreateBoard: (displayName: string, deviceEui: string) => Promise<void>
    onDeleteBoard: (boardId: string) => Promise<void>
    onRenameBoard: (boardId: string, newName: string) => Promise<void>
    onAddBoardToGroup: (boardId: string, groupId: string) => Promise<void>
    onCreateGroup: (name: string, boardIds: string[]) => Promise<void>
    onDeleteGroup: (groupId: string) => Promise<void>
    onRenameGroup: (groupId: string, name: string) => Promise<void>
    onUpdateGroupBoards: (groupId: string, boardIds: string[]) => Promise<void>
    onJoinGroup: (groupId: string) => Promise<void>
    onRespondToGroupJoinRequest: (requestId: string, accept: boolean) => Promise<void>
    onCreateGeofence: (name: string, centerLat: number, centerLon: number, radiusMeters: number) => Promise<void>
    onUpdateGeofence: (
        geofenceId: string,
        patch: { name?: string; center_lat?: number; center_lon?: number; radius_meters?: number }
    ) => Promise<void>
    onToggleGeofenceEnabled: (geofenceId: string, enabled: boolean) => Promise<void>
}
type State = {
    sidebarOpen: boolean
    modalOpen: boolean
    activeModalAction: SidebarModalAction | null
    createBoardName: string
    createBoardEui: string
    selectedBoardIdForRemoval: string
    editPopupOpen: boolean
    editBoardId: string
    editBoardName: string
    editGroupId: string
    showGroupPicker: boolean
    boardActionError: string | null
    boardActionSuccess: string | null
    boardActionBusy: boolean
    confirmBoardDeleteOpen: boolean
}

/**
 * Pure presentation of the dashboard.
 * Renders based on props (no DB access / request flow).
 */
export class FIUBoardView extends FIUView<Props, State> {
    state: State = {
        sidebarOpen: false,
        modalOpen: false,
        activeModalAction: null,
        createBoardName: '',
        createBoardEui: '',
        selectedBoardIdForRemoval: '',
        editPopupOpen: false,
        editBoardId: '',
        editBoardName: '',
        editGroupId: '',
        showGroupPicker: false,
        boardActionError: null,
        boardActionSuccess: null,
        boardActionBusy: false,
        confirmBoardDeleteOpen: false,
    }

    private mapContainerRef = createRef<HTMLDivElement>()
    private mapView = new FIUMapView()

    /** Opens or closes the left sidebar drawer. */
    private toggleSidebar = () => {
        this.setState((prev) => ({ sidebarOpen: !prev.sidebarOpen }))
    }

    /** Closes the left sidebar drawer. */
    private closeSidebar = () => {
        this.setState({ sidebarOpen: false })
    }

    /** Opens the sidebar modal for a selected menu action. */
    private openModalForAction = (action: SidebarModalAction) => {
        this.props.onSidebarAction(action)
        this.setState({
            sidebarOpen: false,
            modalOpen: true,
            activeModalAction: action,
        })
    }

    /** Closes the active sidebar modal and clears transient edit state. */
    private closeModal = () => {
        this.setState({
            modalOpen: false,
            activeModalAction: null,
            editPopupOpen: false,
            editBoardId: '',
            editBoardName: '',
            editGroupId: '',
            showGroupPicker: false,
            boardActionError: null,
            boardActionSuccess: null,
            confirmBoardDeleteOpen: false,
        })
    }

    /** Opens the board edit popup for the selected board row. */
    private openEditPopup = (board: FIUBoardEntity) => {
        this.setState({
            editPopupOpen: true,
            editBoardId: board.id,
            editBoardName: board.display_name ?? '',
            editGroupId: '',
            showGroupPicker: false,
            boardActionError: null,
            boardActionSuccess: null,
        })
    }

    /** Closes the board edit popup and resets edit-specific fields. */
    private closeEditPopup = () => {
        this.setState({
            editPopupOpen: false,
            editBoardId: '',
            editBoardName: '',
            editGroupId: '',
            showGroupPicker: false,
            boardActionError: null,
            boardActionSuccess: null,
        })
    }

    /** Sets the busy/locked state for board action buttons. */
    private setBusy = (busy: boolean) => {
        this.setState({ boardActionBusy: busy })
    }

    /** Clears board action success/error messages. */
    private clearMessages = () => {
        this.setState({ boardActionError: null, boardActionSuccess: null })
    }

    /** Creates a board using the current create form values. */
    private handleCreateBoard = async () => {
        const name = this.state.createBoardName.trim()
        const eui = this.state.createBoardEui.trim()
        if (!name || !eui) return

        try {
            this.setBusy(true)
            this.clearMessages()
            await this.props.onCreateBoard(name, eui)
            this.setState({
                createBoardName: '',
                createBoardEui: '',
                boardActionSuccess: 'Board added.',
            })
        } catch (err) {
            this.setState({
                boardActionError: this.getErrorMessage(err, 'Unable to add board.'),
            })
        } finally {
            this.setBusy(false)
        }
    }

    /** Removes the selected board from the current user's board list. */
    private handleDeleteBoard = async () => {
        const boardId = this.state.selectedBoardIdForRemoval
        if (!boardId) return

        try {
            this.setBusy(true)
            this.clearMessages()
            await this.props.onDeleteBoard(boardId)
            this.setState({
                selectedBoardIdForRemoval: '',
                boardActionSuccess: 'Board removed.',
                confirmBoardDeleteOpen: false,
            })
        } catch (err) {
            this.setState({
                boardActionError: this.getErrorMessage(err, 'Unable to remove board.'),
            })
        } finally {
            this.setBusy(false)
        }
    }

    /** Opens confirmation modal before deleting a board. */
    private openBoardDeleteConfirm = () => {
        if (!this.state.selectedBoardIdForRemoval) return
        this.setState({ confirmBoardDeleteOpen: true })
    }

    /** Closes the board deletion confirmation modal. */
    private closeBoardDeleteConfirm = () => {
        this.setState({ confirmBoardDeleteOpen: false })
    }

    /** Submits board rename and optional group assignment updates. */
    private handleEditSubmit = async () => {
        const boardId = this.state.editBoardId
        const newName = this.state.editBoardName.trim()
        const groupId = this.state.editGroupId
        if (!boardId || !newName) return

        try {
            this.setBusy(true)
            this.clearMessages()
            await this.props.onRenameBoard(boardId, newName)
            if (groupId) {
                await this.props.onAddBoardToGroup(boardId, groupId)
            }
            this.setState({
                boardActionSuccess: 'Board updated.',
            })
            this.closeEditPopup()
        } catch (err) {
            this.setState({
                boardActionError: this.getErrorMessage(err, 'Unable to update board.'),
            })
        } finally {
            this.setBusy(false)
        }
    }

    /** Renders board-management controls and board edit/remove dialogs. */
    private renderBoardManagement() {
        const {
            boards,
            groups,
        } = this.props
        const {
            createBoardName,
            createBoardEui,
            selectedBoardIdForRemoval,
            editPopupOpen,
            editBoardName,
            editGroupId,
            showGroupPicker,
            boardActionError,
            boardActionSuccess,
            boardActionBusy,
            confirmBoardDeleteOpen,
        } = this.state

        return (
            <div className="board-management-page">
                <p className="board-management-subtitle">
                    Manage your boards, device IDs, and group assignments.
                </p>

                <div className="board-management-row">
                    <input
                        className="board-management-input"
                        placeholder="Board name"
                        value={createBoardName}
                        onChange={(event) => this.setState({ createBoardName: event.target.value })}
                    />
                    <input
                        className="board-management-input"
                        placeholder="Device EUI"
                        value={createBoardEui}
                        onChange={(event) => this.setState({ createBoardEui: event.target.value })}
                    />
                    <button
                        type="button"
                        className="board-management-button"
                        disabled={boardActionBusy || !createBoardName.trim() || !createBoardEui.trim()}
                        onClick={this.handleCreateBoard}
                    >
                        Add Board
                    </button>
                </div>

                <div className="board-management-row">
                    <select
                        className="board-management-input"
                        value={selectedBoardIdForRemoval}
                        onChange={(event) =>
                            this.setState({ selectedBoardIdForRemoval: event.target.value })
                        }
                    >
                        <option value="">Select board to remove</option>
                        {boards.map((board) => (
                            <option key={board.id} value={board.id}>
                                {board.display_name ?? 'Unnamed Board'}
                            </option>
                        ))}
                    </select>
                    <button
                        type="button"
                        className="board-management-danger"
                        disabled={boardActionBusy || !selectedBoardIdForRemoval}
                        onClick={this.openBoardDeleteConfirm}
                    >
                        Remove Board
                    </button>
                </div>

                <ConfirmDialog
                    open={confirmBoardDeleteOpen}
                    onCancel={this.closeBoardDeleteConfirm}
                    onConfirm={() => {
                        void this.handleDeleteBoard()
                    }}
                    title="Remove Board"
                    message="Are you sure you want to remove this board?"
                    ariaLabel="Confirm remove board"
                    busy={boardActionBusy}
                    confirmLabel="Confirm Remove"
                    cancelLabel="Cancel"
                />

                {boardActionError && <p className="board-management-error">{boardActionError}</p>}
                {boardActionSuccess && <p className="board-management-success">{boardActionSuccess}</p>}

                <div className="board-management-list" aria-label="Board list">
                    {boards.length === 0 && <p>No boards found.</p>}
                    {boards.map((board) => (
                        <div key={board.id} className="board-management-item">
                            <button type="button" className="board-management-link">
                                {board.display_name ?? 'Unnamed Board'}
                            </button>
                            <span className="board-management-eui">
                                deviceEUI: {board.device_eui ?? 'Unavailable'}
                            </span>
                            <button
                                type="button"
                                className="board-management-button"
                                onClick={() => this.openEditPopup(board)}
                            >
                                Edit
                            </button>
                        </div>
                    ))}
                </div>

                {editPopupOpen && (
                    <Modal
                        open={editPopupOpen}
                        onRequestClose={this.closeEditPopup}
                        overlayClassName="board-edit-popup-overlay"
                        contentClassName="board-edit-popup"
                        contentProps={{
                            'aria-label': 'Edit board',
                        }}
                    >
                            <h3>Edit Board</h3>
                            <input
                                className="board-management-input board-edit-compact"
                                placeholder="Change device name"
                                value={editBoardName}
                                onChange={(event) =>
                                    this.setState({ editBoardName: event.target.value })
                                }
                            />
                            <button
                                type="button"
                                className="board-management-button board-edit-group-button"
                                onClick={() =>
                                    this.setState((prev) => ({ showGroupPicker: !prev.showGroupPicker }))
                                }
                            >
                                Add to Group
                            </button>
                            {showGroupPicker && (
                                <select
                                    className="board-management-input board-edit-compact"
                                    value={editGroupId}
                                    onChange={(event) =>
                                        this.setState({ editGroupId: event.target.value })
                                    }
                                >
                                    <option value="">Select group</option>
                                    {groups.map((group) => (
                                        <option key={group.id} value={group.id}>
                                            {group.name}
                                        </option>
                                    ))}
                                </select>
                            )}
                            <div className="board-edit-popup-actions">
                                <button
                                    type="button"
                                    className="board-management-button"
                                    onClick={this.closeEditPopup}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    className="board-management-button"
                                    disabled={boardActionBusy || !editBoardName.trim()}
                                    onClick={this.handleEditSubmit}
                                >
                                    Submit
                                </button>
                            </div>
                    </Modal>
                )}
            </div>
        )
    }

    /** Handles global Escape key for closing the active sidebar modal. */
    private onWindowKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Escape' && this.state.modalOpen) {
            this.closeModal()
        }
    }

    /** Returns the title for the currently active sidebar modal action. */
    private getModalTitle(action: SidebarModalAction | null): string {
        if (action === 'board-management') return 'Board Management'
        if (action === 'geofence-management') return 'Geofence Management'
        if (action === 'group-settings') return 'Group Settings'
        return 'Menu'
    }

    /** Initializes map view and event listeners when dashboard mounts. */
    componentDidMount(): void {
        const container = this.mapContainerRef.current
        if (container) {
            this.mapView.init(container)
        }

        this.mapView.render(this.props.boards, this.props.locations)
        this.mapView.renderGeofences(this.props.geofences)
        window.addEventListener('keydown', this.onWindowKeyDown)
    }

    /** Removes global listeners when dashboard view unmounts. */
    componentWillUnmount(): void {
        this.mapView.destroy()
        window.removeEventListener('keydown', this.onWindowKeyDown)
    }

    /** Re-renders map markers when boards or locations props change. */
    componentDidUpdate(prevProps: Props): void {
        if (prevProps.boards !== this.props.boards || prevProps.locations !== this.props.locations) {
            this.mapView.render(this.props.boards, this.props.locations)
        }

        if (prevProps.geofences !== this.props.geofences) {
            this.mapView.renderGeofences(this.props.geofences)
        }
    }

    /** Renders the map and board status list. */
    render() {
        const { userEmail, boards, locations, error, onSignOut } = this.props
        const pendingGroupCount = this.props.pendingGroupJoinRequests.length
        const { sidebarOpen, modalOpen, activeModalAction } = this.state

        return (
            <div className="dashboard-root">
                {/* Map */}
                <div ref={this.mapContainerRef} className="map-container" />

                {/* Top-left hamburger */}
                {!sidebarOpen && (
                    <button
                        type="button"
                        className="sidebar-toggle"
                        aria-label="Open menu"
                        aria-expanded={false}
                        aria-controls="dashboard-sidebar"
                        onClick={this.toggleSidebar}
                    >
                        <span className="hamburger" aria-hidden="true">
                            <span />
                            <span />
                            <span />
                        </span>
                    </button>
                )}

                {/* Backdrop (closes sidebar). Z-index is below account menu via CSS */}
                {sidebarOpen && (
                    <button
                        type="button"
                        className="sidebar-backdrop"
                        aria-label="Close menu backdrop"
                        onClick={this.closeSidebar}
                    />
                )}

                {/* Sidebar drawer (peek overlay) */}
                <aside
                    id="dashboard-sidebar"
                    className={`sidebar-drawer ${sidebarOpen ? 'open' : ''}`}
                    aria-hidden={!sidebarOpen}
                >
                    <div className="sidebar-header">
                        <strong>Menu</strong>
                        <button
                            type="button"
                            className="sidebar-close"
                            aria-label="Close menu"
                            onClick={this.closeSidebar}
                        >
                            ✕
                        </button>
                    </div>

                    {/* Placeholder pages (replace these later) */}
                    <nav className="sidebar-nav" aria-label="Sidebar navigation">
                        <ul>
                            <li>
                                <button
                                    type="button"
                                    className="sidebar-link"
                                    onClick={() => this.openModalForAction('board-management')}
                                >
                                    Board Management
                                </button>
                            </li>
                            <li>
                                <button
                                    type="button"
                                    className="sidebar-link"
                                    onClick={() => this.openModalForAction('geofence-management')}
                                >
                                    Geofence Management
                                </button>
                            </li>
                            <li>
                                <button
                                    type="button"
                                    className="sidebar-link"
                                    onClick={() => this.openModalForAction('group-settings')}
                                >
                                    Group Settings
                                    {pendingGroupCount > 0 && (
                                        <span className="sidebar-link-counter" aria-label="Pending group requests">
                                            {pendingGroupCount}
                                        </span>
                                    )}
                                </button>
                            </li>
                        </ul>
                    </nav>

                    {/* Optional: put boards list in the sidebar too */}
                    <div className="sidebar-section">
                        <h4>Boards</h4>
                        {boards.length === 0 && !error && <p>No boards found.</p>}
                        {boards.map((board) => {
                            const hasLocation = locations.some((l) => l.device_id === board.id)
                            return (
                                <div key={board.id} className="board-item">
                                    <span className={`status-dot ${hasLocation ? 'online' : 'offline'}`} />
                                    {board.display_name ?? 'Unnamed Board'}
                                </div>
                            )
                        })}
                    </div>
                </aside>

                {modalOpen && (
                    <Modal
                        open={modalOpen}
                        onRequestClose={this.closeModal}
                        overlayClassName="sidebar-modal-overlay"
                        contentClassName="sidebar-modal"
                        overlayProps={{
                            role: 'button',
                            tabIndex: 0,
                            'aria-label': 'Close modal overlay',
                            onKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => {
                                if (event.target !== event.currentTarget) return
                                if (event.key === 'Enter' || event.key === ' ') {
                                    this.closeModal()
                                }
                            },
                        }}
                        contentProps={{
                            'aria-labelledby': 'sidebar-modal-title',
                        }}
                    >
                        <button
                            type="button"
                            className="sidebar-modal-close"
                            aria-label="Close modal"
                            onClick={this.closeModal}
                        >
                            ✕
                        </button>
                        <h2 id="sidebar-modal-title">{this.getModalTitle(activeModalAction)}</h2>
                        {activeModalAction === 'board-management' ? (
                            this.renderBoardManagement()
                        ) : activeModalAction === 'geofence-management' ? (
                            <FIUGeofenceView
                                geofences={this.props.geofences}
                                onCreateGeofence={this.props.onCreateGeofence}
                                onUpdateGeofence={this.props.onUpdateGeofence}
                                onToggleGeofenceEnabled={this.props.onToggleGeofenceEnabled}
                            />
                        ) : activeModalAction === 'group-settings' ? (
                            <FIUGroupView
                                groups={this.props.groups}
                                boards={this.props.boards}
                                groupMembers={this.props.groupMembers}
                                pendingJoinRequests={this.props.pendingGroupJoinRequests}
                                onCreateGroup={this.props.onCreateGroup}
                                onDeleteGroup={this.props.onDeleteGroup}
                                onRenameGroup={this.props.onRenameGroup}
                                onUpdateGroupBoards={this.props.onUpdateGroupBoards}
                                onJoinGroup={this.props.onJoinGroup}
                                onRespondToJoinRequest={this.props.onRespondToGroupJoinRequest}
                            />
                        ) : (
                            <p>
                                This section is ready for your next feature. Add controls and content for
                                this menu here.
                            </p>
                        )}
                    </Modal>
                )}

                {/* Account menu (top-right overlay) */}
                <FIUAccountView userEmail={userEmail} onSignOut={onSignOut} />

                {/* Error box (VISIBLE) */}
                {error && (
                    <div
                        style={{
                            position: 'absolute',
                            left: 16,
                            bottom: 16,
                            background: 'white',
                            padding: 12,
                            borderRadius: 8,
                            maxWidth: 420,
                            zIndex: 1100,
                            boxShadow: '0 8px 20px rgba(0,0,0,0.2)',
                            color: '#111827',
                            fontSize: 14,
                        }}
                    >
                        <strong>Dashboard error:</strong>
                        <div style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}>{error}</div>
                    </div>
                )}

                {/* Boards legend */}
                <div className="boards-legend">
                    <h4>Boards</h4>
                    {boards.length === 0 && !error && <p>No boards found.</p>}
                    {boards.map((board) => {
                        const hasLocation = locations.some((l) => l.device_id === board.id)
                        return (
                            <div key={board.id} className="board-item">
                                <span
                                    className={`status-dot ${hasLocation ? 'online' : 'offline'}`}
                                />
                                {board.display_name ?? 'Unnamed Board'}
                            </div>
                        )
                    })}
                </div>
            </div>
        )
    }
}
