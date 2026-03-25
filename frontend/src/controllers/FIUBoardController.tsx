/*
    Responsibilities:
    - Loads latest boards and
            their respective locations

    - Handles cancelled
            requests when loading

    - Provide boards & location
            for the map
*/

import { Component } from 'react'
import type { FIUBoardEntity } from '../entities/FIUBoardEntity'
import type { FIULocationRecordEntity } from '../entities/FIULocationRecordEntity'
import { authService } from '../services/authService'
import { FIUBoardModel } from '../models/FIUBoardModel'
import { FIUGroupModel } from '../models/FIUGroupModel'
import { FIUProfileModel } from '../models/FIUProfileModel'
import { FIUBoardView } from '../views/FIUBoardView'
import type { SidebarModalAction } from '../views/FIUBoardView'
import type { FIUGroupEntity } from '../entities/FIUGroupEntity'
import type { FIUGroupJoinRequestEntity } from '../models/FIUGroupModel'
import type { FIUGroupMemberEntity } from '../models/FIUGroupModel'
import type { FIUGeofenceEntity } from '../entities/FIUGeofenceEntity'
import { FIUGeofencesController } from './FIUGeofencesController'



interface Props {
    userEmail: string | undefined
    userId: string | undefined
    onLogout: () => void
}

type State = {
    boards: FIUBoardEntity[]
    locations: FIULocationRecordEntity[]
    geofences: FIUGeofenceEntity[]
    groups: FIUGroupEntity[]
    groupMembers: FIUGroupMemberEntity[]
    pendingGroupJoinRequests: FIUGroupJoinRequestEntity[]
    userDisplayName?: string
    error: string | null
}

/**
 * Orchestrates dashboard request flow (no data logic).
 * Loads data via models and passes props to the view.
 */
export class FIUBoardController extends Component<Props, State> {
    state: State = {
        boards: [],
        locations: [],
        geofences: [],
        groups: [],
        groupMembers: [],
        pendingGroupJoinRequests: [],
        userDisplayName: undefined,
        error: null,
    }

    private geofencesController = new FIUGeofencesController()

    private requestSeq = 0
    private cancelled = false

    componentDidMount(): void {
        void this.load()
    }

    componentDidUpdate(prevProps: Props): void {
        if (this.props.userId !== prevProps.userId) {
            void this.load()
        }
    }

    componentWillUnmount(): void {
        this.cancelled = true
    }

    /**
     * Loads boards for a user and fetches their latest locations.
     * Exposed for orchestration-level testing.
     */
    async loadBoardsAndLatestLocations(userId?: string): Promise<{
        boards: FIUBoardEntity[]
        locations: FIULocationRecordEntity[]
    }> {
        try {
            return await FIUBoardModel.loadBoardsAndLatestLocations(userId)
        } catch (err) {
            console.error('FIUBoardController.loadBoardsAndLatestLocations failed', err)
            // In development, bubble up the real error to make RLS/schema issues debuggable.
            if (import.meta.env.MODE === 'development') {
                if (err instanceof Error) throw err
                throw new Error('Unable to load dashboard data (unknown error).')
            }

            // In test/production, keep the UI-facing message stable.
            throw new Error('Unable to load dashboard data. Please try again.')
        }
    }

    /** Loads boards + latest locations for the active user. */
    private async load(): Promise<void> {
        const mySeq = ++this.requestSeq

        try {
            this.setState({ error: null })
            const [res, groups, pendingGroupJoinRequests, geofences, userDisplayName] = await Promise.all([
                this.loadBoardsAndLatestLocations(this.props.userId),
                FIUGroupModel.fetchGroupsForUser(this.props.userId),
                FIUGroupModel.fetchPendingJoinRequests(this.props.userId),
                this.geofencesController.loadGeofences(this.props.userId),
                FIUProfileModel.fetchBestLabelForUser(this.props.userId, this.props.userEmail),
            ])
            const groupMembers = await FIUGroupModel.fetchMembersForGroups(
                groups.map((group) => group.id)
            )
            if (this.cancelled) return
            if (this.requestSeq !== mySeq) return
            this.setState({
                boards: res.boards,
                locations: res.locations,
                geofences,
                groups,
                groupMembers,
                pendingGroupJoinRequests,
                userDisplayName,
            })
        } catch (err) {
            if (this.cancelled) return
            if (this.requestSeq !== mySeq) return
            console.error('FIUBoardController: load failed', err)
            this.setState({
                error:
                    err instanceof Error
                        ? err.message
                        : 'Something went wrong while loading your boards. Please try again.',
                boards: [],
                locations: [],
                geofences: [],
                groups: [],
                groupMembers: [],
                pendingGroupJoinRequests: [],
                userDisplayName: undefined,
            })
        }
    }

