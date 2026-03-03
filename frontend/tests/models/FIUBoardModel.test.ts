import { describe, expect, it, vi } from 'vitest'

/**
 * Minimal query builder mock that supports the subset of Supabase methods used by FIUBoardModel.
 * We route responses by table name and the last filter call.
 */
function makeClient(responses: {
  devices_accessible?: unknown[]
  group_members?: unknown[]
  groups?: unknown[]
  device_members?: unknown[]
  shared_devices?: unknown[]
  group_devices?: unknown[]
}) {
  const from = vi.fn((table: string) => {
    const state: { table: string; filter?: { op: 'eq' | 'in'; col: string; val: unknown } } = {
      table,
    }

    const builder: any = {
      select: vi.fn(() => builder),
      order: vi.fn(() => Promise.resolve({ data: pick(state), error: null })),
      eq: vi.fn((col: string, val: unknown) => {
        state.filter = { op: 'eq', col, val }
        return Promise.resolve({ data: pick(state), error: null })
      }),
      in: vi.fn((col: string, val: unknown) => {
        state.filter = { op: 'in', col, val }
        return Promise.resolve({ data: pick(state), error: null })
      }),
    }

    function pick(s: typeof state) {
      if (s.table === 'group_members') return responses.group_members ?? []
      if (s.table === 'groups') return responses.groups ?? []
      if (s.table === 'device_members') return responses.device_members ?? []
      if (s.table === 'devices') {
        if (!s.filter) return responses.devices_accessible ?? []
        if (s.filter?.op === 'in' && s.filter.col === 'id') return responses.shared_devices ?? []
        if (s.filter?.op === 'in' && s.filter.col === 'group_id') return responses.group_devices ?? []
      }
      return []
    }

    return builder
  })

  return { from } as any
}

describe('FIUBoardModel.fetchBoardsForUser', () => {
  it('includes owned + shared + group devices and de-dupes by id', async () => {
    const client = makeClient({
      devices_accessible: [{ id: 'd1', display_name: 'Owned' }],
      group_members: [{ group_id: 'g1' }],
      groups: [],
      device_members: [{ device_id: 'd2' }],
      shared_devices: [{ id: 'd2', display_name: 'Shared' }],
      group_devices: [
        { id: 'd3', display_name: 'Group' },
        { id: 'd2', display_name: 'Shared (dup)' },
      ],
    })

    const { FIUBoardModel } = await import('../../src/models/FIUBoardModel')
    const boards = await FIUBoardModel.fetchBoardsForUser('user-1', client)

    const ids = boards.map((b) => b.id).sort()
    expect(ids).toEqual(['d1', 'd2', 'd3'])
  })

  it('queries groups created_by in addition to group_members', async () => {
    const client = makeClient({
      devices_accessible: [],
      group_members: [],
      groups: [{ id: 'g-owned' }],
      device_members: [],
      group_devices: [{ id: 'd10', display_name: 'From owned group' }],
    })

    const { FIUBoardModel } = await import('../../src/models/FIUBoardModel')
    const boards = await FIUBoardModel.fetchBoardsForUser('user-1', client)

    expect(boards.map((b) => b.id)).toEqual(['d10'])
  })
})
