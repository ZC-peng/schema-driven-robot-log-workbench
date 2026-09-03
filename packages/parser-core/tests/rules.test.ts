import { readFileSync } from 'node:fs'

import {
  buildProtocolIndex,
  lookupProtocol,
  type FieldSchema,
  validateProtocolSemantics,
} from '@srlw/protocol-schema'
import {
  BENCHMARK_LINE_COUNTS,
  DEFAULT_FIXTURE_SEED,
  generateSyntheticLog,
  syntheticProtocolBundles,
} from '@srlw/test-fixtures'
import { describe, expect, it, vi } from 'vitest'

import {
  decodeTargetLine,
  detectLogProcessType,
  isTargetLine,
  matchesConditionValue,
  parseField,
  parseLog,
  splitLines,
  toHexByte,
} from '../src'

const protocolIndex = buildProtocolIndex(syntheticProtocolBundles)

describe('line recognition and decoding rules', () => {
  it('recognizes only supported target markers', () => {
    expect(isTargetLine('[WIRE:TX] F1:31')).toBe(true)
    expect(isTargetLine('[wire:rx] F2:31')).toBe(true)
    expect(isTargetLine('[WIRE:XX] F1:31')).toBe(false)
    expect(isTargetLine('unrelated synthetic log')).toBe(false)
  })

  it('maps TX to down and RX to up', () => {
    const down = decodeTargetLine('prefix [WIRE:TX] 0a:bb', 7)
    const up = decodeTargetLine('prefix [WIRE:RX] 0A BB', 8)

    expect(down).toEqual({
      ok: true,
      value: {
        rawLineIndex: 7,
        rawText: 'prefix [WIRE:TX] 0a:bb',
        direction: 'down',
        bytes: [0x0a, 0xbb],
      },
    })
    expect(up.ok && up.value.direction).toBe('up')
  })

  it('rejects malformed byte tokens and ambiguous markers', () => {
    const invalid = decodeTargetLine('[WIRE:TX] 0A:XYZ', 2)
    const ambiguous = decodeTargetLine(
      '[WIRE:TX] [WIRE:RX] 0A:00',
      3,
    )

    expect(!invalid.ok && invalid.error.code).toBe('INVALID_HEX')
    expect(!ambiguous.ok && ambiguous.error.code).toBe('MISSING_DIRECTION')
  })

  it('splits LF, CRLF and CR without adding a trailing phantom line', () => {
    expect(splitLines('')).toEqual([])
    expect(splitLines('a\nb\n')).toEqual(['a', 'b'])
    expect(splitLines('a\r\nb\r')).toEqual(['a', 'b'])
    expect(splitLines('a\n\nb')).toEqual(['a', '', 'b'])
  })

  it('normalizes decoded bytes to uppercase two-character hex', () => {
    expect(toHexByte(0)).toBe('00')
    expect(toHexByte(10)).toBe('0A')
    expect(toHexByte(255)).toBe('FF')
    expect(() => toHexByte(256)).toThrow(RangeError)
  })
})

describe('log-level process detection rules', () => {
  const target = (
    secondByte: number,
  ): {
    rawLineIndex: number
    rawText: string
    direction: 'down'
    bytes: number[]
  } => ({
    rawLineIndex: 0,
    rawText: 'synthetic',
    direction: 'down',
    bytes: [0x10, secondByte],
  })

  it('uses exactly bytes[1] === 0xD7 for multi', () => {
    expect(detectLogProcessType([target(0xd7)], 1)).toEqual({
      ok: true,
      processType: 'multi',
    })
    expect(detectLogProcessType([target(0x31)], 1)).toEqual({
      ok: true,
      processType: 'single',
    })
  })

  it('reports empty, undecodable, and mixed observations distinctly', () => {
    expect(detectLogProcessType([], 0)).toMatchObject({
      ok: false,
      error: { code: 'NO_TARGET_LINES' },
    })
    expect(detectLogProcessType([], 2)).toMatchObject({
      ok: false,
      error: { code: 'NO_DECODABLE_TARGET_LINES' },
    })
    expect(
      detectLogProcessType([target(0x31), target(0xd7)], 2),
    ).toMatchObject({
      ok: false,
      error: { code: 'MIXED_PROCESS_TYPES' },
    })
  })
})

