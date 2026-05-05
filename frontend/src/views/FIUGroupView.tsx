import { FIUView } from './FIUView'
import type { FIUBoardEntity } from '../entities/FIUBoardEntity'
import type { FIUGroupEntity } from '../entities/FIUGroupEntity'
import type { FIUGroupJoinRequestEntity } from '../models/FIUGroupModel'
import type { FIUGroupMemberEntity } from '../models/FIUGroupModel'
import { Modal } from '../components/Modal'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { FIUProfileModel } from '../models/FIUProfileModel'
import { LogListModal } from '../components/LogListModal'

export type FIUGroupViewProps = {
    userId?: string
    groups: FIUGroupEntity[]
    boards: FIUBoardEntity[]
    groupMembers: FIUGroupMemberEntity[]
    pendingJoinRequests: FIUGroupJoinRequestEntity[]
    onCreateGroup: (name: string, boardIds: string[]) => Promise<void>
    onDeleteGroup: (groupId: string) => Promise<void>
    onRenameGroup: (groupId: string, name: string) => Promise<void>
    onUpdateGroupBoards: (groupId: string, boardIds: string[]) => Promise<void>
    onJoinGroup: (groupId: string) => Promise<void>
    onRespondToJoinRequest: (requestId: string, accept: boolean) => Promise<void>
    onLeaveGroup: (groupId: string) => Promise<void>
    onSetMemberRole: (groupId: string, memberUserId: string, role: 'admin' | 'member') => Promise<void>
    onRemoveMember: (groupId: string, memberUserId: string) => Promise<void>
    onTransferOwnership: (groupId: string, newOwnerUserId: string) => Promise<void>
    groupVisibilityById: Record<string, boolean>
    onSetGroupVisibility: (groupId: string, visible: boolean) => void
}

type State = {
    createModalOpen: boolean
    joinModalOpen: boolean
    editModalOpen: boolean
    shareGroupId: string | null
    editGroupId: string
    createName: string
    editName: string
    joinGroupId: string
    editSelectedBoardIds: string[]
    editSelectionTouched: boolean
    selectedBoardIds: string[]
    confirmDeleteGroupId: string | null
    busy: boolean
    error: string | null
    success: string | null
    requesterLabelById: Record<string, string>
    transferGroupId: string | null
    transferToUserId: string
    logsModalOpen: boolean
    logsGroupId: string | null
}

/** Presentation-only view for group settings content. */
export class FIUGroupView extends FIUView<FIUGroupViewProps, State> {
    state: State = {
        createModalOpen: false,
        joinModalOpen: false,
        editModalOpen: false,
        shareGroupId: null,
        editGroupId: '',
        createName: '',
        editName: '',
        joinGroupId: '',
        editSelectedBoardIds: [],
        editSelectionTouched: false,
        selectedBoardIds: [],
        confirmDeleteGroupId: null,
        busy: false,
        error: null,
        success: null,
        requesterLabelById: {},
        transferGroupId: null,
        transferToUserId: '',
        logsModalOpen: false,
        logsGroupId: null,
    }

    private requesterLabelLoadSeq = 0

    componentDidMount(): void {
        void this.loadRequesterLabels(this.props.pendingJoinRequests)
    }

    componentDidUpdate(prevProps: FIUGroupViewProps): void {
        if (prevProps.pendingJoinRequests !== this.props.pendingJoinRequests) {
            void this.loadRequesterLabels(this.props.pendingJoinRequests)
        }
    }

    private loadRequesterLabels = async (requests: FIUGroupJoinRequestEntity[]): Promise<void> => {
        const mySeq = ++this.requesterLabelLoadSeq
        const requesterIds = Array.from(
            new Set(
                (requests ?? [])
                    .map((r) => r.requester_id)
                    .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
            )
        )

        if (requesterIds.length === 0) {
            this.setState({ requesterLabelById: {} })
            return
        }

        try {
            const labels = await FIUProfileModel.fetchLabelsForUsers(requesterIds)
            if (this.requesterLabelLoadSeq !== mySeq) return

            const next: Record<string, string> = {}
            requesterIds.forEach((id) => {
                next[id] = labels.get(id) ?? id
            })
            this.setState({ requesterLabelById: next })
        } catch {
            if (this.requesterLabelLoadSeq !== mySeq) return
            // If profile lookups are blocked by RLS, keep showing ids.
            this.setState({ requesterLabelById: {} })
        }
    }

