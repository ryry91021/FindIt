import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

type MaybeSingleResponse<T> = Promise<{ data: T | null; error: unknown | null }>

type InsertResponse = Promise<{ data: unknown; error: unknown | null }>

type QueryBuilder = {
  select: (columns: string) => QueryBuilder
  eq: (column: string, value: unknown) => QueryBuilder
  maybeSingle: () => MaybeSingleResponse<unknown>
  insert: (payload: unknown) => InsertResponse
}

function makeClient(opts: {
  existingMembership?: boolean
  pendingRequest?: boolean
  insertError?: { code?: string; message?: string; details?: string } | null
}) {
  const from = vi.fn((table: string) => {
    const state = {
      table,
      filters: [] as Array<{ col: string; val: unknown }>,
      select: '',
    }

    const builder: QueryBuilder = {
      select: (columns: string) => {
        state.select = columns
        return builder
      },
      eq: (col: string, val: unknown) => {
        state.filters.push({ col, val })
        return builder
      },
      maybeSingle: async () => {
        if (state.table === 'group_members') {
          return { data: opts.existingMembership ? { group_id: 'g1' } : null, error: null }
        }

        if (state.table === 'group_join_requests') {
          // This is the pending-request lookup path (select + maybeSingle)
          return { data: opts.pendingRequest ? { id: 'r1' } : null, error: null }
        }

        return { data: null, error: null }
      },
      insert: async (_payload: unknown) => {
        return { data: null, error: opts.insertError ?? null }
      },
    }

    return builder
  })

  return { from } as unknown as SupabaseClient
}

describe('FIUGroupModel.requestJoinGroup', () => {
  it('creates a join request without selecting groups (works under strict RLS)', async () => {
    const client = makeClient({ existingMembership: false, pendingRequest: false, insertError: null })

    const { FIUGroupModel } = await import('../../src/models/FIUGroupModel')

    await expect(FIUGroupModel.requestJoinGroup('group-uuid', 'user-uuid', client)).resolves.toBeUndefined()

    // Ensure we never tried to read from the `groups` table.
    const calls = (client.from as unknown as ReturnType<typeof vi.fn>).mock.calls
    expect(calls.map((c) => c[0])).not.toContain('groups')
  })

  it('maps FK violation to "Group UUID not found."', async () => {
    const client = makeClient({
      existingMembership: false,
      pendingRequest: false,
      insertError: { code: '23503', message: 'insert or update on table violates foreign key constraint' },
    })

    const { FIUGroupModel } = await import('../../src/models/FIUGroupModel')

    await expect(FIUGroupModel.requestJoinGroup('missing-uuid', 'user-uuid', client)).rejects.toThrow(
      'Group UUID not found.'
    )
  })
})
