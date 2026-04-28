import type { SupabaseClient } from '@supabase/supabase-js'
import type { FIUBoardEntity } from '../entities/FIUBoardEntity'
import type { FIULocationRecordEntity } from '../entities/FIULocationRecordEntity'
import { supabase } from '../services/supabaseClient'

export interface FIULogRunSummary {
    runId: string
    name: string
    boardId: string
    startAt: string
    endAt: string
    recordCount: number
    synthetic?: boolean
}

export interface FIULogPlaybackRecord extends FIULocationRecordEntity {
    runId: string
}

type RawLogRow = {
    device_id: string
    latitude: number
    longitude: number
    accuracy_meters: number | null
    recorded_at: string
    raw_payload?: Record<string, unknown> | null
}

const RUN_ID_KEYS = ['run_id', 'log_id', 'session_id']
const RUN_NAME_KEYS = ['name', 'log_name', 'run_name', 'title']
const SYNTHETIC_PREFIX = 'synthetic:'

function getText(raw: Record<string, unknown> | null | undefined, key: string): string | null {
    const value = raw?.[key]
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
}

function extractRunId(raw: Record<string, unknown> | null | undefined, fallback: string): string {
    for (const key of RUN_ID_KEYS) {
        const value = getText(raw, key)
        if (value) return value
    }
    return fallback
}

function extractRunName(raw: Record<string, unknown> | null | undefined): string | null {
    for (const key of RUN_NAME_KEYS) {
        const value = getText(raw, key)
        if (value) return value
    }
    return null
}

/** Database-backed log listing and playback data access. */
export class FIULogModel {
    /**
     * Returns grouped run summaries for boards currently assigned to a selected group.
     * Includes both the current user's boards and other members' boards because filtering is by group assignment.
     */
    static async listRunsForGroup(
        groupId: string | null,
        boards: FIUBoardEntity[],
        client: SupabaseClient = supabase
    ): Promise<FIULogRunSummary[]> {
        const groupBoards = groupId
            ? (boards ?? []).filter((board) => board.group_id === groupId)
            : (boards ?? [])
        if (groupBoards.length === 0) return []

        const boardById = new Map(groupBoards.map((board) => [board.id, board]))

        if (groupId) {
            try {
                const { data: rpcRows, error: rpcError } = await client.rpc('fetch_runs_for_group', {
                    p_group_id: groupId,
                })

                if (rpcError) throw rpcError

                const rows = (rpcRows ?? []) as Array<{
                    run_id?: string | null
                    name?: string | null
                    board_id?: string | null
                    start_at?: string | null
                    end_at?: string | null
                    record_count?: number | null
                }>

                const rpcRuns = rows
                    .filter((row) => typeof row.run_id === 'string' && typeof row.board_id === 'string')
                    .filter((row) => boardById.has(row.board_id as string))
                    .map((row) => {
                        const board = boardById.get(row.board_id as string)
                        return {
                            runId: row.run_id as string,
                            name: row.name?.trim() || board?.display_name?.trim() || row.run_id || 'Unnamed log',
                            boardId: row.board_id as string,
                            startAt: row.start_at ?? row.end_at ?? new Date(0).toISOString(),
                            endAt: row.end_at ?? row.start_at ?? new Date(0).toISOString(),
                            recordCount: Number(row.record_count ?? 0),
                        }
                    })
                    .sort((a, b) => Date.parse(b.endAt) - Date.parse(a.endAt))

                if (rpcRuns.length > 0) {
                    return rpcRuns
                }
            } catch {
                // Continue to raw query fallback below.
            }
        }

        {
            const boardIds = groupBoards.map((board) => board.id)
            const { data, error } = await client
                .from('location_logs')
                .select('device_id, recorded_at, raw_payload')
                .in('device_id', boardIds)
                .order('recorded_at', { ascending: true })
                .limit(10000)

            if (error) {
                console.error('FIULogModel.listRunsForGroup fallback query failed', error)
                throw new Error('Unable to load logs for this group.')
            }

            const summaryByRun = new Map<string, FIULogRunSummary>()

            ;((data ?? []) as RawLogRow[]).forEach((row) => {
                const board = boardById.get(row.device_id)
                if (!board) return

                const runId = extractRunId(
                    row.raw_payload ?? null,
                    `${SYNTHETIC_PREFIX}${row.device_id}:${new Date(row.recorded_at).toISOString().slice(0, 10)}`
                )

                const existing = summaryByRun.get(runId)
                const recordTs = row.recorded_at
                if (!existing) {
                    summaryByRun.set(runId, {
                        runId,
                        name: extractRunName(row.raw_payload ?? null) ?? board.display_name ?? runId,
                        boardId: row.device_id,
                        startAt: recordTs,
                        endAt: recordTs,
                        recordCount: 1,
                        synthetic: runId.startsWith(SYNTHETIC_PREFIX),
                    })
                    return
                }

                if (Date.parse(recordTs) < Date.parse(existing.startAt)) {
                    existing.startAt = recordTs
                }
                if (Date.parse(recordTs) > Date.parse(existing.endAt)) {
                    existing.endAt = recordTs
                }
                existing.recordCount += 1
            })

            return Array.from(summaryByRun.values()).sort(
                (a, b) => Date.parse(b.endAt) - Date.parse(a.endAt)
            )
        }
    }

