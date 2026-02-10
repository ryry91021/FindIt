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
  ]

  return required.every((name) => {
    const value = process.env[name]
    return typeof value === 'string' && value.trim().length > 0
  })
}

try {
  run('npm', ['run', 'lint'])
  run('npm', ['run', 'typecheck'])
  run('npm', ['test'])

  if (hasIntegrationEnv()) {
    run('npm', ['run', 'test:integration'])
  } else {
    console.log('[ci] Skipping integration tests (missing Supabase env vars).')
  }
} catch (err) {
  console.error(String(err?.message ?? err))
  process.exitCode = 1
}
