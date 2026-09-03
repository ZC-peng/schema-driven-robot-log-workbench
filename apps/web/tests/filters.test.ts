import { describe, expect, it } from 'vitest'
import type { ParsedCommand } from '@srlw/parser-core'
import { filterCommands, uniqueHex } from '../src/features/log-workspace/filters'

const command = (overrides: Partial<ParsedCommand> = {}): ParsedCommand => ({
  id: 'command-1',
  rawLineIndex: 4,
  rawText: '[WIRE:RX] C2:31:E4:05:77:B8:64',
  direction: 'up',
  processType: 'single',
  bytes: [0xc2, 0x31, 0xe4, 0x05, 0x77, 0xb8, 0x64],
  category: 'E4',
  subType: 'B8',
  status: 'translated',
  commandDescription: 'Synthetic lattice status',
  fields: [
    { key: 'phase', label: 'Phase', offset: 6, rawHex: '64', displayValue: 'Beacon', applied: true },
  ],
  issues: [],
  ...overrides,
})

describe('filterCommands', () => {
  it('filters without mutating or reordering parser results', () => {
    const source = [command(), command({ id: 'command-2', rawLineIndex: 9, category: 'F6' })]
    const result = filterCommands(source, {
      query: '',
      categoryFilters: ['F6'],
      subTypeFilters: [],
    })

    expect(result.map((item) => item.rawLineIndex)).toEqual([9])
    expect(source).toHaveLength(2)
  })

  it('searches description, field values, raw text and status case-insensitively', () => {
    const source = [command()]
    for (const query of ['lattice', 'BEACON', 'C2:31', 'translated']) {
      expect(filterCommands(source, { query, categoryFilters: [], subTypeFilters: [] })).toHaveLength(1)
    }
  })

  it('combines category and subtype filters', () => {
    expect(filterCommands([command()], {
      query: '',
      categoryFilters: ['E4'],
      subTypeFilters: ['C9'],
    })).toEqual([])
  })
})

describe('uniqueHex', () => {
  it('removes undefined values and returns stable sorted options', () => {
    expect(uniqueHex(['F6', undefined, 'E4', 'F6'])).toEqual(['E4', 'F6'])
  })
})
