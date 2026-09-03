import { defineConfig, devices } from '@playwright/test'
import { fileURLToPath } from 'node:url'

const baseURL = process.env.SRLW_TAB_AB_BASE_URL ?? 'http://127.0.0.1:4317'
const useExistingServer = process.env.SRLW_TAB_AB_EXISTING_SERVER === '1'
const browserChannel = process.env.SRLW_TAB_AB_BROWSER_CHANNEL ?? 'chrome'
const parsedBaseURL = new URL(baseURL)
const selfStartedHost = parsedBaseURL.hostname
const selfStartedPort = parsedBaseURL.port || '80'

if (
  !useExistingServer &&
  (parsedBaseURL.protocol !== 'http:' ||
    !['127.0.0.1', 'localhost'].includes(selfStartedHost) ||
    !/^\d+$/.test(selfStartedPort))
) {
  throw new Error(
    'A self-started A/B benchmark server requires a local HTTP base URL with a numeric port',
  )
}

export default defineConfig({
  testDir: fileURLToPath(new URL('.', import.meta.url)),
  testMatch: 'run.ab.spec.ts',
  outputDir: fileURLToPath(new URL('./test-results/', import.meta.url)),
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  globalSetup: fileURLToPath(new URL('./global-setup.ts', import.meta.url)),
  timeout: 30 * 60 * 1_000,
  expect: { timeout: 120_000 },
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
    channel: browserChannel,
    headless: true,
    viewport: { width: 1_440, height: 1_000 },
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
})