    private async refreshBoardsAndGroups(): Promise<void> {
        const [res, groups, pendingGroupJoinRequests, geofences, userDisplayName] = await Promise.all([
            this.loadBoardsAndLatestLocations(this.props.userId),
            FIUGroupModel.fetchGroupsForUser(this.props.userId),
            FIUGroupModel.fetchPendingJoinRequests(this.props.userId),
            this.geofencesController.loadGeofences(this.props.userId),
            FIUProfileModel.fetchBestLabelForUser(this.props.userId, this.props.userEmail),
        ])
        const groupMembers = await FIUGroupModel.fetchMembersForGroups(
            groups.map((group) => group.id)
        )

        this.setState({
            boards: res.boards,
            locations: res.locations,
            geofences,
            groups,
            groupMembers,
            pendingGroupJoinRequests,
            userDisplayName,
        })
    }

    private handleCreateGeofence = async (
        name: string,
        centerLat: number,
        centerLon: number,
        radiusMeters: number,
        groupId?: string | null
    ): Promise<void> => {
        await this.geofencesController.createGeofence(
            {
                name,
                center_lat: centerLat,
                center_lon: centerLon,
                radius_meters: radiusMeters,
                enabled: true,
                group_id: groupId ?? null,
            },
            this.props.userId
        )
        await this.refreshBoardsAndGroups()
    }

    private handleUpdateGeofence = async (
        geofenceId: string,
        patch: { name?: string; center_lat?: number; center_lon?: number; radius_meters?: number; group_id?: string | null }
    ): Promise<void> => {
        await this.geofencesController.updateGeofence(geofenceId, patch)
        await this.refreshBoardsAndGroups()
    }

    private handleToggleGeofenceEnabled = async (geofenceId: string, enabled: boolean): Promise<void> => {
        await this.geofencesController.toggleEnabled(geofenceId, enabled)
        await this.refreshBoardsAndGroups()
    }

    private handleDeleteGeofence = async (geofenceId: string): Promise<void> => {
        await this.geofencesController.deleteGeofence(geofenceId)
        await this.refreshBoardsAndGroups()
    }

    /** Creates a new board and refreshes dashboard data. */
    private handleCreateBoard = async (displayName: string, deviceEui: string): Promise<void> => {
        await FIUBoardModel.createBoard(displayName, deviceEui, this.props.userId)
        await this.refreshBoardsAndGroups()
    }

    /** Deletes a board and refreshes dashboard data. */
    private handleDeleteBoard = async (boardId: string): Promise<void> => {
        await FIUBoardModel.deleteBoard(boardId)
        await this.refreshBoardsAndGroups()
    }

    /** Renames a board and refreshes dashboard data. */
    private handleRenameBoard = async (boardId: string, newName: string): Promise<void> => {
        await FIUBoardModel.renameBoard(boardId, newName)
        await this.refreshBoardsAndGroups()
    }

    /** Adds a board to a selected group and refreshes dashboard data. */
    private handleAddBoardToGroup = async (boardId: string, groupId: string): Promise<void> => {
        await FIUBoardModel.assignBoardToGroup(boardId, groupId)
        await this.refreshBoardsAndGroups()
    }

    private handleCreateGroup = async (name: string, boardIds: string[]): Promise<void> => {
        await FIUGroupModel.createGroup(name, boardIds, this.props.userId)
        await this.refreshBoardsAndGroups()
    }

    private handleDeleteGroup = async (groupId: string): Promise<void> => {
        await FIUGroupModel.deleteGroup(groupId)
        await this.refreshBoardsAndGroups()
    }

