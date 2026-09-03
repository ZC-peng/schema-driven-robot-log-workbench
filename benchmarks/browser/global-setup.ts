import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

export default async function startBenchmarkServer(): Promise<
  void | (() => Promise<void>)
> {
  if (process.env.SRLW_BENCH_EXISTING_SERVER === '1') return

  const baseURL = new URL(
    process.env.SRLW_BENCH_BASE_URL ?? 'http://127.0.0.1:4173',
  )
  const port = Number(baseURL.port || '80')
  const server = await createServer({
    root: fileURLToPath(new URL('../../apps/web/', import.meta.url)),
    logLevel: 'warn',
    server: {
      host: baseURL.hostname,
      port,
      strictPort: true,
    },
  })

  await server.listen()
  return async () => {
    await server.close()
  }
}
