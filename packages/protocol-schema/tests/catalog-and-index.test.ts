import { describe, expect, it } from 'vitest'
import multiProtocol from '../protocols/multi.json'
import singleProtocol from '../protocols/single.json'
import {
  buildProtocolIndex,
  canonicalize,
  canonicalizeProtocolBundles,
  deriveCatalogVersion,
  getProtocolSelector,
  lookup,
  lookupProtocol,
  protocolBundleSchema,
  type ProtocolBundle,
} from '../src/index'

function validBundles(): ProtocolBundle[] {
  return [
    protocolBundleSchema.parse(structuredClone(singleProtocol)),
    protocolBundleSchema.parse(structuredClone(multiProtocol)),
  ]
}

describe('protocol catalog canonicalization', () => {
  it('sorts object keys recursively', () => {
    expect(canonicalize({ z: 1, a: { d: 2, b: 1 } })).toBe('{"a":{"b":1,"d":2},"z":1}')
  })

  it('is stable across bundle and command source ordering', () => {
    const bundles = validBundles()
    const reordered = [...bundles]
      .reverse()
      .map((bundle) => ({ ...bundle, commands: [...bundle.commands].reverse() }))

    expect(canonicalizeProtocolBundles(reordered)).toBe(canonicalizeProtocolBundles(bundles))
  })

  it('derives a stable SHA-256 catalog version', async () => {
    const bundles = validBundles()
    const reordered = [...bundles].reverse()

    const first = await deriveCatalogVersion(bundles)
    const second = await deriveCatalogVersion(reordered)

    expect(first).toBe(second)
    expect(first).toMatch(/^sha256:[0-9a-f]{64}$/)
  })

  it('changes the catalog version when protocol content changes', async () => {
    const bundles = validBundles()
    const changed = structuredClone(bundles)
    changed[0]!.commands[0]!.description = 'Changed synthetic description'

    expect(await deriveCatalogVersion(changed)).not.toBe(await deriveCatalogVersion(bundles))
  })
})

describe('protocol index', () => {
  it('builds the specified nested Map and looks commands up by the composite key', () => {
    const bundles = validBundles()
    const index = buildProtocolIndex(bundles)

    expect(lookupProtocol(index, 'single', 'down', 'C4', '9A')?.description)
      .toBe('Synthetic beacon modulation request')
    expect(lookup(index, 'multi', 'up', 'E6', 'D3')?.description)
      .toBe('Synthetic relay-shard result')
    expect(getProtocolSelector(index, 'single')).toEqual({
      categoryOffset: 2,
      subTypeOffset: 5,
    })
  })

  it('returns undefined for an unknown command without mutating the index', () => {
    const index = buildProtocolIndex(validBundles())
    const before = index.get('single')?.get('up')?.size

    expect(lookup(index, 'single', 'up', 'FF', 'FF')).toBeUndefined()
    expect(index.get('single')?.get('up')?.size).toBe(before)
  })

  it('refuses to silently overwrite a duplicate command', () => {
    const bundles = validBundles()
    bundles[0]!.commands.push(structuredClone(bundles[0]!.commands[0]!))

    expect(() => buildProtocolIndex(bundles)).toThrow(/duplicate protocol command/)
  })
})
