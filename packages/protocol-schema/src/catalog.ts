import type { CommandSchema, ProcessType, ProtocolBundle, ProtocolCatalog } from './schema'
import { assertProtocolSemantics } from './validation'

type CanonicalJson = null | boolean | number | string | CanonicalJson[] | { [key: string]: CanonicalJson }

const PROCESS_TYPE_ORDER: Record<ProcessType, number> = {
  single: 0,
  multi: 1,
}

function compareStrings(left: string, right: string): number {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

function compareCommands(left: CommandSchema, right: CommandSchema): number {
  return (
    compareStrings(left.direction, right.direction) ||
    compareStrings(left.category, right.category) ||
    compareStrings(left.subType, right.subType)
  )
}

function normalizeBundles(bundles: readonly ProtocolBundle[]): ProtocolBundle[] {
  return bundles
    .map((bundle) => ({
      ...bundle,
      selector: { ...bundle.selector },
      commands: [...bundle.commands].sort(compareCommands),
    }))
    .sort((left, right) => PROCESS_TYPE_ORDER[left.processType] - PROCESS_TYPE_ORDER[right.processType])
}

function toCanonicalJson(value: unknown): CanonicalJson {
  if (
    value === null ||
    typeof value === 'boolean' ||
    typeof value === 'string'
  ) {
    return value
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError('Cannot canonicalize a non-finite number')
    }
    return value
  }

  if (Array.isArray(value)) {
    return value.map((entry) => toCanonicalJson(entry))
  }

  if (typeof value === 'object') {
    const result: { [key: string]: CanonicalJson } = {}
    Object.keys(value)
      .sort(compareStrings)
      .forEach((key) => {
        const entry = (value as Record<string, unknown>)[key]
        if (entry !== undefined) {
          result[key] = toCanonicalJson(entry)
        }
      })
    return result
  }

  throw new TypeError(`Cannot canonicalize value of type ${typeof value}`)
}

export function canonicalize(value: unknown): string {
  return JSON.stringify(toCanonicalJson(value))
}

export function canonicalizeProtocolBundles(bundles: readonly ProtocolBundle[]): string {
  return canonicalize(normalizeBundles(bundles))
}

function toHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

export async function deriveCatalogVersion(
  bundles: readonly ProtocolBundle[],
): Promise<string> {
  assertProtocolSemantics(bundles)
  const canonicalCatalog = canonicalizeProtocolBundles(bundles)
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(canonicalCatalog),
  )
  return `sha256:${toHex(digest)}`
}

export async function createProtocolCatalog(
  bundles: readonly ProtocolBundle[],
): Promise<ProtocolCatalog> {
  assertProtocolSemantics(bundles)
  return {
    catalogVersion: await deriveCatalogVersion(bundles),
    bundles: [...bundles],
  }
}
