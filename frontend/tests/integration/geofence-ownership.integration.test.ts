import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const TEST_TIMEOUT_MS = 20_000

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY

const testEmail = process.env.SUPABASE_TEST_EMAIL
const testPassword = process.env.SUPABASE_TEST_PASSWORD

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

const hasRequiredEnv = Boolean(supabaseUrl && supabaseAnonKey && testEmail && testPassword)

if (!hasRequiredEnv) {
  console.warn(
    `[geofence-ownership.integration] Skipping live geofence test. Missing env vars: ${missingEnvNames.join(', ')}`
  )
}

const suite = hasRequiredEnv ? describe : describe.skip

suite('Geofence ownership integration (live)', () => {
  let client: SupabaseClient
  let userId: string
  let createdGeofenceId: string | null = null

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
    try {
      if (createdGeofenceId) {
        await client.from('geofences').delete().eq('id', createdGeofenceId)
      }
    } finally {
      await client.auth.signOut()
    }
  }, TEST_TIMEOUT_MS)

  it(
    'allows insert when owner_id = auth.uid() and rejects mismatched owner_id',
    async () => {
      const name = `it_geofence_${Date.now()}`

      const { data: inserted, error: insertErr } = await client
        .from('geofences')
        .insert({
          owner_id: userId,
          name,
          center_lat: 40.745,
          center_lon: -74.025,
          radius_meters: 25,
        })
        .select('id, owner_id')
        .maybeSingle()

      if (insertErr) throw insertErr
      expect(inserted?.id).toBeTruthy()
      expect(inserted?.owner_id).toBe(userId)

      createdGeofenceId = inserted?.id ?? null

      const { error: badOwnerErr } = await client.from('geofences').insert({
        owner_id: '00000000-0000-0000-0000-000000000000',
        name: `${name}_bad_owner`,
        center_lat: 40.745,
        center_lon: -74.025,
        radius_meters: 25,
      })

      expect(badOwnerErr).not.toBeNull()
    },
    TEST_TIMEOUT_MS
  )

  it(
    'does not allow unauthenticated reads of geofences',
    async () => {
      const anon = createClient(supabaseUrl!, supabaseAnonKey!, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      })

      const { data, error } = await anon.from('geofences').select('id').limit(1)

      // Depending on PostgREST/RLS behavior, this may be an error OR an empty list.
      expect((data ?? []).length).toBe(0)
      if (error) {
        expect(typeof error.message).toBe('string')
      }
    },
    TEST_TIMEOUT_MS
  )
})