    /** Fetches ordered playback records for a specific run and board. */
    static async fetchRunRecords(
        runId: string,
        boardId: string,
        client: SupabaseClient = supabase
    ): Promise<FIULogPlaybackRecord[]> {
        if (!runId || !boardId) return []

        if (runId.startsWith(SYNTHETIC_PREFIX)) {
            const syntheticKey = runId.slice(SYNTHETIC_PREFIX.length)
            const [syntheticBoardId, day] = syntheticKey.split(':')
            if (!syntheticBoardId || !day) return []

            const dayStart = `${day}T00:00:00.000Z`
            const dayEnd = `${day}T23:59:59.999Z`

            const { data, error } = await client
                .from('location_logs')
                .select('device_id, latitude, longitude, accuracy_meters, recorded_at')
                .eq('device_id', syntheticBoardId)
                .gte('recorded_at', dayStart)
                .lte('recorded_at', dayEnd)
                .order('recorded_at', { ascending: true })

            if (error) {
                console.error('FIULogModel.fetchRunRecords synthetic query failed', error)
                throw new Error('Unable to load playback records.')
            }

            return ((data ?? []) as RawLogRow[]).map((row) => ({
                device_id: row.device_id,
                latitude: row.latitude,
                longitude: row.longitude,
                accuracy_meters: row.accuracy_meters ?? null,
                recorded_at: row.recorded_at,
                runId,
            }))
        }

        try {
            const { data: rpcRows, error: rpcError } = await client.rpc('fetch_records_for_run', {
                p_run_id: runId,
            })
            if (rpcError) throw rpcError

            const rows = (rpcRows ?? []) as RawLogRow[]
            return rows
                .filter((row) => row.device_id === boardId)
                .map((row) => ({
                    device_id: row.device_id,
                    latitude: row.latitude,
                    longitude: row.longitude,
                    accuracy_meters: row.accuracy_meters ?? null,
                    recorded_at: row.recorded_at,
                    runId,
                }))
        } catch {
            const { data, error } = await client
                .from('location_logs')
                .select('device_id, latitude, longitude, accuracy_meters, recorded_at, raw_payload')
                .eq('device_id', boardId)
                .order('recorded_at', { ascending: true })
                .limit(15000)

            if (error) {
                console.error('FIULogModel.fetchRunRecords fallback query failed', error)
                throw new Error('Unable to load playback records.')
            }

            return ((data ?? []) as RawLogRow[])
                .filter((row) => extractRunId(row.raw_payload ?? null, '') === runId)
                .map((row) => ({
                    device_id: row.device_id,
                    latitude: row.latitude,
                    longitude: row.longitude,
                    accuracy_meters: row.accuracy_meters ?? null,
                    recorded_at: row.recorded_at,
                    runId,
                }))
        }
    }

    /** Renames a run via DB RPC. */
    static async renameRun(runId: string, name: string, client: SupabaseClient = supabase): Promise<void> {
        const trimmed = name.trim()
        if (!runId || !trimmed) return

        const { error } = await client.rpc('rename_run', {
            p_run_id: runId,
            p_name: trimmed,
        })

        if (error) {
            console.error('FIULogModel.renameRun failed', error)
            throw new Error('Unable to rename log. Ensure rename_run RPC is deployed.')
        }
    }

    /** Deletes a run and its records for a specific board. */
    static async deleteRun(
        run: FIULogRunSummary,
        client: SupabaseClient = supabase
    ): Promise<void> {
        if (!run?.runId || !run?.boardId) {
            throw new Error('Invalid log run.')
        }

        if (run.runId.startsWith(SYNTHETIC_PREFIX)) {
            const syntheticKey = run.runId.slice(SYNTHETIC_PREFIX.length)
            const [syntheticBoardId, day] = syntheticKey.split(':')
            if (!syntheticBoardId || !day) {
                throw new Error('Invalid synthetic log id.')
            }

            // Preferred: RPC path (works under restrictive RLS).
            const { error: rpcError } = await client.rpc('delete_log_records', {
                p_run_id: null,
                p_board_id: syntheticBoardId,
                p_day: day,
            })

            if (!rpcError) return

            const dayStart = `${day}T00:00:00.000Z`
            const dayEnd = `${day}T23:59:59.999Z`

            const { error } = await client
                .from('location_logs')
                .delete()
                .eq('device_id', syntheticBoardId)
                .gte('recorded_at', dayStart)
                .lte('recorded_at', dayEnd)

            if (error) {
                console.error('FIULogModel.deleteRun synthetic delete failed', error)
                throw new Error('Unable to delete synthetic log records. If RLS blocks this, deploy delete_log_records RPC migration.')
            }
            return
        }

        // Preferred: RPC path (works under restrictive RLS).
        const { error: rpcError } = await client.rpc('delete_log_records', {
            p_run_id: run.runId,
            p_board_id: run.boardId,
            p_day: null,
        })

        if (!rpcError) return

        const { error: deleteRecordsError } = await client
            .from('location_logs')
            .delete()
            .eq('device_id', run.boardId)
            .eq('run_id', run.runId)

        if (deleteRecordsError) {
            console.error('FIULogModel.deleteRun location_logs delete failed', deleteRecordsError)
            throw new Error('Unable to delete log records. If RLS blocks this, deploy delete_log_records RPC migration.')
        }

        // Best-effort cleanup of metadata if this run no longer has rows.
        const { count, error: countErr } = await client
            .from('location_logs')
            .select('id', { count: 'exact', head: true })
            .eq('run_id', run.runId)

        if (!countErr && (count ?? 0) === 0) {
            const { error: metaErr } = await client
                .from('logs_metadata')
                .delete()
                .eq('run_id', run.runId)

            if (metaErr) {
                console.warn('FIULogModel.deleteRun metadata cleanup failed', metaErr)
            }
        }
    }
}
