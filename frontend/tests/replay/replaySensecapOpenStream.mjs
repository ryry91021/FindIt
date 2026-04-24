import fs from 'node:fs'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import readline from 'node:readline'
import crypto from 'node:crypto'
import dotenv from 'dotenv'

function loadEnvFiles() {
  // Load local env for convenience. This keeps secrets out of git and avoids
  // needing to prefix env vars for every replay run.
  const here = fileURLToPath(new URL('.', import.meta.url))
  const candidates = [
    resolve(process.cwd(), '.env.local'),
    resolve(process.cwd(), '..', '.env.local'),
    resolve(here, '.env.local'),
    // frontend/.env.local (script lives at frontend/tests/replay)
    resolve(here, '..', '..', '.env.local'),
    // repo-root .env.local
    resolve(here, '..', '..', '..', '.env.local'),
  ]

  for (const path of candidates) {
    if (existsSync(path)) {
      dotenv.config({ path, override: false, quiet: true })
    }
  }
}

loadEnvFiles()

const LAT_ID = '4198'
const LON_ID = '4197'

function parseArgs(argv) {
  const args = {
    file: fileURLToPath(new URL('./mock_stream.ndjson', import.meta.url)),
    speed: 0,
    delayMs: null,
    onlyDeviceEui: null,
    rewriteDeviceEui: null,
    shiftToNow: true,
    timeOffsetMs: null,
    cleanup: false,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--file') args.file = argv[++i]
    else if (a === '--speed') args.speed = Number(argv[++i] ?? '0')
    else if (a === '--delay-ms') args.delayMs = Number(argv[++i] ?? '0')
    else if (a === '--only-device-eui') args.onlyDeviceEui = argv[++i]
    else if (a === '--rewrite-device-eui') {
      // Common pitfall: passing "$SUPABASE_TEST_DEVICE_EUI" when the variable
      // is not exported results in an empty string. Treat empty as "not set"
      // and fall back to dotenv-loaded process.env.
      const next = argv[++i]
      const candidate = typeof next === 'string' ? next.trim() : ''
      const fromEnv = String(process.env.SUPABASE_TEST_DEVICE_EUI ?? '').trim()
      args.rewriteDeviceEui = (candidate || fromEnv) || null
    }
    else if (a === '--no-shift-to-now') args.shiftToNow = false
    else if (a === '--time-offset-ms') args.timeOffsetMs = Number(argv[++i] ?? '0')
    else if (a === '--cleanup') args.cleanup = true
  }
  return args
}

function parseTopic(topic) {
  const parts = String(topic).split('/')
  // ['', 'device_sensor_data', orgId, deviceEui, channel, reserved, measurementId]
  if (parts.length < 7) return null
  return {
    orgId: parts[2],
    deviceEui: parts[3],
    channel: parts[4],
    measurementId: parts[6],
  }
}

function key(deviceEui, timestampMs) {
  return `${deviceEui}:${timestampMs}`
}

async function sleep(ms) {
  if (!ms || ms <= 0) return
  await new Promise((r) => setTimeout(r, ms))
}

function getFnUrl() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const webhookSecret = process.env.WEBHOOK_SECRET

  if (!supabaseUrl) throw new Error('Missing SUPABASE_URL (or VITE_SUPABASE_URL)')
  if (!webhookSecret) throw new Error('Missing WEBHOOK_SECRET')

  const fnUrl = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/lorawan-webhook`
  return { fnUrl, webhookSecret }
}

async function postLocation({ device_eui, recorded_at, latitude, longitude, run_id }) {
  const { fnUrl, webhookSecret } = getFnUrl()

  const res = await fetch(fnUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${webhookSecret}`,
    },
    body: JSON.stringify({
      device_eui,
      recorded_at,
      latitude,
      longitude,
      source: 'replay',
      run_id,
    }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Edge function returned ${res.status}: ${text}`)
  }
}

async function cleanupRun(run_id) {
  if (!run_id) return
  const { fnUrl, webhookSecret } = getFnUrl()
  const res = await fetch(fnUrl, {
    method: 'DELETE',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${webhookSecret}`,
    },
    body: JSON.stringify({ run_id }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    console.warn('[replay] cleanup failed:', res.status, text)
    console.warn('[replay] tip: redeploy the lorawan-webhook function to enable DELETE cleanup')
    return
  }

  const json = await res.json().catch(() => ({}))
  console.log('[replay] cleanup ok', json)
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const pending = new Map()

  const runId = crypto.randomUUID()
  if (args.cleanup) {
    console.log('[replay] run_id:', runId)
  }

  let firstSeenTimestampMs = null
  let computedOffsetMs = null

  const rl = readline.createInterface({
    input: fs.createReadStream(args.file),
    crlfDelay: Infinity,
  })

  let inserts = 0
  for await (const line of rl) {
    const trimmed = line.trim()
    if (!trimmed) continue

    const event = JSON.parse(trimmed)
    const topicInfo = parseTopic(event.topic)
    if (!topicInfo) continue

    if (args.onlyDeviceEui && topicInfo.deviceEui !== args.onlyDeviceEui) continue

    const timestampMsRaw = String(event?.payload?.timestamp ?? '')
    const valueStr = String(event?.payload?.value ?? '')
    const value = Number.parseFloat(valueStr)

    if (!timestampMsRaw || !Number.isFinite(value)) continue

    const rawTs = Number(timestampMsRaw)
    if (!Number.isFinite(rawTs)) continue

    if (firstSeenTimestampMs == null) firstSeenTimestampMs = rawTs
    if (computedOffsetMs == null) {
      if (Number.isFinite(args.timeOffsetMs)) {
        computedOffsetMs = args.timeOffsetMs
      } else if (args.shiftToNow) {
        computedOffsetMs = Date.now() - firstSeenTimestampMs
      } else {
        computedOffsetMs = 0
      }
      if (computedOffsetMs !== 0) {
        console.log('[replay] applying time offset (ms):', computedOffsetMs)
      }
    }

    const adjustedTs = rawTs + computedOffsetMs
    const timestampMs = String(adjustedTs)

    const k = key(topicInfo.deviceEui, timestampMs)
    const current = pending.get(k) ?? { deviceEui: topicInfo.deviceEui, timestampMs }

    if (topicInfo.measurementId === LAT_ID) current.lat = value
    if (topicInfo.measurementId === LON_ID) current.lon = value

    pending.set(k, current)

    if (current.lat != null && current.lon != null) {
      const recorded_at = new Date(Number(timestampMs)).toISOString()
      await postLocation({
        device_eui: args.rewriteDeviceEui ?? current.deviceEui,
        recorded_at,
        latitude: current.lat,
        longitude: current.lon,
        run_id: runId,
      })
      inserts++
      console.log(`[replay] inserted #${inserts}`, { device_eui: current.deviceEui, recorded_at })
      pending.delete(k)

      if (Number.isFinite(args.delayMs) && args.delayMs != null && args.delayMs > 0) {
        await sleep(args.delayMs)
      } else if (args.speed > 0) {
        await sleep(1000 / args.speed)
      }
    }
  }

  console.log(`[replay] done, inserts=${inserts}`)

  if (args.cleanup) {
    await cleanupRun(runId)
  }
}

main().catch((err) => {
  console.error('[replay] failed', err)
  process.exitCode = 1
})
