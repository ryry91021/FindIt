import { useEffect, useMemo, useState } from 'react'
import type { FIUBoardEntity } from '../entities/FIUBoardEntity'
import type { FIUGroupEntity } from '../entities/FIUGroupEntity'
import { FIULogModel, type FIULogRunSummary } from '../models/FIULogModel'
import { Modal } from './Modal'
import { LogPlaybackPanel } from './LogPlaybackPanel'

type Props = {
    open: boolean
    onClose: () => void
    groups: FIUGroupEntity[]
    boards: FIUBoardEntity[]
    initialGroupId: string | null
}

function getTodayDateInputValue(): string {
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
}

/** Group-filtered list of log runs with playback and rename actions. */
export function LogListModal({ open, onClose, groups, boards, initialGroupId }: Props) {
    const ALL_GROUPS = '__all__'
    const ALL_BOARDS = '__all__'
    const [selectedGroupId, setSelectedGroupId] = useState<string>('')
    const [selectedBoardId, setSelectedBoardId] = useState<string>(ALL_BOARDS)
    const [selectedDate, setSelectedDate] = useState<string>('')
    const [runs, setRuns] = useState<FIULogRunSummary[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const [activeRunId, setActiveRunId] = useState<string | null>(null)
    const [renameRunId, setRenameRunId] = useState<string | null>(null)
    const [renameValue, setRenameValue] = useState('')

    const activeRun = useMemo(
        () => runs.find((run) => run.runId === activeRunId) ?? null,
        [runs, activeRunId]
    )
    const activeBoard = useMemo(
        () => (activeRun ? boards.find((board) => board.id === activeRun.boardId) ?? null : null),
        [activeRun, boards]
    )

    useEffect(() => {
        if (!open) return

        const fallbackGroupId = groups[0]?.id ?? ''
        setSelectedGroupId(initialGroupId ?? fallbackGroupId ?? ALL_GROUPS)
        setSelectedBoardId(ALL_BOARDS)
        // Default to today so current recording sessions are shown first.
        setSelectedDate(getTodayDateInputValue())
        setActiveRunId(null)
    }, [open, initialGroupId, groups])

    useEffect(() => {
        if (!open) return

        let cancelled = false
        setLoading(true)
        setError(null)

        void FIULogModel.listRunsForGroup(selectedGroupId === ALL_GROUPS ? null : selectedGroupId, boards)
            .then((result) => {
                if (cancelled) return
                setRuns(result)
            })
            .catch((err: unknown) => {
                if (cancelled) return
                setError(err instanceof Error ? err.message : 'Unable to load logs.')
                setRuns([])
            })
            .finally(() => {
                if (!cancelled) setLoading(false)
            })

        return () => {
            cancelled = true
        }
    }, [open, selectedGroupId, boards])

    const saveRename = async (run: FIULogRunSummary) => {
        const nextName = renameValue.trim()
        if (!nextName || nextName === run.name) {
            setRenameRunId(null)
            return
        }

        try {
            await FIULogModel.renameRun(run.runId, nextName)
            setRuns((prev) => prev.map((item) => (item.runId === run.runId ? { ...item, name: nextName } : item)))
            setRenameRunId(null)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unable to rename log.')
        }
    }

    const deleteRun = async (run: FIULogRunSummary) => {
        const board = boards.find((item) => item.id === run.boardId)
        const confirmed = window.confirm(
            `Delete this log?\n\nBoard: ${board?.display_name ?? run.boardId}\nStart: ${new Date(run.startAt).toLocaleString()}\nEnd: ${new Date(run.endAt).toLocaleString()}\n\nThis cannot be undone.`
        )
        if (!confirmed) return

        try {
            await FIULogModel.deleteRun(run)
            setRuns((prev) => prev.filter((item) => item.runId !== run.runId || item.boardId !== run.boardId))
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unable to delete log.')
        }
    }

    const filteredBoards = useMemo(() => {
        if (selectedGroupId === ALL_GROUPS) return boards
        return boards.filter((board) => board.group_id === selectedGroupId)
    }, [boards, selectedGroupId])

    const filteredRuns = useMemo(() => {
        const boardScoped =
            selectedBoardId === ALL_BOARDS
                ? runs
                : runs.filter((run) => run.boardId === selectedBoardId)

        if (!selectedDate) return boardScoped

        const [year, month, day] = selectedDate.split('-').map((part) => Number(part))
        if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
            return boardScoped
        }

        const dayStartMs = new Date(year, month - 1, day, 0, 0, 0, 0).getTime()
        const dayEndMs = new Date(year, month - 1, day, 23, 59, 59, 999).getTime()

        return boardScoped.filter((run) => {
            const runStartMs = Date.parse(run.startAt)
            const runEndMs = Date.parse(run.endAt)
            if (Number.isNaN(runStartMs) || Number.isNaN(runEndMs)) return false
            // Keep runs that overlap the selected day window.
            return runStartMs <= dayEndMs && runEndMs >= dayStartMs
        })
    }, [runs, selectedBoardId, selectedDate])

    const onRequestClose = () => {
        setActiveRunId(null)
        setRenameRunId(null)
        onClose()
    }

    return (
        <>
            <Modal
                open={open}
                onRequestClose={onRequestClose}
                overlayClassName="group-modal-overlay"
                contentClassName="board-edit-popup"
                contentProps={{ 'aria-label': 'Logs', style: { maxHeight: '80vh', overflowY: 'auto' } }}
            >
                <h3>Logs</h3>
                <p className="board-management-subtitle">View log files and play back board locations.</p>

                <div className="board-management-row" style={{ marginBottom: 10, gap: 12, flexWrap: 'wrap' }}>
                    <label className="board-management-subtitle" style={{ margin: 0 }}>
                        Group filter
                        <select
                            className="board-management-input"
                            value={selectedGroupId}
                            onChange={(event) => {
                                setSelectedGroupId(event.target.value)
                                setSelectedBoardId(ALL_BOARDS)
                            }}
                            style={{ marginLeft: 8 }}
                        >
                            <option value={ALL_GROUPS}>All groups</option>
                            {groups.map((group) => (
                                <option key={group.id} value={group.id}>
                                    {group.name}
                                </option>
                            ))}
                        </select>
                    </label>

                    <label className="board-management-subtitle" style={{ margin: 0 }}>
                        Board filter
                        <select
                            className="board-management-input"
                            value={selectedBoardId}
                            onChange={(event) => setSelectedBoardId(event.target.value)}
                            style={{ marginLeft: 8 }}
                        >
                            <option value={ALL_BOARDS}>All boards</option>
                            {filteredBoards.map((board) => (
                                <option key={board.id} value={board.id}>
                                    {board.display_name ?? board.id}
                                </option>
                            ))}
                        </select>
                    </label>

                    <label className="board-management-subtitle" style={{ margin: 0 }}>
                        Calendar filter
                        <input
                            type="date"
                            className="board-management-input"
                            value={selectedDate}
                            onChange={(event) => setSelectedDate(event.target.value)}
                            style={{ marginLeft: 8 }}
                        />
                    </label>

                    <button
                        type="button"
                        className="board-management-button"
                        onClick={() => setSelectedDate('')}
                        disabled={!selectedDate}
                    >
                        Clear Date
                    </button>
                </div>

                {loading && <p className="board-management-placeholder">Loading logs...</p>}
                {error && <p className="board-management-error">{error}</p>}

                {!loading && filteredRuns.length === 0 && (
                    <p className="board-management-placeholder">No logs found for this group.</p>
                )}

                {!loading && filteredRuns.length > 0 && (
                    <div className="board-management-list" aria-label="Log files" style={{ maxHeight: '52vh', overflowY: 'auto' }}>
                        {filteredRuns.map((run) => {
                            const board = boards.find((item) => item.id === run.boardId)
                            const isRenaming = renameRunId === run.runId
                            return (
                                <div key={run.runId} className="board-management-item" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                                        <strong>{run.name}</strong>
                                        <span className="group-item-id">Board: {board?.display_name ?? run.boardId}</span>
                                    </div>

                                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                                        <span className="group-item-id">Start: {new Date(run.startAt).toLocaleString()}</span>
                                        <span className="group-item-id">End: {new Date(run.endAt).toLocaleString()}</span>
                                        <span className="group-item-id">Records: {run.recordCount}</span>
                                    </div>

                                    <div className="board-edit-popup-actions" style={{ justifyContent: 'flex-start' }}>
                                        <button
                                            type="button"
                                            className="board-management-button"
                                            onClick={() => setActiveRunId(run.runId)}
                                        >
                                            Play
                                        </button>

                                        {isRenaming ? (
                                            <>
                                                <input
                                                    className="board-management-input"
                                                    value={renameValue}
                                                    onChange={(event) => setRenameValue(event.target.value)}
                                                    placeholder="New log name"
                                                />
                                                <button
                                                    type="button"
                                                    className="board-management-button"
                                                    onClick={() => {
                                                        void saveRename(run)
                                                    }}
                                                >
                                                    Save
                                                </button>
                                                <button
                                                    type="button"
                                                    className="board-management-button"
                                                    onClick={() => setRenameRunId(null)}
                                                >
                                                    Cancel
                                                </button>
                                            </>
                                        ) : (
                                            <>
                                                <button
                                                    type="button"
                                                    className="board-management-button"
                                                    onClick={() => {
                                                        setRenameRunId(run.runId)
                                                        setRenameValue(run.name)
                                                    }}
                                                >
                                                    Rename
                                                </button>
                                                <button
                                                    type="button"
                                                    className="board-management-danger"
                                                    onClick={() => {
                                                        void deleteRun(run)
                                                    }}
                                                >
                                                    Delete
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}

                <div className="board-edit-popup-actions">
                    <button type="button" className="board-management-button" onClick={onRequestClose}>
                        Close
                    </button>
                </div>
            </Modal>

            <LogPlaybackPanel
                open={Boolean(activeRunId)}
                onClose={() => setActiveRunId(null)}
                run={activeRun}
                board={activeBoard}
            />
        </>
    )
}
