// @vitest-environment happy-dom

import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { loadAppCatalog } from '../src/app/catalog'
import { useWorkspaceStore } from '../src/stores/workspace'

describe('workspace integration', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('loads the real synthetic catalog and parses the bundled demo end to end', async () => {
    const store = useWorkspaceStore()
    store.initializeCatalog(await loadAppCatalog())

    const outcome = await store.loadSyntheticDemo()
    const session = outcome.sessionId ? store.sessions[outcome.sessionId] : undefined

    expect(outcome.error).toBeUndefined()
    expect(session?.status).toBe('ready')
    expect(session?.summary).toMatchObject({
      totalLines: 12,
      targetLines: 8,
      translated: 5,
      unknown: 1,
      malformed: 2,
    })
    expect(session?.parsedCommands.map((command) => command.rawLineIndex)).toEqual([
      1, 3, 4, 5, 6, 7, 9, 10,
    ])
    expect(session?.parsedCommands[0]?.processType).toBe('single')
  })

  it('deduplicates equal file content and activates the existing session', async () => {
    const store = useWorkspaceStore()
    store.initializeCatalog(await loadAppCatalog())

    const first = await store.loadSyntheticDemo()
    const second = await store.loadSyntheticDemo()

    expect(first.sessionId).toBe(second.sessionId)
    expect(second.duplicate).toBe(true)
    expect(store.sessionOrder).toHaveLength(1)
  })

  it('keeps parse and filter state isolated across multiple logs', async () => {
    const store = useWorkspaceStore()
    store.initializeCatalog(await loadAppCatalog())

    const single = await store.loadSyntheticDemo()
    const multiFile = new File(
      ['fictional boot\n[WIRE:TX] F3:D7:E6:90:74:D2:2C:2A:FF'],
      'synthetic-multi.log',
      { type: 'text/plain', lastModified: 1 },
    )
    const [multi] = await store.importFiles([multiFile])
    if (!single.sessionId || !multi?.sessionId) throw new Error('Expected two imported sessions')

    store.updateViewState(single.sessionId, { query: 'lattice', categoryFilters: ['C4'] })
    store.activateSession(multi.sessionId)

    expect(store.sessions[multi.sessionId]?.summary?.translated).toBe(1)
    expect(store.viewStates[multi.sessionId]?.query).toBe('')
    expect(store.viewStates[single.sessionId]?.query).toBe('lattice')
    expect(store.viewStates[single.sessionId]?.categoryFilters).toEqual(['C4'])

    store.updateViewState(single.sessionId, {
      rawScrollOffset: 320,
      resultScrollOffset: 152,
    })
    expect(store.viewStates[single.sessionId]?.rawScrollOffset).toBe(320)
    expect(store.viewStates[multi.sessionId]?.rawScrollOffset).toBe(0)

    store.removeSession(multi.sessionId)
    expect(store.activeLogId).toBe(single.sessionId)
    expect(store.viewStates[multi.sessionId]).toBeUndefined()
  })

  it('rejects unsupported extensions without creating a session', async () => {
    const store = useWorkspaceStore()
    store.initializeCatalog(await loadAppCatalog())

    const [outcome] = await store.importFiles([
      new File(['synthetic'], 'not-a-log.csv', { type: 'text/csv' }),
    ])

    expect(outcome?.error).toContain('.log')
    expect(store.sessionOrder).toHaveLength(0)
  })

  it('retains a log-level explanation when no target lines exist', async () => {
    const store = useWorkspaceStore()
    store.initializeCatalog(await loadAppCatalog())

    const [outcome] = await store.importFiles([
      new File(['fictional carrier noise only'], 'no-target.log', {
        type: 'text/plain',
      }),
    ])
    const session = outcome?.sessionId ? store.sessions[outcome.sessionId] : undefined

    expect(outcome?.error).toBeUndefined()
    expect(session?.status).toBe('ready')
    expect(session?.issues).toContainEqual(expect.objectContaining({
      code: 'NO_TARGET_LINES',
    }))
    expect(session?.issues[0]).not.toHaveProperty('rawLineIndex')
  })
})