    private handleRenameGroup = async (groupId: string, name: string): Promise<void> => {
        await FIUGroupModel.renameGroup(groupId, name)
        await this.refreshBoardsAndGroups()
    }

    private handleUpdateGroupBoards = async (
        groupId: string,
        boardIds: string[]
    ): Promise<void> => {
        await FIUBoardModel.setBoardsForGroup(
            groupId,
            boardIds,
            this.state.boards.map((board) => board.id),
            this.state.boards
                .filter((board) => board.group_id === groupId)
                .map((board) => board.id)
        )
        await this.refreshBoardsAndGroups()
    }

    private handleJoinGroup = async (groupId: string): Promise<void> => {
        await FIUGroupModel.requestJoinGroup(groupId, this.props.userId)
        await this.refreshBoardsAndGroups()
    }

    private handleRespondToGroupJoinRequest = async (
        requestId: string,
        accept: boolean
    ): Promise<void> => {
        await FIUGroupModel.respondToJoinRequest(requestId, accept, this.props.userId)
        await this.refreshBoardsAndGroups()
    }

    private handleLeaveGroup = async (groupId: string): Promise<void> => {
        await FIUGroupModel.leaveGroup(groupId, this.props.userId)
        await this.refreshBoardsAndGroups()
    }

    private handleSetMemberRole = async (groupId: string, memberUserId: string, role: 'admin' | 'member'): Promise<void> => {
        await FIUGroupModel.setMemberRole(groupId, memberUserId, role)
        await this.refreshBoardsAndGroups()
    }

    private handleRemoveMember = async (groupId: string, memberUserId: string): Promise<void> => {
        await FIUGroupModel.removeMember(groupId, memberUserId)
        await this.refreshBoardsAndGroups()
    }

    private handleTransferOwnership = async (groupId: string, newOwnerUserId: string): Promise<void> => {
        await FIUGroupModel.transferOwnership(groupId, newOwnerUserId, this.props.userId)
        await this.refreshBoardsAndGroups()
    }

    /** Signs out the user and notifies the app shell. */
    private handleSignOut = async (): Promise<void> => {
        await authService.signOut()
        this.props.onLogout()
    }

    /** Receives sidebar modal actions for future orchestration hooks. */
    private handleSidebarAction = (action: SidebarModalAction): void => {
        void action
        // Intentionally no-op for now; controller owns this callback for future wiring.
    }

    render() {
        const { userEmail } = this.props
        const { boards, locations, geofences, groups, groupMembers, pendingGroupJoinRequests, error, userDisplayName } =
            this.state

        return (
            <FIUBoardView
                userId={this.props.userId}
                userEmail={userEmail}
                userDisplayName={userDisplayName}
                boards={boards}
                locations={locations}
                geofences={geofences}
                groups={groups}
                groupMembers={groupMembers}
                error={error}
                pendingGroupJoinRequests={pendingGroupJoinRequests}
                onSignOut={this.handleSignOut}
                onSidebarAction={this.handleSidebarAction}
                onCreateBoard={this.handleCreateBoard}
                onDeleteBoard={this.handleDeleteBoard}
                onRenameBoard={this.handleRenameBoard}
                onAddBoardToGroup={this.handleAddBoardToGroup}
                onCreateGroup={this.handleCreateGroup}
                onDeleteGroup={this.handleDeleteGroup}
                onRenameGroup={this.handleRenameGroup}
                onUpdateGroupBoards={this.handleUpdateGroupBoards}
                onJoinGroup={this.handleJoinGroup}
                onRespondToGroupJoinRequest={this.handleRespondToGroupJoinRequest}
                onLeaveGroup={this.handleLeaveGroup}
                onSetMemberRole={this.handleSetMemberRole}
                onRemoveMember={this.handleRemoveMember}
                onTransferOwnership={this.handleTransferOwnership}
                onCreateGeofence={this.handleCreateGeofence}
                onUpdateGeofence={this.handleUpdateGeofence}
                onToggleGeofenceEnabled={this.handleToggleGeofenceEnabled}
                onDeleteGeofence={this.handleDeleteGeofence}
            />
        )
    }
}