    /** Clears group-management success and error feedback messages. */
    private clearFeedback = () => {
        this.setState({ error: null, success: null })
    }

    /** Toggles the busy/locked state across group action controls. */
    private setBusy = (busy: boolean) => {
        this.setState({ busy })
    }

    /** Opens the create-group modal and resets create form inputs. */
    private openCreateModal = () => {
        this.clearFeedback()
        this.setState({
            createModalOpen: true,
            createName: '',
            selectedBoardIds: [],
        })
    }

    /** Closes the create-group modal and clears create input state. */
    private closeCreateModal = () => {
        this.setState({
            createModalOpen: false,
            createName: '',
            selectedBoardIds: [],
        })
    }

    /** Opens the join-group modal and resets the UUID input. */
    private openJoinModal = () => {
        this.clearFeedback()
        this.setState({
            joinModalOpen: true,
            joinGroupId: '',
        })
    }

    /** Closes the join-group modal and clears the UUID input. */
    private closeJoinModal = () => {
        this.setState({
            joinModalOpen: false,
            joinGroupId: '',
        })
    }

    /** Opens edit-group modal and preloads currently assigned boards. */
    private openEditModal = (group: FIUGroupEntity) => {
        this.clearFeedback()
        const editSelectedBoardIds = this.props.boards
            .filter((board) => board.group_id === group.id)
            .map((board) => board.id)

        this.setState({
            editModalOpen: true,
            editGroupId: group.id,
            editName: group.name ?? '',
            editSelectedBoardIds,
            editSelectionTouched: false,
        })
    }

    /** Closes edit-group modal and clears edit-form state. */
    private closeEditModal = () => {
        this.setState({
            editModalOpen: false,
            editGroupId: '',
            editName: '',
            editSelectedBoardIds: [],
            editSelectionTouched: false,
        })
    }

    /** Toggles board selection in the create-group board picker. */
    private toggleBoardSelection = (boardId: string) => {
        this.setState((prev) => {
            const next = new Set(prev.selectedBoardIds)
            if (next.has(boardId)) next.delete(boardId)
            else next.add(boardId)
            return { selectedBoardIds: Array.from(next) }
        })
    }

    /** Toggles board selection in the edit-group board picker. */
    private toggleEditBoardSelection = (boardId: string) => {
        this.setState((prev) => {
            const next = new Set(prev.editSelectedBoardIds)
            if (next.has(boardId)) next.delete(boardId)
            else next.add(boardId)
            return {
                editSelectedBoardIds: Array.from(next),
                editSelectionTouched: true,
            }
        })
    }

    /** Creates a group using current form values and selected boards. */
    private handleCreateGroup = async () => {
        const name = this.state.createName.trim()
        if (!name) return
        const selectedBoardIds = [...this.state.selectedBoardIds]

        // Close the modal immediately after Create is clicked.
        this.closeCreateModal()

        try {
            this.setBusy(true)
            this.clearFeedback()
            await this.props.onCreateGroup(name, selectedBoardIds)
            this.setState({ success: 'Group created.' })
        } catch (err) {
            this.setState({
                error: this.getErrorMessage(err, 'Unable to create group.'),
            })
        } finally {
            this.setBusy(false)
        }
    }

    /** Submits a join request for the entered group UUID. */
    private handleJoinGroup = async () => {
        const groupId = this.state.joinGroupId.trim()
        if (!groupId) return

        try {
            this.setBusy(true)
            this.clearFeedback()
            await this.props.onJoinGroup(groupId)
            this.setState({ success: 'Join request sent.' })
            this.closeJoinModal()
        } catch (err) {
            this.setState({
                error: this.getErrorMessage(err, 'Unable to send join request.'),
            })
        } finally {
            this.setBusy(false)
        }
    }

