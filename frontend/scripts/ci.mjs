import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import dotenv from 'dotenv'

function loadEnvFiles() {
  // GitHub Actions will typically provide secrets via `env:`.
  // Locally, it’s common to keep these in `.env.local`.
  const candidates = [
    resolve(process.cwd(), '.env.local'),
    resolve(process.cwd(), '..', '.env.local'),
  ]

  for (const path of candidates) {
    if (existsSync(path)) {
      dotenv.config({ path, override: false, quiet: true })
    }
  }
}

loadEnvFiles()

function run(command, args) {
  const pretty = [command, ...args].join(' ')
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })

  if (result.status !== 0) {
    throw new Error(`Command failed (${result.status}): ${pretty}`)
  }
}

function hasIntegrationEnv() {
  const required = [
    'VITE_SUPABASE_URL',
    'VITE_SUPABASE_ANON_KEY',
    'SUPABASE_TEST_EMAIL',
    'SUPABASE_TEST_PASSWORD',
    'WEBHOOK_SECRET',
    'SUPABASE_TEST_DEVICE_EUI',
  ]

  return required.every((name) => {
    const value = process.env[name]
    return typeof value === 'string' && value.trim().length > 0
  })
}

function getMissingIntegrationEnvNames() {
  const required = [
    'VITE_SUPABASE_URL',
    'VITE_SUPABASE_ANON_KEY',
    'SUPABASE_TEST_EMAIL',
    'SUPABASE_TEST_PASSWORD',
    'WEBHOOK_SECRET',
    'SUPABASE_TEST_DEVICE_EUI',
  ]

  return required.filter((name) => {
    const value = process.env[name]
    return !(typeof value === 'string' && value.trim().length > 0)
  })
}

function hasReplayEnv() {
  const required = ['VITE_SUPABASE_URL', 'WEBHOOK_SECRET', 'SUPABASE_TEST_DEVICE_EUI']
  return required.every((name) => {
    const value = process.env[name]
    return typeof value === 'string' && value.trim().length > 0
  })
}

function getMissingReplayEnvNames() {
  const required = ['VITE_SUPABASE_URL', 'WEBHOOK_SECRET', 'SUPABASE_TEST_DEVICE_EUI']
  return required.filter((name) => {
    const value = process.env[name]
    return !(typeof value === 'string' && value.trim().length > 0)
  })
}

function isExplicitlyDisabledEnvValue(v) {
  return typeof v === 'string' && (v.trim() === '' || v === '0' || v.toLowerCase() === 'false')
}

function shouldRunReplaySmoke() {
  // Default behavior:
  // - If RUN_TRACKING_REPLAY_SMOKE is set: respect it (0/false disables).
  // - Otherwise: auto-enable when replay env vars exist (common for local dev)
  //   or when running in CI.
  const v = process.env.RUN_TRACKING_REPLAY_SMOKE

  if (typeof v === 'string') {
    if (isExplicitlyDisabledEnvValue(v)) return false
    return true
  }

  const isCi = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true'
  return isCi || hasReplayEnv()
}

try {
  run('npm', ['run', 'lint'])
  run('npm', ['run', 'typecheck'])
  run('npm', ['test'])

  if (hasIntegrationEnv()) {
    run('npm', ['run', 'test:integration'])
  } else {
    const missing = getMissingIntegrationEnvNames()
    console.log(`[ci] Skipping integration tests (missing env vars: ${missing.join(', ')}).`)
  }

  if (!shouldRunReplaySmoke()) {
    console.log('[ci] Skipping tracking replay smoke (disabled via RUN_TRACKING_REPLAY_SMOKE=0).')
  } else if (!hasReplayEnv()) {
    const missing = getMissingReplayEnvNames()
    console.log(`[ci] Skipping tracking replay smoke (missing env vars: ${missing.join(', ')}).`)
  } else {
    const mode = typeof process.env.RUN_TRACKING_REPLAY_SMOKE === 'string' ? 'explicit' : 'auto'
    console.log(`[ci] Running tracking replay smoke (SenseCAP, ${mode}).`)
    const deviceEui = process.env.SUPABASE_TEST_DEVICE_EUI
    run('node', [
      'tests/replay/replaySensecapOpenStream.mjs',
      '--speed',
      '2',
      '--rewrite-device-eui',
      String(deviceEui ?? ''),
      '--cleanup',
    ])
  }
} catch (err) {
  console.error(String(err?.message ?? err))
  process.exitCode = 1
}
