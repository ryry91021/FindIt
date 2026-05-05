import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

function makeRunId(): string {
  return `it_playback_${Date.now()}_${Math.random().toString(16).slice(2)}`
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
    `[playback.integration] Skipping live playback test. Missing env vars: ${missingEnvNames.join(', ')}`
  )
}

const suite = hasRequiredEnv ? describe : describe.skip

function getErrorMessage(value: unknown): string {
  if (value instanceof Error) return value.message

  if (value && typeof value === 'object') {
    const maybe = value as { message?: unknown }
    if (typeof maybe.message === 'string') return maybe.message
  }

  return String(value)
}

function isRlsOrPermissionError(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const err = value as { code?: unknown; message?: unknown; details?: unknown }
  if (err.code === '42501') return true
  const text = `${String(err.message ?? '')} ${String(err.details ?? '')}`.toLowerCase()
  return text.includes('row level security') || text.includes('permission denied')
}

async function waitFor<T>(
  fn: () => Promise<T>,
  predicate: (value: T) => boolean,
  opts: { timeoutMs: number; intervalMs: number; label: string }
): Promise<T> {
  const start = Date.now()
  let last: unknown

  while (Date.now() - start < opts.timeoutMs) {
    try {
      const value = await fn()
      if (predicate(value)) return value
      last = value
    } catch (err) {
      last = err
    }

    await new Promise((r) => setTimeout(r, opts.intervalMs))
  }

  throw new Error(
    `[playback.integration] Timed out waiting for ${opts.label}. Last: ${getErrorMessage(last)}`
  )
}