describe('schema lookup and field rules', () => {
  it('uses fixtures that pass independent protocol semantic validation', () => {
    expect(validateProtocolSemantics(syntheticProtocolBundles)).toEqual([])
  })

  it('looks up by process, direction and each bundle selector', () => {
    expect(
      lookupProtocol(protocolIndex, 'single', 'down', 'C4', '9A')
        ?.description,
    ).toBe('Modulate a synthetic beacon')
    expect(
      lookupProtocol(protocolIndex, 'single', 'up', 'C4', '9A'),
    ).toBeUndefined()
    expect(
      lookupProtocol(protocolIndex, 'multi', 'down', 'E6', 'D2')
        ?.description,
    ).toBe('Assign a synthetic relay shard')
  })

  it('decodes hex, uint8, enum and an unmapped enum deterministically', () => {
    const field = (decoder: FieldSchema['decoder']): FieldSchema => ({
      key: 'value',
      label: 'Value',
      offset: 0,
      decoder,
    })

    expect(parseField([0x0f], field({ kind: 'hex' }), 0)).toMatchObject({
      ok: true,
      field: { rawHex: '0F', displayValue: '0F', applied: true },
    })
    expect(parseField([15], field({ kind: 'uint8' }), 0)).toMatchObject({
      ok: true,
      field: { displayValue: '15' },
    })
    expect(
      parseField(
        [0x4c],
        field({ kind: 'enum', mapping: { '4C': 'Quartz' } }),
        0,
      ),
    ).toMatchObject({ ok: true, field: { displayValue: 'Quartz' } })
    expect(
      parseField(
        [0x5d],
        field({ kind: 'enum', mapping: { '4C': 'Quartz' } }),
        0,
      ),
    ).toMatchObject({
      ok: true,
      field: { displayValue: 'Unknown (0x5D)' },
    })
  })

  it('supports equals and in without evaluating expressions', () => {
    const inField: FieldSchema = {
      key: 'branch',
      label: 'Branch',
      offset: 2,
      decoder: { kind: 'hex' },
      when: {
        sourceOffset: 1,
        operator: 'in',
        values: ['8C', '9E'],
      },
    }

    expect(matchesConditionValue(0x8c, inField.when!)).toBe(true)
    expect(matchesConditionValue(0xaf, inField.when!)).toBe(false)
    expect(parseField([0, 0x9e, 0x55], inField, 4)).toMatchObject({
      ok: true,
      field: { displayValue: '55', applied: true },
    })
    expect(parseField([0, 0xaf], inField, 4)).toMatchObject({
      ok: true,
      field: { applied: false },
    })
  })

  it('distinguishes a missing condition source from a missing applied value', () => {
    const conditional: FieldSchema = {
      key: 'value',
      label: 'Value',
      offset: 2,
      decoder: { kind: 'uint8' },
      when: { sourceOffset: 1, operator: 'equals', value: '5D' },
    }

    expect(parseField([0], conditional, 9)).toMatchObject({
      ok: false,
      field: { applied: false },
      issue: { code: 'INSUFFICIENT_BYTES' },
    })
    expect(parseField([0, 0x5d], conditional, 9)).toMatchObject({
      ok: false,
      field: { applied: true },
      issue: { code: 'INSUFFICIENT_BYTES' },
    })
  })
})

describe('whole-log parser invariants', () => {
  it('keeps malformed and translated commands in raw source order', () => {
    const result = parseLog(
      {
        logId: 'stable',
        catalogVersion: 'fixture-v1',
        rawText:
          '[WIRE:TX] invalid\n' +
          'synthetic ordinary line\n' +
          '[WIRE:TX] F1:31:C4:8E:72:9A:4D:4C:B2:2A',
      },
      protocolIndex,
    )

    expect(result.commands.map(({ rawLineIndex }) => rawLineIndex)).toEqual([
      0, 2,
    ])
    expect(result.commands.map(({ status }) => status)).toEqual([
      'malformed',
      'translated',
    ])
    expect(result.summary).toEqual({
      totalLines: 3,
      targetLines: 2,
      translated: 1,
      unknown: 0,
      malformed: 1,
    })
  })

  it('is deterministic for identical text, catalog and index', () => {
    const request = {
      logId: 'deterministic',
      catalogVersion: 'fixture-v1',
      rawText: generateSyntheticLog({
        lineCount: 1_000,
        seed: 123,
        processType: 'single',
      }).rawText,
    }

    expect(parseLog(request, protocolIndex)).toEqual(
      parseLog(request, protocolIndex),
    )
  })

  it('continues after a conditional source or target is out of range', () => {
    const result = parseLog(
      {
        logId: 'conditional-continuation',
        catalogVersion: 'fixture-v1',
        rawText:
          '[WIRE:TX] F1:31:D6:8E:72:A7:5D\n' +
          '[WIRE:TX] F1:31:C4:8E:72:9A:4D:4C:B2:2A',
      },
      protocolIndex,
    )

    expect(result.commands.map(({ status }) => status)).toEqual([
      'malformed',
      'translated',
    ])
    expect(result.commands[0]?.fields[0]).toMatchObject({
      key: 'extension',
      applied: true,
    })
    expect(result.summary).toMatchObject({ translated: 1, malformed: 1 })
  })

  it('reports progress at fixed line checkpoints and completion', () => {
    const onProgress = vi.fn()
    parseLog(
      {
        logId: 'progress',
        catalogVersion: 'fixture-v1',
        rawText: ['ordinary', 'ordinary', 'ordinary', 'ordinary', 'ordinary'].join(
          '\n',
        ),
      },
      protocolIndex,
      { progressEveryLines: 2, onProgress },
    )

    expect(onProgress.mock.calls).toEqual([
      [0, 5],
      [2, 5],
      [4, 5],
      [5, 5],
    ])
  })

  it('has no Vue, DOM, Pinia, IndexedDB or Worker dependency', () => {
    const files = ['parser.ts', 'line.ts', 'fields.ts']
    const source = files
      .map((name) =>
        readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8'),
      )
      .join('\n')

    expect(source).not.toMatch(/\b(?:vue|pinia|indexedDB|Worker|document|window)\b/u)
  })
})

describe('fixed-seed synthetic fixture generator', () => {
  it('declares the required 1k, 10k, 30k and 100k size matrix', () => {
    expect(BENCHMARK_LINE_COUNTS).toEqual([1_000, 10_000, 30_000, 100_000])
  })

  it('repeats byte-for-byte for the same seed and options', () => {
    const options = {
      lineCount: 1_000,
      seed: DEFAULT_FIXTURE_SEED,
      processType: 'multi' as const,
    }
    const first = generateSyntheticLog(options)
    const second = generateSyntheticLog(options)

    expect(first).toEqual(second)
    expect(splitLines(first.rawText)).toHaveLength(1_000)
    expect(first.targetLineCount).toBe(200)
  })

  it('changes generated content when the seed changes', () => {
    const first = generateSyntheticLog({ lineCount: 100, seed: 1 })
    const second = generateSyntheticLog({ lineCount: 100, seed: 2 })
    expect(first.rawText).not.toBe(second.rawText)
  })
})