    /** Saves group name and board assignment edits for a selected group. */
    private handleRenameGroup = async () => {
        const groupId = this.state.editGroupId
        const name = this.state.editName.trim()
        const boardIds = this.state.editSelectionTouched
            ? [...this.state.editSelectedBoardIds]
            : this.props.boards
                .filter((board) => board.group_id === groupId)
                .map((board) => board.id)
        if (!groupId || !name) return

        try {
            this.setBusy(true)
            this.clearFeedback()
            await this.props.onRenameGroup(groupId, name)
            await this.props.onUpdateGroupBoards(groupId, boardIds)
            this.setState({ success: 'Group updated.' })
            this.closeEditModal()
        } catch (err) {
            this.setState({
                error: this.getErrorMessage(err, 'Unable to update group.'),
            })
        } finally {
            this.setBusy(false)
        }
    }

    /** Deletes a group after user confirmation from the remove dialog. */
    private handleDeleteGroup = async (groupId: string) => {
        try {
            this.setBusy(true)
            this.clearFeedback()
            await this.props.onDeleteGroup(groupId)
            this.setState({
                success: 'Group removed.',
                shareGroupId: null,
                confirmDeleteGroupId: null,
            })
        } catch (err) {
            this.setState({
                error: this.getErrorMessage(err, 'Unable to remove group.'),
            })
        } finally {
            this.setBusy(false)
        }
    }

    /** Accepts or declines a pending join request for a group. */
    private handleRespondToRequest = async (requestId: string, accept: boolean) => {
        try {
            this.setBusy(true)
            this.clearFeedback()
            await this.props.onRespondToJoinRequest(requestId, accept)
            this.setState({ success: accept ? 'Request accepted.' : 'Request declined.' })
        } catch (err) {
            this.setState({
                error: this.getErrorMessage(err, 'Unable to process request.'),
            })
        } finally {
            this.setBusy(false)
        }
    }

    /** Copies a group UUID to clipboard for sharing. */
    private handleCopyUuid = async (groupId: string) => {
        try {
            await navigator.clipboard.writeText(groupId)
            this.setState({ success: 'UUID copied to clipboard.', error: null })
        } catch {
            this.setState({ error: 'Unable to copy UUID to clipboard.', success: null })
        }
    }

    /** Opens group removal confirmation modal for the selected group. */
    private openGroupDeleteConfirm = (groupId: string) => {
        this.setState({ confirmDeleteGroupId: groupId })
    }

    /** Closes group removal confirmation modal. */
    private closeGroupDeleteConfirm = () => {
        this.setState({ confirmDeleteGroupId: null })
    }

    private openLogsModal = (groupId: string | null) => {
        this.setState({ logsModalOpen: true, logsGroupId: groupId })
    }

    private closeLogsModal = () => {
        this.setState({ logsModalOpen: false, logsGroupId: null })
    }

