import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

import type { FIUBoardEntity } from '../../src/entities/FIUBoardEntity'

type SupabaseError = { message?: string } | null

type SelectResponse<T> = Promise<{ data: T; error: SupabaseError }>

type QueryBuilder<T> = {
  select: (columns: string) => QueryBuilder<T>
  in: (column: string, values: unknown[]) => QueryBuilder<T>
  eq: (column: string, value: unknown) => QueryBuilder<T>
  gte: (column: string, value: unknown) => QueryBuilder<T>
  lte: (column: string, value: unknown) => QueryBuilder<T>
  order: (column: string, opts: { ascending: boolean }) => QueryBuilder<T>
  limit: (n: number) => SelectResponse<T>
}

function makeClient(opts: {
  rpcDataByFn?: Record<string, unknown>
  rpcErrorsByFn?: Record<string, SupabaseError>
  selectData?: unknown[]
}) {
  const rpcDataByFn = opts.rpcDataByFn ?? {}
  const rpcErrorsByFn = opts.rpcErrorsByFn ?? {}
  const selectData = opts.selectData ?? []

  const calls = {
    rpc: [] as Array<{ fn: string; args: unknown }>,
    select: [] as Array<{ table: string; columns: string }>,
    in: [] as Array<{ column: string; values: unknown[] }>,
    eq: [] as Array<{ column: string; value: unknown }>,
    gte: [] as Array<{ column: string; value: unknown }>,
    lte: [] as Array<{ column: string; value: unknown }>,
    order: [] as Array<{ column: string; ascending: boolean }>,
    limit: [] as number[],
  }

  const rpc = vi.fn((fn: string, args: unknown) => {
    calls.rpc.push({ fn, args })
    const error = rpcErrorsByFn[fn] ?? null
    const data = rpcDataByFn[fn] ?? null
    return Promise.resolve({ data, error })
  })

  const from = vi.fn((table: string) => {
    const execute = () => Promise.resolve({ data: selectData, error: null })

    const builder: QueryBuilder<unknown[]> & PromiseLike<{ data: unknown[]; error: SupabaseError }> = {
      select: (columns: string) => {
        calls.select.push({ table, columns })
        return builder
      },
      in: (column: string, values: unknown[]) => {
        calls.in.push({ column, values })
        return builder
      },
      eq: (column: string, value: unknown) => {
        calls.eq.push({ column, value })
        return builder
      },
      gte: (column: string, value: unknown) => {
        calls.gte.push({ column, value })
        return builder
      },
      lte: (column: string, value: unknown) => {
        calls.lte.push({ column, value })
        return builder
      },
      order: (column: string, opts: { ascending: boolean }) => {
        calls.order.push({ column, ascending: opts.ascending })
        return builder
      },
      limit: (n: number) => {
        calls.limit.push(n)
        return execute()
      },
      then: (onFulfilled, onRejected) => {
        return execute().then(onFulfilled, onRejected)
      },
    }

    return builder
  })

  return {
    client: { from, rpc } as unknown as SupabaseClient,
    calls,
  }
}

