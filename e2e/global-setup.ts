import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

export default async function startE2eServer(): Promise<
  void | (() => Promise<void>)
> {
  if (process.env.SRLW_E2E_EXISTING_SERVER === '1') return

  const server = await createServer({
    root: fileURLToPath(new URL('../apps/web/', import.meta.url)),
    logLevel: 'warn',
    server: {
      host: '127.0.0.1',
      port: 4173,
      strictPort: true,
    },
  })

  await server.listen()
  return async () => {
    await server.close()
  }
}
