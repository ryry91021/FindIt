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
    userDisplayName?: string
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
    onLeaveGroup: (groupId: string) => Promise<void>
    onSetMemberRole: (groupId: string, memberUserId: string, role: 'admin' | 'member') => Promise<void>
    onRemoveMember: (groupId: string, memberUserId: string) => Promise<void>
    onTransferOwnership: (groupId: string, newOwnerUserId: string) => Promise<void>
    onCreateGeofence: (
        name: string,
        centerLat: number,
        centerLon: number,
        radiusMeters: number,
        groupId?: string | null
    ) => Promise<void>
    onUpdateGeofence: (
        geofenceId: string,
        patch: { name?: string; center_lat?: number; center_lon?: number; radius_meters?: number; group_id?: string | null }
    ) => Promise<void>
    onToggleGeofenceEnabled: (geofenceId: string, enabled: boolean) => Promise<void>
    onDeleteGeofence: (geofenceId: string) => Promise<void>
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
    editOriginalGroupId: string
    showGroupPicker: boolean
    boardActionError: string | null
    boardActionSuccess: string | null
    boardActionBusy: boolean
    confirmBoardDeleteOpen: boolean
    groupVisibilityById: Record<string, boolean>
    visibilityUserId: string | null
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
        editOriginalGroupId: '',
        showGroupPicker: false,
        boardActionError: null,
        boardActionSuccess: null,
        boardActionBusy: false,
        confirmBoardDeleteOpen: false,
        groupVisibilityById: {},
        visibilityUserId: null,
    }

    private mapContainerRef = createRef<HTMLDivElement>()
    private sidebarRef = createRef<HTMLElement>()
    private mapView = new FIUMapView()

    private getVisibilityStorageKey(userId: string | null | undefined): string {
        return `findit.groupVisibility.${userId ?? 'anon'}`
    }

    private loadVisibilityFromStorage(userId: string | null | undefined): Record<string, boolean> {
        try {
            const raw = window.localStorage.getItem(this.getVisibilityStorageKey(userId))
            if (!raw) return {}
            const parsed = JSON.parse(raw) as unknown
            if (!parsed || typeof parsed !== 'object') return {}
            const result: Record<string, boolean> = {}
            Object.entries(parsed as Record<string, unknown>).forEach(([k, v]) => {
                if (typeof v === 'boolean') result[k] = v
            })
            return result
        } catch {
            return {}
        }
    }

    private saveVisibilityToStorage(userId: string | null | undefined, map: Record<string, boolean>): void {
        try {
            window.localStorage.setItem(this.getVisibilityStorageKey(userId), JSON.stringify(map))
        } catch {
            // ignore
        }
    }

    private syncVisibilityForUser = (userId: string | null | undefined, groups: FIUGroupEntity[]) => {
        const stored = this.loadVisibilityFromStorage(userId)
        const next: Record<string, boolean> = { ...stored }

        // Default visibility is ON for any group not in storage.
        ;(groups ?? []).forEach((g) => {
            if (!g?.id) return
            if (typeof next[g.id] !== 'boolean') next[g.id] = true
        })

        this.saveVisibilityToStorage(userId, next)

        this.setState(
            {
                groupVisibilityById: next,
                visibilityUserId: userId ?? null,
            },
            () => {
                this.renderMap()
            }
        )
    }

    private isGroupVisible = (groupId: string | null | undefined): boolean => {
        if (!groupId) return true
        return this.state.groupVisibilityById[groupId] !== false
    }

    private isOwnedBoard = (board: FIUBoardEntity | null | undefined): boolean => {
        const me = this.props.userId
        if (!me || !board) return false
        return board.owner_id === me
    }

    private isBoardVisibleOnMapAndLegend = (board: FIUBoardEntity | null | undefined): boolean => {
        if (!board) return false
        if (!board.group_id) return true
        if (this.isOwnedBoard(board)) return true
        return this.isGroupVisible(board.group_id)
    }

    private isGeofenceVisibleOnMap = (geofence: FIUGeofenceEntity | null | undefined): boolean => {
        if (!geofence) return false
        if (!geofence.group_id) return true
        const me = this.props.userId
        if (me && geofence.owner_id === me) return true
        return this.isGroupVisible(geofence.group_id)
    }

    private getFilteredInputs(): {
        boards: FIUBoardEntity[]
        locations: FIULocationRecordEntity[]
        geofences: FIUGeofenceEntity[]
    } {
        const boards = this.props.boards ?? []
        const locations = this.props.locations ?? []
        const geofences = this.props.geofences ?? []

        const boardById = new Map<string, FIUBoardEntity>()
        boards.forEach((b) => {
            boardById.set(b.id, b)
        })

        const visibleBoards = boards.filter((b) => this.isBoardVisibleOnMapAndLegend(b))

        const visibleLocations = locations.filter((loc) => {
            const board = boardById.get(loc.device_id)
            return this.isBoardVisibleOnMapAndLegend(board)
        })

        const visibleGeofences = geofences.filter((g) => this.isGeofenceVisibleOnMap(g))

        return { boards: visibleBoards, locations: visibleLocations, geofences: visibleGeofences }
    }

    private renderMap(): void {
        const { boards, locations, geofences } = this.getFilteredInputs()
        this.mapView.render(boards, locations)
        this.mapView.renderGeofences(geofences)
    }

    /** Opens or closes the left sidebar drawer. */
    private toggleSidebar = () => {
        this.setState((prev) => ({ sidebarOpen: !prev.sidebarOpen }))
    }

    /** Closes the left sidebar drawer. */
    private closeSidebar = () => {
        // Avoid hiding focused elements from assistive tech.
        // If focus is currently inside the sidebar, move it to a safe element before applying aria-hidden.
        const activeEl = document.activeElement
        if (activeEl && this.sidebarRef.current?.contains(activeEl)) {
            this.mapContainerRef.current?.focus()
        }
        this.setState({ sidebarOpen: false })
    }

    /** Opens the sidebar modal for a selected menu action. */
    private openModalForAction = (action: SidebarModalAction) => {
        this.props.onSidebarAction(action)
        const activeEl = document.activeElement
        if (activeEl && this.sidebarRef.current?.contains(activeEl)) {
            this.mapContainerRef.current?.focus()
        }
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
            editOriginalGroupId: '',
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
            editGroupId: board.group_id ?? '',
            editOriginalGroupId: board.group_id ?? '',
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
            editOriginalGroupId: '',
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
        const originalGroupId = this.state.editOriginalGroupId
        if (!boardId || !newName) return

        try {
            this.setBusy(true)
            this.clearMessages()
            await this.props.onRenameBoard(boardId, newName)
            if (groupId && groupId !== originalGroupId) {
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
            editOriginalGroupId,
            showGroupPicker,
            boardActionError,
            boardActionSuccess,
            boardActionBusy,
            confirmBoardDeleteOpen,
        } = this.state

        const currentGroupName = editOriginalGroupId
            ? groups.find((g) => g.id === editOriginalGroupId)?.name
            : undefined

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
                                {currentGroupName ? 'Change Group' : 'Add to Group'}
                            </button>
                            <p className="board-management-subtitle" style={{ margin: 0 }}>
                                Current group: {currentGroupName ?? 'None'}
                            </p>
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
                                            {group.name}{group.id === editOriginalGroupId ? ' (current)' : ''}
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

        this.syncVisibilityForUser(this.props.userId ?? null, this.props.groups)
        window.addEventListener('keydown', this.onWindowKeyDown)
    }

    /** Removes global listeners when dashboard view unmounts. */
    componentWillUnmount(): void {
        this.mapView.destroy()
        window.removeEventListener('keydown', this.onWindowKeyDown)
    }

    /** Re-renders map markers when boards or locations props change. */
    componentDidUpdate(prevProps: Props): void {
        if (prevProps.userId !== this.props.userId) {
            this.syncVisibilityForUser(this.props.userId ?? null, this.props.groups)
            return
        }

        if (prevProps.groups !== this.props.groups) {
            // Ensure newly loaded groups default to visible.
            this.syncVisibilityForUser(this.state.visibilityUserId ?? this.props.userId ?? null, this.props.groups)
            return
        }

        if (prevProps.boards !== this.props.boards || prevProps.locations !== this.props.locations || prevProps.geofences !== this.props.geofences) {
            this.renderMap()
        }
    }

    private handleSetGroupVisibility = (groupId: string, visible: boolean) => {
        this.setState(
            (prev) => {
                const next = { ...prev.groupVisibilityById, [groupId]: visible }
                return { groupVisibilityById: next }
            },
            () => {
                this.saveVisibilityToStorage(this.state.visibilityUserId ?? this.props.userId ?? null, this.state.groupVisibilityById)
                this.renderMap()
            }
        )
    }

    /** Renders the map and board status list. */
    render() {
        const { userEmail, boards, locations, error, onSignOut } = this.props
        const pendingGroupCount = this.props.pendingGroupJoinRequests.length
        const { sidebarOpen, modalOpen, activeModalAction } = this.state

        const groupNameById = new Map<string, string>()
        ;(this.props.groups ?? []).forEach((g) => {
            if (g?.id) groupNameById.set(g.id, g.name ?? 'Untitled Group')
        })

        const visibleForLegend = this.getFilteredInputs().boards

        return (
            <div className="dashboard-root">
                {/* Map */}
                <div ref={this.mapContainerRef} className="map-container" tabIndex={-1} />

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
                    ref={this.sidebarRef}
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
                            const groupName = board.group_id ? groupNameById.get(board.group_id) : null
                            const showGroupSubtext = Boolean(board.group_id) && !this.isOwnedBoard(board) && Boolean(groupName)
                            return (
                                <div key={board.id} className="board-item">
                                    <span className={`status-dot ${hasLocation ? 'online' : 'offline'}`} />
                                    <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
                                        <span>{board.display_name ?? 'Unnamed Board'}</span>
                                        {showGroupSubtext && (
                                            <span className="board-management-subtitle">{groupName}</span>
                                        )}
                                    </div>
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
                                groups={this.props.groups}
                                onCreateGeofence={this.props.onCreateGeofence}
                                onUpdateGeofence={this.props.onUpdateGeofence}
                                onToggleGeofenceEnabled={this.props.onToggleGeofenceEnabled}
                                onDeleteGeofence={this.props.onDeleteGeofence}
                            />
                        ) : activeModalAction === 'group-settings' ? (
                            <FIUGroupView
                                userId={this.props.userId}
                                groups={this.props.groups}
                                boards={this.props.boards}
                                geofences={this.props.geofences}
                                groupMembers={this.props.groupMembers}
                                pendingJoinRequests={this.props.pendingGroupJoinRequests}
                                onCreateGroup={this.props.onCreateGroup}
                                onDeleteGroup={this.props.onDeleteGroup}
                                onRenameGroup={this.props.onRenameGroup}
                                onUpdateGroupBoards={this.props.onUpdateGroupBoards}
                                onUpdateGeofence={this.props.onUpdateGeofence}
                                onJoinGroup={this.props.onJoinGroup}
                                onRespondToJoinRequest={this.props.onRespondToGroupJoinRequest}
                                onLeaveGroup={this.props.onLeaveGroup}
                                onSetMemberRole={this.props.onSetMemberRole}
                                onRemoveMember={this.props.onRemoveMember}
                                onTransferOwnership={this.props.onTransferOwnership}
                                groupVisibilityById={this.state.groupVisibilityById}
                                onSetGroupVisibility={this.handleSetGroupVisibility}
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
                <FIUAccountView
                    userEmail={userEmail}
                    userDisplayName={this.props.userDisplayName}
                    onSignOut={onSignOut}
                />

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
                    {visibleForLegend.length === 0 && !error && <p>No boards found.</p>}
                    {visibleForLegend.map((board) => {
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
