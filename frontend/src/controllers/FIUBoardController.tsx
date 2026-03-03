import { Component } from 'react'
import type { FIUBoardEntity } from '../entities/FIUBoardEntity'
import type { FIULocationRecordEntity } from '../entities/FIULocationRecordEntity'
import { authService } from '../services/authService'
import { FIUBoardModel } from '../models/FIUBoardModel'
import { FIUBoardView } from '../views/FIUBoardView'

interface Props {
    userEmail: string | undefined
    userId: string | undefined
    onLogout: () => void
}

type State = {
    boards: FIUBoardEntity[]
    locations: FIULocationRecordEntity[]
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
        error: null,
    }

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
            const res = await this.loadBoardsAndLatestLocations(this.props.userId)
            if (this.cancelled) return
            if (this.requestSeq !== mySeq) return
            this.setState({ boards: res.boards, locations: res.locations })
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
            })
        }
    }

    /** Signs out the user and notifies the app shell. */
    private handleSignOut = async (): Promise<void> => {
        await authService.signOut()
        this.props.onLogout()
    }

    render() {
        const { userEmail } = this.props
        const { boards, locations, error } = this.state

        return (
            <FIUBoardView
                userEmail={userEmail}
                boards={boards}
                locations={locations}
                error={error}
                onSignOut={this.handleSignOut}
            />
        )
    }
}
