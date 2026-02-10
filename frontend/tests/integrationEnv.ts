import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import dotenv from 'dotenv'

const candidates = [
  resolve(process.cwd(), '.env.local'),
  resolve(process.cwd(), '..', '.env.local'),
]

for (const path of candidates) {
  if (existsSync(path)) {
    dotenv.config({ path, override: false, quiet: true })
  }
}
