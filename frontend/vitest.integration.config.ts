import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    setupFiles: ['./tests/integrationEnv.ts'],
    include: ['tests/**/*.integration.test.{ts,tsx}'],
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
})