suite('Playback integration (live)', () => {
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
    'creates a log run and playback returns records within start/end inclusive, and run listing works via group',
    async () => {
      const { data: deviceRow, error: deviceErr } = await client
        .from('devices')
        .select('id, group_id, display_name')
        .eq('device_eui', testDeviceEui)
        .maybeSingle()

      if (deviceErr) throw deviceErr
      if (!deviceRow?.id) {
        throw new Error(
          `Test device not found/visible. Ensure devices.device_eui='${testDeviceEui}' exists and is visible to the test user.`
        )
      }

      const originalGroupId = deviceRow.group_id
      let groupId: string | null = originalGroupId
      let createdGroupId: string | null = null

      if (!groupId) {
        const { data: userData, error: userErr } = await client.auth.getUser()
        if (userErr) throw userErr
        const userId = userData.user?.id
        if (!userId) throw new Error('[playback.integration] No authenticated user id available.')

        const name = `it_playback_${new Date().toISOString()}`
        const insertVariants: Array<Record<string, unknown>> = [
          { name, created_by: userId },
          { id: crypto.randomUUID(), name, created_by: userId },
          { name },
        ]

        let lastInsertError: unknown = null
        for (const payload of insertVariants) {
          const { data, error } = await client.from('groups').insert(payload).select('id').single()
          if (!error && data) {
            createdGroupId = (data as { id?: string | null }).id ?? null
            break
          }
          lastInsertError = error
        }

        if (!createdGroupId) {
          throw new Error(
            `[playback.integration] Unable to create temp group for device assignment: ${getErrorMessage(lastInsertError)}`
          )
        }

        const { error: memberErr } = await client
          .from('group_members')
          .upsert({ group_id: createdGroupId, user_id: userId }, { onConflict: 'group_id,user_id' })

        if (memberErr) {
          throw new Error(
            `[playback.integration] Unable to create temp group membership: ${getErrorMessage(memberErr)}`
          )
        }

        const { error: assignErr } = await client
          .from('devices')
          .update({ group_id: createdGroupId })
          .eq('id', deviceRow.id)

        if (assignErr) {
          throw new Error(
            `[playback.integration] Unable to assign temp group_id to device: ${getErrorMessage(assignErr)}`
          )
        }

        groupId = createdGroupId
      }

      // Reuse latest visible coordinates so we don't teleport a board.
      const { data: latestRow } = await client
        .from('location_logs')
        .select('latitude, longitude')
        .eq('device_id', deviceRow.id)
        .order('recorded_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      const latitude =
        typeof latestRow?.latitude === 'number' && Number.isFinite(latestRow.latitude)
          ? latestRow.latitude
          : 40.745
      const longitude =
        typeof latestRow?.longitude === 'number' && Number.isFinite(latestRow.longitude)
          ? latestRow.longitude
          : -74.025

      const runId = makeRunId()
      const t1 = new Date(Date.now() - 2000).toISOString()
      const t2 = new Date(Date.now() - 1000).toISOString()
      const t3 = new Date(Date.now()).toISOString()

      const fnUrl = `${supabaseUrl!.replace(/\/$/, '')}/functions/v1/lorawan-webhook`

      const post = async (recorded_at: string) => {
        const res = await fetch(fnUrl, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${webhookSecret}`,
          },
          body: JSON.stringify({
            device_eui: testDeviceEui,
            recorded_at,
            latitude,
            longitude,
            source: 'playback-integration-test',
            run_id: runId,
          }),
        })

        if (!res.ok) {
          const text = await res.text().catch(() => '')
          throw new Error(`Edge function returned ${res.status}: ${text}`)
        }
      }

      try {
        // Send out-of-order to ensure DB ordering is correct.
        await post(t2)
        await post(t1)
        await post(t3)

        const records = await waitFor(
          async () => {
            const { data, error } = await client.rpc('fetch_records_for_run', { p_run_id: runId })
            if (error) throw error
            return (data ?? []) as Array<{ device_id?: string | null; recorded_at?: string | null }>
          },
          (rows) => rows.length >= 3,
          { timeoutMs: 12_000, intervalMs: 300, label: 'records for run' }
        )

        expect(records.every((r) => r.device_id === deviceRow.id)).toBe(true)
        const ordered = [...records].sort(
          (a, b) => Date.parse(String(a.recorded_at)) - Date.parse(String(b.recorded_at))
        )

        expect(Date.parse(String(ordered[0].recorded_at))).toBe(Date.parse(t1))
        expect(Date.parse(String(ordered[ordered.length - 1].recorded_at))).toBe(Date.parse(t3))

        // Explicitly verify logs_metadata was created/updated for this run.
        // If direct selects are blocked by RLS, we still validate via SECURITY DEFINER RPC below.
        const metadata = await waitFor(
          async () => {
            const { data, error } = await client
              .from('logs_metadata')
              .select('run_id, board_id, start_at, end_at, record_count')
              .eq('run_id', runId)
              .maybeSingle()

            if (error) {
              if (isRlsOrPermissionError(error)) return null
              throw error
            }

            return data as
              | {
                  run_id?: string | null
                  board_id?: string | null
                  start_at?: string | null
                  end_at?: string | null
                  record_count?: number | null
                }
              | null
          },
          (row) => row === null || Number(row.record_count ?? 0) >= 3,
          { timeoutMs: 12_000, intervalMs: 300, label: 'logs_metadata for run' }
        )

        if (metadata) {
          expect(metadata.run_id).toBe(runId)
          expect(metadata.board_id).toBe(deviceRow.id)
          expect(Number(metadata.record_count ?? 0)).toBe(3)
          expect(Date.parse(String(metadata.start_at))).toBe(Date.parse(t1))
          expect(Date.parse(String(metadata.end_at))).toBe(Date.parse(t3))
        }

        const runs = await waitFor(
          async () => {
            const { data, error } = await client.rpc('fetch_runs_for_group', { p_group_id: groupId })
            if (error) throw error
            return (data ?? []) as Array<{
              run_id?: string | null
              board_id?: string | null
              start_at?: string | null
              end_at?: string | null
              record_count?: number | null
            }>
          },
          (rows) => rows.some((r) => r.run_id === runId),
          { timeoutMs: 12_000, intervalMs: 300, label: 'run appears in group listing' }
        )

        const run = runs.find((r) => r.run_id === runId)
        expect(run).toBeTruthy()
        expect(run?.board_id).toBe(deviceRow.id)
        expect(Number(run?.record_count ?? 0)).toBe(3)
        expect(Date.parse(String(run?.start_at))).toBe(Date.parse(t1))
        expect(Date.parse(String(run?.end_at))).toBe(Date.parse(t3))
      } finally {
        // Cleanup via service-role edge function.
        const cleanupRes = await fetch(fnUrl, {
          method: 'DELETE',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${webhookSecret}`,
          },
          body: JSON.stringify({ run_id: runId }),
        }).catch((err) => {
          console.warn('[playback.integration] cleanup failed:', String(err?.message ?? err))
          return null
        })

        if (cleanupRes && !cleanupRes.ok) {
          const text = await cleanupRes.text().catch(() => '')
          console.warn('[playback.integration] cleanup skipped/failed:', cleanupRes.status, text)
        }

        if (createdGroupId) {
          const { error: restoreErr } = await client
            .from('devices')
            .update({ group_id: originalGroupId })
            .eq('id', deviceRow.id)

          if (restoreErr) {
            console.warn('[playback.integration] restore device group_id failed:', getErrorMessage(restoreErr))
          }

          const { error: memberDelErr } = await client
            .from('group_members')
            .delete()
            .eq('group_id', createdGroupId)

          if (memberDelErr) {
            console.warn('[playback.integration] delete temp membership failed:', getErrorMessage(memberDelErr))
          }

          const { error: groupDelErr } = await client.from('groups').delete().eq('id', createdGroupId)

          if (groupDelErr) {
            console.warn('[playback.integration] delete temp group failed:', getErrorMessage(groupDelErr))
          }
        }
      }
    },
    TEST_TIMEOUT_MS
  )
})