    /** Renders group list, actions, and modal dialogs for group workflows. */
    render() {
        const { groups, boards, groupMembers, pendingJoinRequests } = this.props
        const {
            createModalOpen,
            joinModalOpen,
            editModalOpen,
            shareGroupId,
            createName,
            editName,
            joinGroupId,
            selectedBoardIds,
            editSelectedBoardIds,
            editSelectionTouched,
            editGroupId,
            confirmDeleteGroupId,
            busy,
            error,
            success,
            requesterLabelById,
            transferGroupId,
            transferToUserId,
            logsModalOpen,
            logsGroupId,
        } = this.state

        const getOwnerIdForGroup = (group: FIUGroupEntity): string | null => {
            const direct = group.created_by
            if (typeof direct === 'string' && direct.length > 0) return direct
            const fallbackOwner = (groupMembers ?? []).find((m) => m.group_id === group.id && m.role === 'owner')
            return fallbackOwner?.user_id ?? null
        }

        const getMyRoleForGroup = (group: FIUGroupEntity): 'owner' | 'admin' | 'member' => {
            const me = this.props.userId
            if (!me) return 'member'
            const ownerId = getOwnerIdForGroup(group)
            if (ownerId && ownerId === me) return 'owner'
            const membership = (groupMembers ?? []).find((m) => m.group_id === group.id && m.user_id === me)
            if (membership?.role === 'admin') return 'admin'
            if (membership?.role === 'owner') return 'owner'
            return 'member'
        }

        const getDisplayRoleForMember = (group: FIUGroupEntity, member: FIUGroupMemberEntity): 'owner' | 'admin' | 'member' => {
            const ownerId = getOwnerIdForGroup(group)
            if (ownerId && member.user_id === ownerId) return 'owner'
            if (member.role === 'admin') return 'admin'
            if (member.role === 'owner') return 'owner'
            return 'member'
        }

        const canModerate = (role: 'owner' | 'admin' | 'member') => role === 'owner' || role === 'admin'

        return (
            <>
                <section className="group-management-page" aria-label="Group settings">
                    <p className="board-management-subtitle">View your available groups.</p>
                    {groups.length === 0 ? (
                        <p className="board-management-placeholder">No groups found.</p>
                    ) : (
                        <div className="board-management-list" aria-label="Group list">
                            {groups.map((group) => (
                                <div key={group.id} className="board-management-item">
                                <div className="group-item-main">
                                    <strong>{group.name ?? 'Untitled Group'}</strong>
                                    {/* <span className="group-item-id">UUID: {group.id}</span> */}
                                </div>
                                <div className="group-item-actions">
                                    <label className="geofence-toggle" style={{ marginRight: 12 }}>
                                        <input
                                            type="checkbox"
                                            checked={this.props.groupVisibilityById[group.id] !== false}
                                            onChange={(e) => this.props.onSetGroupVisibility(group.id, e.target.checked)}
                                        />
                                        <span className="geofence-toggle-label">
                                            {this.props.groupVisibilityById[group.id] === false ? 'Off' : 'On'}
                                        </span>
                                    </label>

                                    <button
                                        type="button"
                                        className="board-management-button"
                                        onClick={() => this.openEditModal(group)}
                                        disabled={busy || !canModerate(getMyRoleForGroup(group))}
                                        style={{ display: canModerate(getMyRoleForGroup(group)) ? undefined : 'none' }}
                                    >
                                        Edit
                                    </button>
                                    <button
                                        type="button"
                                        className="board-management-danger"
                                        onClick={() => this.openGroupDeleteConfirm(group.id)}
                                        disabled={busy}
                                        style={{ display: getMyRoleForGroup(group) === 'owner' ? undefined : 'none' }}
                                    >
                                        Remove
                                    </button>
                                    <button
                                        type="button"
                                        className="board-management-button"
                                        onClick={() =>
                                            this.setState((prev) => ({
                                                shareGroupId: prev.shareGroupId === group.id ? null : group.id,
                                            }))
                                        }
                                        disabled={busy}
                                        style={{ display: canModerate(getMyRoleForGroup(group)) ? undefined : 'none' }}
                                    >
                                        Share
                                    </button>
                                    <button
                                        type="button"
                                        className="board-management-button"
                                        onClick={() => this.openLogsModal(group.id)}
                                        disabled={busy}
                                    >
                                        Logs
                                    </button>

                                    {getMyRoleForGroup(group) !== 'owner' ? (
                                        <button
                                            type="button"
                                            className="board-management-danger"
                                            onClick={async () => {
                                                try {
                                                    this.setBusy(true)
                                                    this.clearFeedback()
                                                    await this.props.onLeaveGroup(group.id)
                                                    this.setState({ success: 'Left group.' })
                                                } catch (err) {
                                                    this.setState({
                                                        error: this.getErrorMessage(err, 'Unable to leave group.'),
                                                    })
                                                } finally {
                                                    this.setBusy(false)
                                                }
                                            }}
                                            disabled={busy}
                                        >
                                            Leave
                                        </button>
                                    ) : (
                                        <button
                                            type="button"
                                            className="board-management-button"
                                            onClick={() =>
                                                this.setState((prev) => ({
                                                    transferGroupId: prev.transferGroupId === group.id ? null : group.id,
                                                    transferToUserId: '',
                                                }))
                                            }
                                            disabled={busy}
                                        >
                                            Transfer
                                        </button>
                                    )}
                                </div>

                                {shareGroupId === group.id && (
                                    <div className="group-share-panel" aria-label="Group share panel">
                                        <span className="group-item-id">UUID: {group.id}</span>
                                        <button
                                            type="button"
                                            className="board-management-button"
                                            onClick={() => this.handleCopyUuid(group.id)}
                                        >
                                            Copy
                                        </button>
                                        <a
                                            className="board-management-button group-email-link"
                                            href={`mailto:?subject=Join my aWhere tracking group (${group.name})&body=Use this group UUID to request access: ${group.id}`}
                                        >
                                            Email
                                        </a>
                                    </div>
                                )}

                                {pendingJoinRequests
                                    .filter((request) => request.group_id === group.id)
                                    .filter(() => canModerate(getMyRoleForGroup(group)))
                                    .map((request) => (
                                        <div
                                            key={request.id}
                                            className="group-join-request-row"
                                            aria-label="Pending group request"
                                        >
                                            <span className="group-request-user">
                                                Request from: {requesterLabelById[request.requester_id] ?? request.requester_id}
                                            </span>
                                            <button
                                                type="button"
                                                className="board-management-button"
                                                onClick={() =>
                                                    this.handleRespondToRequest(request.id, true)
                                                }
                                                disabled={busy}
                                            >
                                                Accept
                                            </button>
                                            <button
                                                type="button"
                                                className="board-management-danger"
                                                onClick={() =>
                                                    this.handleRespondToRequest(request.id, false)
                                                }
                                                disabled={busy}
                                            >
                                                Decline
                                            </button>
                                        </div>
                                    ))}

                                {transferGroupId === group.id && getMyRoleForGroup(group) === 'owner' && (
                                    <div className="group-share-panel" aria-label="Transfer ownership panel">
                                        <span className="group-item-id">Transfer ownership to:</span>
                                        <select
                                            className="board-management-input board-edit-compact"
                                            value={transferToUserId}
                                            onChange={(e) => this.setState({ transferToUserId: e.target.value })}
                                            disabled={busy}
                                        >
                                            <option value="">Select admin</option>
                                            {groupMembers
                                                .filter((m) => m.group_id === group.id)
                                                .filter((m) => getDisplayRoleForMember(group, m) === 'admin')
                                                .map((m) => (
                                                    <option key={m.user_id} value={m.user_id}>
                                                        {m.user_name}
                                                    </option>
                                                ))}
                                        </select>
                                        <button
                                            type="button"
                                            className="board-management-danger"
                                            onClick={async () => {
                                                try {
                                                    this.setBusy(true)
                                                    this.clearFeedback()
                                                    await this.props.onTransferOwnership(group.id, transferToUserId)
                                                    this.setState({ success: 'Ownership transferred.', transferGroupId: null, transferToUserId: '' })
                                                } catch (err) {
                                                    this.setState({
                                                        error: this.getErrorMessage(err, 'Unable to transfer ownership.'),
                                                    })
                                                } finally {
                                                    this.setBusy(false)
                                                }
                                            }}
                                            disabled={busy || !transferToUserId}
                                        >
                                            Confirm
                                        </button>
                                    </div>
                                )}

                                <div className="group-members-row" aria-label="Group users">
                                    <span className="group-request-user">Users in group:</span>
                                    {groupMembers.filter((member) => member.group_id === group.id).length === 0 ? (
                                        <span className="board-management-placeholder">No users yet.</span>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                            {groupMembers
                                                .filter((member) => member.group_id === group.id)
                                                .map((member) => {
                                                    const myRole = getMyRoleForGroup(group)
                                                    const targetRole = getDisplayRoleForMember(group, member)
                                                    const canEditMembers = canModerate(myRole)
                                                    const isSelf = this.props.userId && member.user_id === this.props.userId

                                                    const canPromote =
                                                        canEditMembers &&
                                                        targetRole === 'member' &&
                                                        !isSelf

                                                    const canDemote =
                                                        myRole === 'owner' &&
                                                        targetRole === 'admin' &&
                                                        !isSelf

                                                    const canRemove =
                                                        !isSelf &&
                                                        ((myRole === 'owner' && (targetRole === 'admin' || targetRole === 'member')) ||
                                                            (myRole === 'admin' && targetRole === 'member'))

                                                    return (
                                                        <div
                                                            key={`${member.group_id}-${member.user_id}`}
                                                            style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}
                                                        >
                                                            <span className="group-member-pill">{member.user_name}</span>
                                                            <span className="group-board-pill">{targetRole}</span>

                                                            {canPromote && (
                                                                <button
                                                                    type="button"
                                                                    className="board-management-button"
                                                                    disabled={busy}
                                                                    onClick={async () => {
                                                                        try {
                                                                            this.setBusy(true)
                                                                            this.clearFeedback()
                                                                            await this.props.onSetMemberRole(group.id, member.user_id, 'admin')
                                                                            this.setState({ success: 'Member promoted.' })
                                                                        } catch (err) {
                                                                            this.setState({
                                                                                error: this.getErrorMessage(err, 'Unable to promote member.'),
                                                                            })
                                                                        } finally {
                                                                            this.setBusy(false)
                                                                        }
                                                                    }}
                                                                >
                                                                    Make admin
                                                                </button>
                                                            )}

                                                            {canDemote && (
                                                                <button
                                                                    type="button"
                                                                    className="board-management-button"
                                                                    disabled={busy}
                                                                    onClick={async () => {
                                                                        try {
                                                                            this.setBusy(true)
                                                                            this.clearFeedback()
                                                                            await this.props.onSetMemberRole(group.id, member.user_id, 'member')
                                                                            this.setState({ success: 'Admin demoted.' })
                                                                        } catch (err) {
                                                                            this.setState({
                                                                                error: this.getErrorMessage(err, 'Unable to demote admin.'),
                                                                            })
                                                                        } finally {
                                                                            this.setBusy(false)
                                                                        }
                                                                    }}
                                                                >
                                                                    Make member
                                                                </button>
                                                            )}

                                                            {canRemove && (
                                                                <button
                                                                    type="button"
                                                                    className="board-management-danger"
                                                                    disabled={busy}
                                                                    onClick={async () => {
                                                                        try {
                                                                            this.setBusy(true)
                                                                            this.clearFeedback()
                                                                            await this.props.onRemoveMember(group.id, member.user_id)
                                                                            this.setState({ success: 'Member removed.' })
                                                                        } catch (err) {
                                                                            this.setState({
                                                                                error: this.getErrorMessage(err, 'Unable to remove member.'),
                                                                            })
                                                                        } finally {
                                                                            this.setBusy(false)
                                                                        }
                                                                    }}
                                                                >
                                                                    Remove
                                                                </button>
                                                            )}
                                                        </div>
                                                    )
                                                })}
                                        </div>
                                    )}
                                </div>

                                <div className="group-boards-row" aria-label="Boards in group">
                                    <span className="group-request-user">Boards in group:</span>
                                    {boards.filter((board) => board.group_id === group.id).length === 0 ? (
                                        <span className="board-management-placeholder">No boards assigned.</span>
                                    ) : (
                                        boards
                                            .filter((board) => board.group_id === group.id)
                                            .map((board) => (
                                                <span key={`${group.id}-${board.id}`} className="group-board-pill">
                                                    {board.display_name ?? 'Unnamed Board'}
                                                </span>
                                            ))
                                    )}
                                </div>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="group-management-actions">
                        <button
                            type="button"
                            className="board-management-button"
                            onClick={() => this.openLogsModal(groups[0]?.id ?? null)}
                            disabled={groups.length === 0}
                        >
                            Logs
                        </button>
                        <button
                            type="button"
                            className="board-management-button"
                            onClick={this.openCreateModal}
                        >
                            Create Group
                        </button>
                        <button
                            type="button"
                            className="board-management-button"
                            onClick={this.openJoinModal}
                        >
                            Join Group
                        </button>
                    </div>

                    {error && <p className="board-management-error">{error}</p>}
                    {success && <p className="board-management-success">{success}</p>}
                </section>

                {createModalOpen && (
                    <Modal
                        open={createModalOpen}
                        onRequestClose={this.closeCreateModal}
                        overlayClassName="group-modal-overlay"
                        contentClassName="board-edit-popup"
                        contentProps={{
                            'aria-label': 'Create group',
                        }}
                    >
                            <h3>Create Group</h3>
                            <input
                                className="board-management-input group-text-input"
                                placeholder="Group name"
                                value={createName}
                                onChange={(event) =>
                                    this.setState({ createName: event.target.value })
                                }
                            />
                            <div className="group-board-picker" aria-label="Board picker">
                                {boards.length === 0 ? (
                                    <p className="board-management-placeholder">
                                        No boards available for assignment.
                                    </p>
                                ) : (
                                    boards.map((board) => {
                                        const selected = selectedBoardIds.includes(board.id)
                                        return (
                                            <button
                                                key={board.id}
                                                type="button"
                                                className={`group-board-option ${selected ? 'selected' : ''}`}
                                                onClick={() => this.toggleBoardSelection(board.id)}
                                            >
                                                <span>{selected ? '−' : '+'}</span>
                                                <span>{board.display_name ?? 'Unnamed Board'}</span>
                                            </button>
                                        )
                                    })
                                )}
                            </div>
                            <div className="board-edit-popup-actions">
                                <button
                                    type="button"
                                    className="board-management-button"
                                    onClick={this.closeCreateModal}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    className="board-management-button"
                                    onClick={this.handleCreateGroup}
                                    disabled={busy || !createName.trim()}
                                >
                                    Create
                                </button>
                            </div>
                    </Modal>
                )}

                {joinModalOpen && (
                    <Modal
                        open={joinModalOpen}
                        onRequestClose={this.closeJoinModal}
                        overlayClassName="group-modal-overlay"
                        contentClassName="board-edit-popup"
                        contentProps={{
                            'aria-label': 'Join group',
                        }}
                    >
                            <h3>Join Group</h3>
                            <input
                                className="board-management-input group-text-input"
                                placeholder="Group UUID"
                                value={joinGroupId}
                                onChange={(event) =>
                                    this.setState({ joinGroupId: event.target.value })
                                }
                            />
                            <div className="board-edit-popup-actions">
                                <button
                                    type="button"
                                    className="board-management-button"
                                    onClick={this.closeJoinModal}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    className="board-management-button"
                                    onClick={this.handleJoinGroup}
                                    disabled={busy || !joinGroupId.trim()}
                                >
                                    Request to Join
                                </button>
                            </div>
                    </Modal>
                )}

                {editModalOpen && (
                    <Modal
                        open={editModalOpen}
                        onRequestClose={this.closeEditModal}
                        overlayClassName="group-modal-overlay"
                        contentClassName="board-edit-popup"
                        contentProps={{
                            'aria-label': 'Edit group',
                        }}
                    >
                            <h3>Edit Group</h3>
                            <input
                                className="board-management-input group-text-input"
                                placeholder="Group name"
                                value={editName}
                                onChange={(event) => this.setState({ editName: event.target.value })}
                            />
                            <div className="group-board-picker" aria-label="Edit group boards">
                                {boards.length === 0 ? (
                                    <p className="board-management-placeholder">No boards available.</p>
                                ) : (
                                    boards.map((board) => {
                                        const selected = editSelectionTouched
                                            ? editSelectedBoardIds.includes(board.id)
                                            : board.group_id === editGroupId || editSelectedBoardIds.includes(board.id)
                                        return (
                                            <button
                                                key={board.id}
                                                type="button"
                                                className={`group-board-option ${selected ? 'selected' : ''}`}
                                                onClick={() => this.toggleEditBoardSelection(board.id)}
                                            >
                                                <span>{selected ? '−' : '+'}</span>
                                                <span>{board.display_name ?? 'Unnamed Board'}</span>
                                                {board.group_id === editGroupId && (
                                                    <span className="group-item-id"></span>
                                                )}
                                            </button>
                                        )
                                    })
                                )}
                            </div>
                            <div className="board-edit-popup-actions">
                                <button
                                    type="button"
                                    className="board-management-button"
                                    onClick={this.closeEditModal}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    className="board-management-button"
                                    onClick={this.handleRenameGroup}
                                    disabled={busy || !editName.trim()}
                                >
                                    Save
                                </button>
                            </div>
                    </Modal>
                )}

                <ConfirmDialog
                    open={Boolean(confirmDeleteGroupId)}
                    onCancel={this.closeGroupDeleteConfirm}
                    onConfirm={() => {
                        if (!confirmDeleteGroupId) return
                        void this.handleDeleteGroup(confirmDeleteGroupId)
                    }}
                    title="Remove Group"
                    message="Are you sure you want to remove this group?"
                    ariaLabel="Confirm remove group"
                    busy={busy}
                    confirmLabel="Confirm Remove"
                    cancelLabel="Cancel"
                />

                <LogListModal
                    open={logsModalOpen}
                    onClose={this.closeLogsModal}
                    groups={groups}
                    boards={boards}
                    initialGroupId={logsGroupId}
                />
            </>
        )
    }
}
