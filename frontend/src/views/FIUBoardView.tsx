import { Component, createRef } from 'react'
import { authService } from '../services/authService'
import type { FIUBoardEntity } from '../entities/FIUBoardEntity'
import type { FIULocationRecordEntity } from '../entities/FIULocationRecordEntity'
import { FIUBoardController } from '../controllers/FIUBoardController'
import { FIUMapView } from './FIUMapView'
import '../components/Dashboard.css'

interface Props {
    userEmail: string | undefined
    userId: string | undefined
    onLogout: () => void
}

type State = {
    menuOpen: boolean
    boards: FIUBoardEntity[]
    locations: FIULocationRecordEntity[]
    error: string | null
}

export class FIUBoardView extends Component<Props, State> {
    state: State = {
        menuOpen: false,
        boards: [],
        locations: [],
        error: null,
    }

    private mapRef = createRef<HTMLDivElement>()
    private controller = new FIUBoardController()
    private mapView = new FIUMapView()
    private cancelled = false

    componentDidMount() {
        const container = this.mapRef.current
        if (container) {
            this.mapView.init(container)
        }

        void this.load()
    }

    componentDidUpdate(prevProps: Props, prevState: State) {
        if (this.props.userId !== prevProps.userId && this.props.userId) {
            void this.load()
        }

        if (
            prevState.boards !== this.state.boards ||
            prevState.locations !== this.state.locations
        ) {
            this.mapView.render(this.state.boards, this.state.locations)
        }
    }

    componentWillUnmount() {
        this.cancelled = true
    }

    private async load() {
        try {
            this.setState({ error: null })
            const res = await this.controller.loadBoardsAndLatestLocations(this.props.userId)
            if (this.cancelled) return
            this.setState({ boards: res.boards, locations: res.locations })
        } catch (e: unknown) {
            if (this.cancelled) return
            console.error('Dashboard load error:', e)
            this.setState({
                error: 'Something went wrong while loading your boards. Please try again.',
                boards: [],
                locations: [],
            })
        }
    }

    private toggleMenuOpen = () => {
        this.setState((prev) => ({ menuOpen: !prev.menuOpen }))
    }

    private handleLogout = async () => {
        await authService.signOut()
        this.props.onLogout()
    }

    render() {
        const { userEmail } = this.props
        const { menuOpen, boards, locations, error } = this.state

        return (
            <div className="dashboard-root">
                {/* Map */}
                <div ref={this.mapRef} className="map-container" />

                {/* Account menu */}
                <div className="account-menu">
                    <button className="account-button" onClick={this.toggleMenuOpen}>
                        Account ⌄
                    </button>

                    {menuOpen && (
                        <div className="account-dropdown">
                            <p className="account-email">{userEmail}</p>
                            <button className="signout-button" onClick={this.handleLogout}>
                                Sign Out
                            </button>
                        </div>
                    )}
                </div>

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
                    {boards.length === 0 && !error && (
                        <p>
                            No boards found.
                        </p>
                    )}
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
