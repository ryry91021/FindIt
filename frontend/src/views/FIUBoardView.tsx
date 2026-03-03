/*
    Responsibilities:
    - Creates boards legend

    - Provides status of the
            boards

    - Handle data clearing on
            sign-out
*/

import { Component, createRef } from 'react'
import type { FIUBoardEntity } from '../entities/FIUBoardEntity'
import type { FIULocationRecordEntity } from '../entities/FIULocationRecordEntity'
import { FIUMapView } from './FIUMapView'
import { FIUAccountView } from './FIUAccountView'
import '../components/Dashboard.css'

interface Props {
    userEmail?: string
    boards: FIUBoardEntity[]
    locations: FIULocationRecordEntity[]
    error: string | null
    onSignOut: () => void
}
type State = {
    sidebarOpen: boolean
}

/**
 * Pure presentation of the dashboard.
 * Renders based on props (no DB access / request flow).
 */
export class FIUBoardView extends Component<Props, State> {
    state: State = { sidebarOpen: false }

    private mapContainerRef = createRef<HTMLDivElement>()
    private mapView = new FIUMapView()

    private toggleSidebar = () => {
        this.setState((prev) => ({ sidebarOpen: !prev.sidebarOpen }))
    }

    private closeSidebar = () => {
        this.setState({ sidebarOpen: false })
    }

    componentDidMount(): void {
        const container = this.mapContainerRef.current
        if (container) {
            this.mapView.init(container)
        }

        this.mapView.render(this.props.boards, this.props.locations)
    }

    componentDidUpdate(prevProps: Props): void {
        if (prevProps.boards !== this.props.boards || prevProps.locations !== this.props.locations) {
            this.mapView.render(this.props.boards, this.props.locations)
        }
    }

    /** Renders the map and board status list. */
    render() {
        const { userEmail, boards, locations, error, onSignOut } = this.props
        const { sidebarOpen } = this.state

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
                            <li><button type="button" className="sidebar-link">Page placeholder 1</button></li>
                            <li><button type="button" className="sidebar-link">Page placeholder 2</button></li>
                            <li><button type="button" className="sidebar-link">Page placeholder 3</button></li>
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
