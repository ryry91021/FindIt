import { useEffect, useMemo, useRef, useState } from 'react'
import { authService } from '../services/authService'
import type { FIUBoardEntity } from '../entities/FIUBoardEntity'
import type { FIULocationRecordEntity } from '../entities/FIULocationRecordEntity'
import { FIUBoardController } from '../controllers/FIUBoardController'
import { FIUMapView } from './FIUMapView'
import '../components/Dashboard.css'

interface Props {
    userEmail: string | undefined
    onLogout: () => void
}

export function FIUBoardView({ userEmail, onLogout }: Props) {
    const mapRef = useRef<HTMLDivElement>(null)

    const controller = useMemo(() => new FIUBoardController(), [])
    const mapView = useMemo(() => new FIUMapView(), [])

    const [menuOpen, setMenuOpen] = useState(false)
    const [boards, setBoards] = useState<FIUBoardEntity[]>([])
    const [locations, setLocations] = useState<FIULocationRecordEntity[]>([])
    const [error, setError] = useState<string | null>(null)

    // Init map once
    useEffect(() => {
        if (!mapRef.current) return
        mapView.init(mapRef.current)
    }, [mapView])

    // Load data once
    useEffect(() => {
        let cancelled = false

        const load = async () => {
            try {
                setError(null)
                const res = await controller.loadBoardsAndLatestLocations()
                if (cancelled) return

                setBoards(res.boards)
                setLocations(res.locations)
            } catch (e: any) {
                if (cancelled) return
                console.error('Dashboard load error:', e)
                setError(e?.message ?? 'Unknown error')
                setBoards([])
                setLocations([])
            }
        }

        load()
        return () => {
            cancelled = true
        }
    }, [controller])

    // Render markers whenever data changes
    useEffect(() => {
        mapView.render(boards, locations)
    }, [mapView, boards, locations])

    const handleLogout = async () => {
        await authService.signOut()
        onLogout()
    }

    return (
        <div className="dashboard-root">
            {/* Map */}
            <div ref={mapRef} className="map-container" />

            {/* Account menu */}
            <div className="account-menu">
                <button
                    className="account-button"
                    onClick={() => setMenuOpen((v) => !v)}
                >
                    Account ⌄
                </button>

                {menuOpen && (
                    <div className="account-dropdown">
                        <p className="account-email">{userEmail}</p>
                        <button className="signout-button" onClick={handleLogout}>
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
                        color: '#ffffff',
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
                {boards.length === 0 && <p>No boards found</p>}
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
        </div>
    )
}
