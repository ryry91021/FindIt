import { useEffect, useMemo, useRef, useState } from 'react'
import type { FIUBoardEntity } from '../entities/FIUBoardEntity'
import { FIUMapView } from '../views/FIUMapView'
import { FIULogModel, type FIULogPlaybackRecord, type FIULogRunSummary } from '../models/FIULogModel'
import { Modal } from './Modal'

type Props = {
    open: boolean
    onClose: () => void
    run: FIULogRunSummary | null
    board: FIUBoardEntity | null
}

/** Playback panel for a selected log run using the map renderer. */
export function LogPlaybackPanel({ open, onClose, run, board }: Props) {
    const mapContainerRef = useRef<HTMLDivElement | null>(null)
    const mapViewRef = useRef<FIUMapView | null>(null)
    const timerRef = useRef<number | null>(null)

    const [records, setRecords] = useState<FIULogPlaybackRecord[]>([])
    const [index, setIndex] = useState(0)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [playing, setPlaying] = useState(true)
    const [loop, setLoop] = useState(true)
    const [speed, setSpeed] = useState(1)

    const current = useMemo(() => {
        if (records.length === 0) return null
        return records[Math.max(0, Math.min(index, records.length - 1))]
    }, [records, index])

    useEffect(() => {
        if (!open || !run || !board) return

        let cancelled = false
        setLoading(true)
        setError(null)
        setPlaying(true)
        setIndex(0)

        void FIULogModel.fetchRunRecords(run.runId, board.id)
            .then((result) => {
                if (cancelled) return
                setRecords(result)
                if (result.length === 0) {
                    setError('No playback records found for this log.')
                }
            })
            .catch((err: unknown) => {
                if (cancelled) return
                setError(err instanceof Error ? err.message : 'Unable to load playback records.')
                setRecords([])
            })
            .finally(() => {
                if (!cancelled) setLoading(false)
            })

        return () => {
            cancelled = true
        }
    }, [open, run, board])

    useEffect(() => {
        if (!open || !mapContainerRef.current) return
        if (!mapViewRef.current) {
            mapViewRef.current = new FIUMapView()
            mapViewRef.current.init(mapContainerRef.current)
        }

        return () => {
            if (!open && mapViewRef.current) {
                mapViewRef.current.destroy()
                mapViewRef.current = null
            }
        }
    }, [open])

    useEffect(() => {
        if (!open || !mapViewRef.current || !board || !current) return

        mapViewRef.current.render(
            [board],
            [
                {
                    device_id: board.id,
                    latitude: current.latitude,
                    longitude: current.longitude,
                    accuracy_meters: current.accuracy_meters,
                    recorded_at: current.recorded_at,
                },
            ]
        )
    }, [open, board, current])

    useEffect(() => {
        if (!open || !playing || records.length <= 1) return

        const intervalMs = Math.max(100, Math.round(1000 / speed))
        timerRef.current = window.setInterval(() => {
            setIndex((prev) => {
                const next = prev + 1
                if (next < records.length) return next
                if (loop) return 0
                setPlaying(false)
                return records.length - 1
            })
        }, intervalMs)

        return () => {
            if (timerRef.current != null) {
                window.clearInterval(timerRef.current)
                timerRef.current = null
            }
        }
    }, [open, playing, records.length, speed, loop])

    useEffect(() => {
        if (!open) {
            if (timerRef.current != null) {
                window.clearInterval(timerRef.current)
                timerRef.current = null
            }
            if (mapViewRef.current) {
                mapViewRef.current.destroy()
                mapViewRef.current = null
            }
        }
    }, [open])

    return (
        <Modal
            open={open}
            onRequestClose={onClose}
            overlayClassName="group-modal-overlay"
            contentClassName="board-edit-popup"
            contentProps={{ 'aria-label': 'Log playback' }}
        >
            <h3>Playback</h3>
            <p className="board-management-subtitle" style={{ marginTop: 0 }}>
                {run?.name ?? 'Log'} — {board?.display_name ?? 'Board'}
            </p>

            <div
                ref={mapContainerRef}
                style={{ height: 300, width: '100%', borderRadius: 8, overflow: 'hidden', marginBottom: 10 }}
            />

            {loading && <p className="board-management-placeholder">Loading records...</p>}
            {error && <p className="board-management-error">{error}</p>}

            {!loading && !error && current && (
                <>
                    <p className="board-management-subtitle" style={{ margin: '4px 0 10px' }}>
                        Timestamp: {new Date(current.recorded_at).toLocaleString()}
                    </p>

                    <div className="board-edit-popup-actions" style={{ justifyContent: 'space-between', gap: 8 }}>
                        <button
                            type="button"
                            className="board-management-button"
                            onClick={() => setPlaying((prev) => !prev)}
                        >
                            {playing ? 'Pause' : 'Play'}
                        </button>

                        <label className="board-management-subtitle" style={{ margin: 0 }}>
                            Speed
                            <select
                                className="board-management-input"
                                value={String(speed)}
                                onChange={(event) => setSpeed(Number(event.target.value))}
                                style={{ marginLeft: 8, width: 100 }}
                            >
                                <option value="0.5">0.5x</option>
                                <option value="1">1x</option>
                                <option value="2">2x</option>
                                <option value="4">4x</option>
                            </select>
                        </label>

                        <label className="geofence-toggle">
                            <input
                                type="checkbox"
                                checked={loop}
                                onChange={(event) => setLoop(event.target.checked)}
                            />
                            <span className="geofence-toggle-label">Loop</span>
                        </label>

                        <button type="button" className="board-management-button" onClick={onClose}>
                            Exit
                        </button>
                    </div>
                </>
            )}
        </Modal>
    )
}
