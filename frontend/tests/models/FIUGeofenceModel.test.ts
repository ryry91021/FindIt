import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

type SupabaseError = { message?: string } | null

type InsertResponse = Promise<{ error: SupabaseError }>

type SelectResponse<T> = Promise<{ data: T; error: SupabaseError }>

type UpdateEqResponse = Promise<{ error: SupabaseError }>

type UpdateBuilder = {
  eq: (column: string, value: unknown) => UpdateEqResponse
}

type QueryBuilder<T> = {
  select: (columns: string) => QueryBuilder<T>
  eq: (column: string, value: unknown) => QueryBuilder<T> | SelectResponse<T>
  order: (column: string, opts: { ascending: boolean }) => SelectResponse<T>
  insert: (payload: unknown) => InsertResponse
  update: (patch: unknown) => UpdateBuilder
}

function makeClient(opts: {
  selectData?: unknown[]
  insertErrors?: SupabaseError[]
  updateErrors?: SupabaseError[]
}) {
  const selectData = opts.selectData ?? []
  const insertErrors = [...(opts.insertErrors ?? [null])]
  const updateErrors = [...(opts.updateErrors ?? [null])]

  const calls = {
    eq: [] as Array<{ column: string; value: unknown }>,
    insert: [] as unknown[],
    update: [] as unknown[],
    updateEq: [] as Array<{ column: string; value: unknown }>,
  }

  const from = vi.fn((table: string) => {
    void table

    const builder: QueryBuilder<unknown[]> = {
      select: () => builder,
      eq: (column: string, value: unknown) => {
        calls.eq.push({ column, value })
        return builder
      },
      order: () => {
        return Promise.resolve({ data: selectData, error: null })
      },
      insert: (payload: unknown) => {
        calls.insert.push(payload)
        const err = insertErrors.shift() ?? null
        return Promise.resolve({ error: err })
      },
      update: (patch: unknown) => {
        calls.update.push(patch)
        return {
          eq: (column: string, value: unknown) => {
            calls.updateEq.push({ column, value })
            const err = updateErrors.shift() ?? null
            return Promise.resolve({ error: err })
          },
        }
      },
    }

    return builder
  })

  return {
    client: { from } as unknown as SupabaseClient,
    calls,
  }
}

describe('FIUGeofenceModel', () => {
  it('fetchGeofencesForUser returns rows (RLS-filtered) and does not require owner_id filter', async () => {
    const { client, calls } = makeClient({
      selectData: [
        { id: 'g1', owner_id: 'u1', name: 'Home', center_lat: 1, center_lon: 2, radius_meters: 50 },
      ],
    })

    const { FIUGeofenceModel } = await import('../../src/models/FIUGeofenceModel')
    const rows = await FIUGeofenceModel.fetchGeofencesForUser('u1', client)

    expect(rows).toHaveLength(1)
    expect(calls.eq).toEqual([])
  })

  it('createGeofence inserts with enabled when supported', async () => {
    const { client, calls } = makeClient({ insertErrors: [null] })

    const { FIUGeofenceModel } = await import('../../src/models/FIUGeofenceModel')
    await FIUGeofenceModel.createGeofence(
      { name: 'Test', center_lat: 1, center_lon: 2, radius_meters: 123, enabled: true },
      'u1',
      client
    )

    expect(calls.insert).toHaveLength(1)
    expect(calls.insert[0]).toMatchObject({
      owner_id: 'u1',
      name: 'Test',
      center_lat: 1,
      center_lon: 2,
      radius_meters: 123,
      enabled: true,
    })
  })

  it('createGeofence falls back if enabled column is missing', async () => {
    const { client, calls } = makeClient({
      insertErrors: [{ message: 'column "enabled" of relation "geofences" does not exist' }, null],
    })

    const { FIUGeofenceModel } = await import('../../src/models/FIUGeofenceModel')
    await FIUGeofenceModel.createGeofence(
      { name: 'Test', center_lat: 1, center_lon: 2, radius_meters: 123, enabled: true },
      'u1',
      client
    )

    expect(calls.insert).toHaveLength(2)
    expect(calls.insert[0]).toMatchObject({ enabled: true })
    expect(calls.insert[1]).not.toMatchObject({ enabled: true })
  })

  it('updateGeofence throws a clear error when toggling enabled but column is missing', async () => {
    const { client } = makeClient({
      updateErrors: [{ message: 'column "enabled" does not exist' }],
    })

    const { FIUGeofenceModel } = await import('../../src/models/FIUGeofenceModel')

    await expect(FIUGeofenceModel.updateGeofence('g1', { enabled: false }, client)).rejects.toThrow(
      /geofences\.enabled/i
    )
  })

  it('updateGeofence retries without enabled when other fields are present', async () => {
    const { client, calls } = makeClient({
      updateErrors: [
        { message: 'column "enabled" does not exist' },
        null, // fallback succeeds
      ],
    })

    const { FIUGeofenceModel } = await import('../../src/models/FIUGeofenceModel')
    await FIUGeofenceModel.updateGeofence('g1', { name: 'Next', enabled: false }, client)

    expect(calls.update).toHaveLength(2)
    expect(calls.update[0]).toMatchObject({ name: 'Next', enabled: false })
    expect(calls.update[1]).toMatchObject({ name: 'Next' })
    expect(calls.update[1]).not.toMatchObject({ enabled: false })
  })
})
