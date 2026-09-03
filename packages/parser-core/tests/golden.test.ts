import { buildProtocolIndex } from '@srlw/protocol-schema'
import {
  goldenCases,
  syntheticProtocolBundles,
} from '@srlw/test-fixtures'
import { describe, expect, it } from 'vitest'

import { parseLog } from '../src'

const protocolIndex = buildProtocolIndex(syntheticProtocolBundles)

describe('synthetic parser golden cases', () => {
  it('contains at least sixteen independently reviewable cases', () => {
    expect(goldenCases.length).toBeGreaterThanOrEqual(16)
    expect(new Set(goldenCases.map((golden) => golden.name)).size).toBe(
      goldenCases.length,
    )
    expect(goldenCases.every((golden) => golden.rule.length > 20)).toBe(true)
  })

  for (const golden of goldenCases) {
    it(golden.name, () => {
      const result = parseLog(
        {
          logId: `golden:${golden.name}`,
          rawText: golden.inputLog,
          catalogVersion: 'synthetic-golden-v1',
        },
        protocolIndex,
      )

      expect(result.processType).toBe(golden.expected.processType)
      expect(result.commands.map((command) => command.status)).toEqual(
        golden.expected.statuses,
      )
      expect(result.commands.map((command) => command.rawLineIndex)).toEqual(
        golden.expected.rawLineIndices,
      )
      expect(result.issues.map((issue) => issue.code)).toEqual(
        golden.expected.issueCodes,
      )
      expect(result.summary).toEqual(golden.expected.summary)

      if (golden.expected.directions !== undefined) {
        expect(
          result.commands.map((command) => command.direction ?? null),
        ).toEqual(golden.expected.directions)
      }
      if (golden.expected.categories !== undefined) {
        expect(
          result.commands.map((command) => command.category ?? null),
        ).toEqual(golden.expected.categories)
      }
      if (golden.expected.subTypes !== undefined) {
        expect(
          result.commands.map((command) => command.subType ?? null),
        ).toEqual(golden.expected.subTypes)
      }

      const fields = new Map(
        result.commands.flatMap((command) =>
          command.fields.map((field) => [field.key, field] as const),
        ),
      )
      for (const [key, displayValue] of Object.entries(
        golden.expected.fieldValues ?? {},
      )) {
        expect(fields.get(key)?.displayValue).toBe(displayValue)
      }
      for (const [key, applied] of Object.entries(
        golden.expected.fieldApplied ?? {},
      )) {
        expect(fields.get(key)?.applied).toBe(applied)
      }
    })
  }
})
