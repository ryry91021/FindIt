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

/**
 * Pure presentation of the dashboard.
 * Renders based on props (no DB access / request flow).
 */
export class FIUBoardView extends Component<Props> {
    private mapContainerRef = createRef<HTMLDivElement>()
    private mapView = new FIUMapView()

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

        return (
            <div className="dashboard-root">
                {/* Map */}
                <div ref={this.mapContainerRef} className="map-container" />

                {/* Account menu */}
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
