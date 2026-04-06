/*
    Responsibilities:
    - Orchestrates the map page load/refresh flow
    - Delegates domain-specific actions to domain controllers
*/

import type { ReactNode } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { FIUBoardEntity } from '../entities/FIUBoardEntity'
import type { FIULocationRecordEntity } from '../entities/FIULocationRecordEntity'
import { authService } from '../services/authService'
import { supabase } from '../services/supabaseClient'
import { FIUBoardView } from '../views/FIUBoardView'
import type { SidebarModalAction } from '../views/FIUBoardView'
import type { FIUGroupEntity } from '../entities/FIUGroupEntity'
import type { FIUGroupJoinRequestEntity, FIUGroupMemberEntity } from '../models/FIUGroupModel'
import type { FIUGeofenceEntity } from '../entities/FIUGeofenceEntity'

import { FIUBoardsController } from './FIUBoardsController'
import { FIULocationRecordsController } from './FIULocationRecordsController'
import { FIUGroupsController } from './FIUGroupsController'
import { FIUGeofencesController } from './FIUGeofencesController'
import { FIUController } from './FIUController'


interface Props {
    userEmail: string | undefined
    userId: string | undefined
    userDisplayName?: string
    onLogout: () => void
}

type State = {
    boards: FIUBoardEntity[]
    locations: FIULocationRecordEntity[]
    groups: FIUGroupEntity[]
    groupMembers: FIUGroupMemberEntity[]
    pendingGroupJoinRequests: FIUGroupJoinRequestEntity[]
    geofences: FIUGeofenceEntity[]
    error: string | null
}

/**
 * Orchestrates map page request flow (no domain data logic).
 * Loads data via domain controllers and passes props to the composition view.
 */
export class FIUMapController extends FIUController<Props, State> {
    state: State = {
        boards: [],
        locations: [],
        groups: [],
        groupMembers: [],
        pendingGroupJoinRequests: [],
        geofences: [],
        error: null,
    }

    private boardsController = new FIUBoardsController()
    private locationsController = new FIULocationRecordsController()
    private groupsController = new FIUGroupsController()
    private geofencesController = new FIUGeofencesController()

    private locationLogsChannel: RealtimeChannel | null = null
    private locationLogsChannelUserId: string | undefined

    componentDidMount(): void {
        void this.load()
        this.ensureLocationLogsSubscription()
    }

    componentDidUpdate(prevProps: Props): void {
        if (this.props.userId !== prevProps.userId) {
            void this.load()
            this.ensureLocationLogsSubscription()
        }
    }

    componentWillUnmount(): void {
        this.teardownLocationLogsSubscription()
        super.componentWillUnmount()
    }

    private teardownLocationLogsSubscription(): void {
        try {
            if (this.locationLogsChannel) {
                void this.locationLogsChannel.unsubscribe()
            }
        } finally {
            this.locationLogsChannel = null
            this.locationLogsChannelUserId = undefined
        }
    }