describe('FIULogModel', () => {
  it('listRunsForGroup uses RPC when available and maps rows', async () => {
    const boards: FIUBoardEntity[] = [
      { id: 'b1', owner_id: 'u1', display_name: 'Board 1', device_eui: 'e1', group_id: 'g1' },
      { id: 'b2', owner_id: 'u1', display_name: 'Board 2', device_eui: 'e2', group_id: 'g1' },
    ]

    const { client, calls } = makeClient({
      rpcDataByFn: {
        fetch_runs_for_group: [
          {
            run_id: 'run_1',
            name: 'Morning',
            board_id: 'b1',
            start_at: '2026-05-04T10:00:00.000Z',
            end_at: '2026-05-04T10:05:00.000Z',
            record_count: 5,
          },
        ],
      },
    })

    const { FIULogModel } = await import('../../src/models/FIULogModel')
    const runs = await FIULogModel.listRunsForGroup('g1', boards, client)

    expect(calls.rpc).toEqual([{ fn: 'fetch_runs_for_group', args: { p_group_id: 'g1' } }])
    expect(runs).toHaveLength(1)
    expect(runs[0]).toMatchObject({
      runId: 'run_1',
      name: 'Morning',
      boardId: 'b1',
      recordCount: 5,
    })
    expect(Date.parse(runs[0].startAt)).toBe(Date.parse('2026-05-04T10:00:00.000Z'))
    expect(Date.parse(runs[0].endAt)).toBe(Date.parse('2026-05-04T10:05:00.000Z'))
  })

  it('listRunsForGroup fallback groups records by run_id and computes inclusive start/end', async () => {
    const boards: FIUBoardEntity[] = [
      { id: 'b1', owner_id: 'u1', display_name: 'Board 1', device_eui: 'e1', group_id: 'g1' },
    ]

    const { client } = makeClient({
      selectData: [
        {
          device_id: 'b1',
          recorded_at: '2026-05-04T10:00:00.000Z',
          raw_payload: { run_id: 'r1', name: 'Trip' },
        },
        {
          device_id: 'b1',
          recorded_at: '2026-05-04T10:02:00.000Z',
          raw_payload: { run_id: 'r1', name: 'Trip' },
        },
        {
          device_id: 'b1',
          recorded_at: '2026-05-04T09:59:00.000Z',
          raw_payload: { run_id: 'r2', name: 'Earlier' },
        },
      ],
    })

    const { FIULogModel } = await import('../../src/models/FIULogModel')
    const runs = await FIULogModel.listRunsForGroup(null, boards, client)

    expect(runs).toHaveLength(2)

    const r1 = runs.find((r) => r.runId === 'r1')
    const r2 = runs.find((r) => r.runId === 'r2')

    expect(r1).toBeTruthy()
    expect(r1).toMatchObject({ name: 'Trip', boardId: 'b1', recordCount: 2 })
    expect(Date.parse(r1!.startAt)).toBe(Date.parse('2026-05-04T10:00:00.000Z'))
    expect(Date.parse(r1!.endAt)).toBe(Date.parse('2026-05-04T10:02:00.000Z'))

    expect(r2).toBeTruthy()
    expect(r2).toMatchObject({ name: 'Earlier', boardId: 'b1', recordCount: 1 })
    expect(Date.parse(r2!.startAt)).toBe(Date.parse('2026-05-04T09:59:00.000Z'))
    expect(Date.parse(r2!.endAt)).toBe(Date.parse('2026-05-04T09:59:00.000Z'))
  })

  it('fetchRunRecords synthetic uses inclusive gte/lte bounds', async () => {
    const { client, calls } = makeClient({
      selectData: [
        {
          device_id: 'b1',
          latitude: 1,
          longitude: 2,
          accuracy_meters: null,
          recorded_at: '2026-05-04T00:00:00.000Z',
        },
        {
          device_id: 'b1',
          latitude: 3,
          longitude: 4,
          accuracy_meters: null,
          recorded_at: '2026-05-04T23:59:59.999Z',
        },
      ],
    })

    const { FIULogModel } = await import('../../src/models/FIULogModel')
    const rows = await FIULogModel.fetchRunRecords('synthetic:b1:2026-05-04', 'b1', client)

    expect(calls.gte).toEqual([{ column: 'recorded_at', value: '2026-05-04T00:00:00.000Z' }])
    expect(calls.lte).toEqual([{ column: 'recorded_at', value: '2026-05-04T23:59:59.999Z' }])

    expect(rows).toHaveLength(2)
    expect(Date.parse(rows[0].recorded_at)).toBe(Date.parse('2026-05-04T00:00:00.000Z'))
    expect(Date.parse(rows[1].recorded_at)).toBe(Date.parse('2026-05-04T23:59:59.999Z'))
  })

  it('fetchRunRecords uses RPC and filters by board', async () => {
    const { client, calls } = makeClient({
      rpcDataByFn: {
        fetch_records_for_run: [
          {
            device_id: 'b1',
            latitude: 1,
            longitude: 2,
            accuracy_meters: null,
            recorded_at: '2026-05-04T10:00:00.000Z',
          },
          {
            device_id: 'b2',
            latitude: 9,
            longitude: 9,
            accuracy_meters: null,
            recorded_at: '2026-05-04T10:00:01.000Z',
          },
        ],
      },
    })

    const { FIULogModel } = await import('../../src/models/FIULogModel')
    const rows = await FIULogModel.fetchRunRecords('run_1', 'b1', client)

    expect(calls.rpc).toEqual([{ fn: 'fetch_records_for_run', args: { p_run_id: 'run_1' } }])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ device_id: 'b1', runId: 'run_1' })
  })
})
