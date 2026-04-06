import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

function makeRunId(): string {
  // Avoid importing node:crypto in test env; this is unique enough for cleanup tagging.
  return `it_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

const TEST_TIMEOUT_MS = 20_000

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY

const testEmail = process.env.SUPABASE_TEST_EMAIL
const testPassword = process.env.SUPABASE_TEST_PASSWORD

const webhookSecret = process.env.WEBHOOK_SECRET
const testDeviceEui = process.env.SUPABASE_TEST_DEVICE_EUI

const requiredEnvNames = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'SUPABASE_TEST_EMAIL',
  'SUPABASE_TEST_PASSWORD',
  'WEBHOOK_SECRET',
  'SUPABASE_TEST_DEVICE_EUI',
]

const missingEnvNames = requiredEnvNames.filter((name) => {
  const value = process.env[name]
  return !(typeof value === 'string' && value.trim().length > 0)
})

const hasRequiredEnv = Boolean(
  supabaseUrl &&
    supabaseAnonKey &&
    testEmail &&
    testPassword &&
    webhookSecret &&
    testDeviceEui
)

if (!hasRequiredEnv) {
  console.warn(
    `[tracking.integration] Skipping live tracking test. Missing env vars: ${missingEnvNames.join(', ')}`
  )
}

const suite = hasRequiredEnv ? describe : describe.skip

suite('Tracking integration (live)', () => {
  let client: SupabaseClient

  beforeAll(async () => {
    client = createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    })

    const { error } = await client.auth.signInWithPassword({
      email: testEmail!,
      password: testPassword!,
    })

    if (error) throw error
  }, TEST_TIMEOUT_MS)

  afterAll(async () => {
    await client.auth.signOut()
  }, TEST_TIMEOUT_MS)

  it(
    'edge function inserts a location_logs row for a known device_eui',
    async () => {
      // Lookup the device id via RLS-visible query.
      const { data: deviceRow, error: deviceErr } = await client
        .from('devices')
        .select('id')
        .eq('device_eui', testDeviceEui)
        .maybeSingle()

      if (deviceErr) throw deviceErr
      if (!deviceRow?.id) {
        throw new Error(
          `Test device not found/visible. Ensure devices.device_eui='${testDeviceEui}' exists and is visible to the test user.`
        )
      }

      // Use the latest visible coordinates if possible, so running this test
      // doesn't visually "teleport" a real board in the live UI via Realtime.
      const { data: latestRow } = await client
        .from('location_logs')
        .select('latitude, longitude')
        .eq('device_id', deviceRow.id)
        .order('recorded_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      const recordedAt = new Date().toISOString()
      const latitude =
        typeof latestRow?.latitude === 'number' && Number.isFinite(latestRow.latitude)
          ? latestRow.latitude
          : 40.745
      const longitude =
        typeof latestRow?.longitude === 'number' && Number.isFinite(latestRow.longitude)
          ? latestRow.longitude
          : -74.025

      const fnUrl = `${supabaseUrl!.replace(/\/$/, '')}/functions/v1/lorawan-webhook`
      const runId = makeRunId()

      try {
        const res = await fetch(fnUrl, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${webhookSecret}`,
          },
          body: JSON.stringify({
            device_eui: testDeviceEui,
            recorded_at: recordedAt,
            latitude,
            longitude,
            source: 'integration-test',
            run_id: runId,
          }),
        })

        if (!res.ok) {
          const text = await res.text().catch(() => '')
          throw new Error(`Edge function returned ${res.status}: ${text}`)
        }

        // Verify the row is visible to the signed-in user.
        const { data: rows, error: logErr } = await client
          .from('location_logs')
          .select('device_id, recorded_at, latitude, longitude')
          .eq('device_id', deviceRow.id)
          .eq('recorded_at', recordedAt)
          .limit(1)

        if (logErr) throw logErr

        expect(rows?.length).toBe(1)
        expect(rows?.[0]?.device_id).toBe(deviceRow.id)
        // Postgres may serialize timestamptz as '+00:00' instead of 'Z'.
        expect(Date.parse(rows?.[0]?.recorded_at ?? '')).toBe(Date.parse(recordedAt))
        expect(rows?.[0]?.latitude).toBe(latitude)
        expect(rows?.[0]?.longitude).toBe(longitude)
      } finally {
        // Cleanup via service-role edge function so we don't depend on RLS allowing deletes.
        try {
          const cleanupRes = await fetch(fnUrl, {
            method: 'DELETE',
            headers: {
              'content-type': 'application/json',
              authorization: `Bearer ${webhookSecret}`,
            },
            body: JSON.stringify({ run_id: runId }),
          })

          if (!cleanupRes.ok) {
            const text = await cleanupRes.text().catch(() => '')
            console.warn('[tracking.integration] cleanup skipped/failed:', cleanupRes.status, text)

            // Fallback: best-effort delete of just the row we inserted.
            const { error: fallbackErr } = await client
              .from('location_logs')
              .delete()
              .eq('device_id', deviceRow.id)
              .eq('recorded_at', recordedAt)

            if (fallbackErr) {
              console.warn('[tracking.integration] fallback cleanup failed:', fallbackErr.message)
            }
          }
        } catch (err) {
          console.warn('[tracking.integration] cleanup skipped/failed:', String(err?.message ?? err))

          const { error: fallbackErr } = await client
            .from('location_logs')
            .delete()
            .eq('device_id', deviceRow.id)
            .eq('recorded_at', recordedAt)

          if (fallbackErr) {
            console.warn('[tracking.integration] fallback cleanup failed:', fallbackErr.message)
          }
        }
      }
    },
    TEST_TIMEOUT_MS
  )
})
