import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import { FIUBoardModel } from '../../src/models/FIUBoardModel'
import { FIULocationRecordModel } from '../../src/models/FIULocationRecordModel'

const TEST_TIMEOUT_MS = 20_000

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY

const testEmail = process.env.SUPABASE_TEST_EMAIL
const testPassword = process.env.SUPABASE_TEST_PASSWORD

const deviceIdsCsv = process.env.SUPABASE_TEST_DEVICE_IDS
const deviceIdsFromEnv = (deviceIdsCsv ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

const requiredEnvNames = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'SUPABASE_TEST_EMAIL',
  'SUPABASE_TEST_PASSWORD',
]

const missingEnvNames = requiredEnvNames.filter((name) => {
  const value = process.env[name]
  return !(typeof value === 'string' && value.trim().length > 0)
})

const hasRequiredEnv = Boolean(
  supabaseUrl &&
    supabaseAnonKey &&
    testEmail &&
    testPassword
)

if (!hasRequiredEnv) {
  // Helpful local/CI hint without leaking any secrets.
  console.warn(
    `[supabase.integration] Skipping live tests. Missing env vars: ${missingEnvNames.join(', ')}`
  )
  console.warn(
    '[supabase.integration] Tip: put them in frontend/.env.local or repo-root .env.local, or pass them via CI secrets.'
  )
}

const suite = hasRequiredEnv ? describe : describe.skip

suite('Supabase integration (live)', () => {
  let client: SupabaseClient
  let userId: string

  beforeAll(async () => {
    client = createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    })

    const { data, error } = await client.auth.signInWithPassword({
      email: testEmail!,
      password: testPassword!,
    })

    if (error) throw error

    userId = data.user?.id ?? ''
    if (!userId) {
      const { data: userData, error: userErr } = await client.auth.getUser()
      if (userErr) throw userErr
      userId = userData.user?.id ?? ''
    }

    if (!userId) throw new Error('Integration login succeeded but user id was missing.')
  }, TEST_TIMEOUT_MS)

  afterAll(async () => {
    await client.auth.signOut()
  }, TEST_TIMEOUT_MS)

  it(
    'connects and can query the devices table',
    async () => {
      const { error } = await client.from('devices').select('id').limit(1)
      expect(error).toBeNull()
    },
    TEST_TIMEOUT_MS
  )

  it(
    'FIUBoardModel.fetchBoardsForUser works against a real Supabase project',
    async () => {
      const boards = await FIUBoardModel.fetchBoardsForUser(userId, client)
      expect(Array.isArray(boards)).toBe(true)

      for (const board of boards) {
        expect(typeof board.id).toBe('string')
      }
    },
    TEST_TIMEOUT_MS
  )

  ;(deviceIdsFromEnv.length > 0 ? it : it.skip)(
    'fetchLatestLocationsForDevices works against a real Supabase project',
    async () => {
      const locations = await FIULocationRecordModel.fetchLatestLocationsForDevices(
        deviceIdsFromEnv,
        client
      )
      expect(Array.isArray(locations)).toBe(true)

      for (const row of locations) {
        expect(deviceIdsFromEnv).toContain(row.device_id)
      }
    },
    TEST_TIMEOUT_MS
  )
})