    private ensureLocationLogsSubscription(): void {
        // Avoid opening websocket connections during unit/integration tests.
        if (import.meta.env.MODE === 'test') return

        const userId = this.props.userId
        if (!userId) {
            this.teardownLocationLogsSubscription()
            return
        }

        if (this.locationLogsChannel && this.locationLogsChannelUserId === userId) return

        this.teardownLocationLogsSubscription()
        this.locationLogsChannelUserId = userId

        this.locationLogsChannel = supabase
            .channel(`location_logs_inserts:${userId}`)
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'location_logs' },
                (payload) => {
                    const next = payload.new as Partial<FIULocationRecordEntity>
                    const deviceId = next.device_id
                    if (!deviceId) return

                    // Only update markers for boards we currently have loaded.
                    // Realtime delivery is permission-filtered, but we also filter
                    // to avoid thrashing state for irrelevant events.
                    this.setState((prev) => {
                        if (!prev.boards || prev.boards.length === 0) return null

                        const boardIds = new Set(prev.boards.map((b) => b.id))
                        if (!boardIds.has(deviceId)) return null

                        const incoming = next as FIULocationRecordEntity

                        const idx = prev.locations.findIndex((l) => l.device_id === deviceId)
                        if (idx === -1) {
                            return { locations: [...prev.locations, incoming] }
                        }

                        const existing = prev.locations[idx]
                        const existingTs = Date.parse(existing.recorded_at)
                        const incomingTs = Date.parse(incoming.recorded_at)
                        const isNewer =
                            Number.isNaN(existingTs) || Number.isNaN(incomingTs)
                                ? true
                                : incomingTs >= existingTs

                        if (!isNewer) return null

                        const nextLocations = prev.locations.slice()
                        nextLocations[idx] = incoming
                        return { locations: nextLocations }
                    })
                }
            )
            .subscribe((status) => {
                if (import.meta.env.MODE === 'development') {
                    console.info('[FIUMapController] location_logs subscription status', { status })
                }
            })
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
            const boards = await this.boardsController.loadBoards(userId)
            const deviceIds = boards.map((b) => b.id)
            const locations = await this.locationsController.loadLatestLocations(deviceIds)
            return { boards, locations }
        } catch (err) {
            console.error('FIUMapController.loadBoardsAndLatestLocations failed', err)
            // In development, bubble up the real error to make RLS/schema issues debuggable.
            if (import.meta.env.MODE === 'development') {
                if (err instanceof Error) throw err
                throw new Error('Unable to load map data (unknown error).')
            }

            // In test/production, keep the UI-facing message stable.
            throw new Error('Unable to load map data. Please try again.')
        }
    }

    /** Loads the full page state (boards+locations+groups+geofences). */
    private async load(): Promise<void> {
        const token = this.beginRequest()

        try {
            this.setState({ error: null })

            const [boardsAndLocations, groups, pendingGroupJoinRequests, geofences] = await Promise.all([
                this.loadBoardsAndLatestLocations(this.props.userId),
                this.groupsController.loadGroups(this.props.userId),
                this.groupsController.loadPendingJoinRequests(this.props.userId),
                this.geofencesController.loadGeofences(this.props.userId),
            ])

            const groupMembers = await this.groupsController.loadMembersForGroups(
                groups.map((group) => group.id)
            )

            if (!this.isRequestActive(token)) return

            if (import.meta.env.MODE === 'development') {
                console.info('[FIUMapController] committing load state', {
                    boards: boardsAndLocations.boards.length,
                    locations: boardsAndLocations.locations.length,
                    groups: groups.length,
                    groupMembers: groupMembers.length,
                    pendingGroupJoinRequests: pendingGroupJoinRequests.length,
                    geofences: geofences.length,
                })
            }

            this.setState({
                boards: boardsAndLocations.boards,
                locations: boardsAndLocations.locations,
                groups,
                groupMembers,
                pendingGroupJoinRequests,
                geofences,
            })
        } catch (err) {
            if (!this.isRequestActive(token)) return
            console.error('FIUMapController: load failed', err)
            this.setState({
                error:
                    this.getErrorMessage(
                        err,
                        'Something went wrong while loading your map. Please try again.'
                    ),
                boards: [],
                locations: [],
                groups: [],
                groupMembers: [],
                pendingGroupJoinRequests: [],
                geofences: [],
            })
        }
    }

    private async refreshAll(): Promise<void> {
        const token = this.beginRequest()
        const [boardsAndLocations, groups, pendingGroupJoinRequests, geofences] = await Promise.all([
            this.loadBoardsAndLatestLocations(this.props.userId),
            this.groupsController.loadGroups(this.props.userId),
            this.groupsController.loadPendingJoinRequests(this.props.userId),
            this.geofencesController.loadGeofences(this.props.userId),
        ])
        const groupMembers = await this.groupsController.loadMembersForGroups(
            groups.map((group) => group.id)
        )

        if (!this.isRequestActive(token)) return

        this.setState({
            boards: boardsAndLocations.boards,
            locations: boardsAndLocations.locations,
            groups,
            groupMembers,
            pendingGroupJoinRequests,
            geofences,
        })
    }

    private handleCreateGeofence = async (
        name: string,
        center_lat: number,
        center_lon: number,
        radius_meters: number,
        groupId?: string | null,
        color?: string
    ): Promise<void> => {
        await this.geofencesController.createGeofence(
            { name, center_lat, center_lon, radius_meters, enabled: true, group_id: groupId ?? null, color },
            this.props.userId
        )
        await this.refreshAll()
    }

    private handleUpdateGeofence = async (
        geofenceId: string,
        patch: { name?: string; center_lat?: number; center_lon?: number; radius_meters?: number; group_id?: string | null; color?: string }
    ): Promise<void> => {
        await this.geofencesController.updateGeofence(geofenceId, patch)
        await this.refreshAll()
    }

    private handleToggleGeofenceEnabled = async (geofenceId: string, enabled: boolean): Promise<void> => {
        await this.geofencesController.toggleEnabled(geofenceId, enabled)
        await this.refreshAll()
    }

    private handleDeleteGeofence = async (geofenceId: string): Promise<void> => {
        await this.geofencesController.deleteGeofence(geofenceId)
        await this.refreshAll()
    }

    private handleCreateBoard = async (displayName: string, deviceEui: string): Promise<void> => {
        await this.boardsController.createBoard(displayName, deviceEui, this.props.userId)
        await this.refreshAll()
    }

    private handleDeleteBoard = async (boardId: string): Promise<void> => {
        await this.boardsController.deleteBoard(boardId)
        await this.refreshAll()
    }

    private handleRenameBoard = async (boardId: string, newName: string): Promise<void> => {
        await this.boardsController.renameBoard(boardId, newName)
        await this.refreshAll()
    }

    private handleAddBoardToGroup = async (boardId: string, groupId: string): Promise<void> => {
        await this.boardsController.assignBoardToGroup(boardId, groupId)
        await this.refreshAll()
    }

    private handleCreateGroup = async (name: string, boardIds: string[]): Promise<void> => {
        await this.groupsController.createGroup(name, boardIds, this.props.userId)
        await this.refreshAll()
    }

    private handleDeleteGroup = async (groupId: string): Promise<void> => {
        await this.groupsController.deleteGroup(groupId)
        await this.refreshAll()
    }

    private handleRenameGroup = async (groupId: string, name: string): Promise<void> => {
        await this.groupsController.renameGroup(groupId, name)
        await this.refreshAll()
    }

    private handleUpdateGroupBoards = async (groupId: string, boardIds: string[]): Promise<void> => {
        await this.boardsController.setBoardsForGroup(groupId, boardIds, this.state.boards)
        await this.refreshAll()
    }

    private handleJoinGroup = async (groupId: string): Promise<void> => {
        await this.groupsController.requestJoinGroup(groupId, this.props.userId)
        await this.refreshAll()
    }

    private handleRespondToGroupJoinRequest = async (requestId: string, accept: boolean): Promise<void> => {
        await this.groupsController.respondToJoinRequest(requestId, accept, this.props.userId)
        await this.refreshAll()
    }

    private handleLeaveGroup = async (groupId: string): Promise<void> => {
        await this.groupsController.leaveGroup(groupId, this.props.userId)
        await this.refreshAll()
    }

    private handleSetMemberRole = async (groupId: string, memberUserId: string, role: 'admin' | 'member'): Promise<void> => {
        await this.groupsController.setMemberRole(groupId, memberUserId, role)
        await this.refreshAll()
    }

    private handleRemoveMember = async (groupId: string, memberUserId: string): Promise<void> => {
        await this.groupsController.removeMember(groupId, memberUserId)
        await this.refreshAll()
    }

    private handleTransferOwnership = async (groupId: string, newOwnerUserId: string): Promise<void> => {
        await this.groupsController.transferOwnership(groupId, newOwnerUserId, this.props.userId)
        await this.refreshAll()
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

    render(): ReactNode {
        const { userEmail } = this.props
        const { userDisplayName } = this.props
        const { boards, locations, groups, groupMembers, pendingGroupJoinRequests, geofences, error } = this.state

        return (
            <FIUBoardView
                userId={this.props.userId}
                userEmail={userEmail}
                userDisplayName={userDisplayName}
                boards={boards}
                locations={locations}
                groups={groups}
                groupMembers={groupMembers}
                error={error}
                geofences={geofences}
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
