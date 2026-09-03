import { describe, expect, it } from 'vitest'
import multiProtocol from '../protocols/multi.json'
import singleProtocol from '../protocols/single.json'
import {
  assertProtocolSemantics,
  formatProtocolPath,
  ProtocolSemanticValidationError,
  protocolBundleSchema,
  validateProtocolSemantics,
  type FieldSchema,
  type ProtocolBundle,
  type ProtocolSemanticIssueCode,
} from '../src/index'

function validBundles(): ProtocolBundle[] {
  return [
    protocolBundleSchema.parse(structuredClone(singleProtocol)),
    protocolBundleSchema.parse(structuredClone(multiProtocol)),
  ]
}

function issueCodes(bundles: readonly ProtocolBundle[]): ProtocolSemanticIssueCode[] {
  return validateProtocolSemantics(bundles).map(({ code }) => code)
}

function firstCommand(bundles: ProtocolBundle[]) {
  const command = bundles[0]?.commands[0]
  if (command === undefined) {
    throw new Error('Synthetic fixture must contain a command')
  }
  return command
}

function commandWithInCondition(bundles: ProtocolBundle[]) {
  const command = bundles
    .flatMap((bundle) => bundle.commands)
    .find((candidate) =>
      candidate.details.some((field) => field.when?.operator === 'in'),
    )
  if (command === undefined) {
    throw new Error('Synthetic fixture must contain an in-condition command')
  }
  return command
}

describe('validateProtocolSemantics', () => {
  it('accepts the complete synthetic catalog', () => {
    expect(validateProtocolSemantics(validBundles())).toEqual([])
    expect(() => assertProtocolSemantics(validBundles())).not.toThrow()
  })

  it('requires exactly one bundle for each process type', () => {
    const bundles = validBundles()
    expect(issueCodes([bundles[0]!])).toContain('MISSING_PROCESS_TYPE')

    const duplicate = structuredClone(bundles[0]!)
    expect(issueCodes([...bundles, duplicate])).toContain('DUPLICATE_PROCESS_TYPE')
  })

  it('rejects an empty or whitespace-only version', () => {
    const bundles = validBundles()
    bundles[0]!.version = '   '

    expect(issueCodes(bundles)).toContain('EMPTY_VERSION')
  })

  it('rejects a duplicate process/direction/category/subtype command key', () => {
    const bundles = validBundles()
    const command = firstCommand(bundles)
    bundles[0]!.commands.push(structuredClone(command))

    expect(issueCodes(bundles)).toContain('DUPLICATE_COMMAND_KEY')
  })

  it('requires minBytes to be a non-negative integer', () => {
    const bundles = validBundles()
    firstCommand(bundles).minBytes = -1

    expect(issueCodes(bundles)).toContain('INVALID_MIN_BYTES')
  })

  it('requires minBytes to cover every unconditional field', () => {
    const bundles = validBundles()
    const command = firstCommand(bundles)
    command.minBytes = 8

    expect(issueCodes(bundles)).toContain('UNCOVERED_REQUIRED_OFFSET')
  })

  it('requires minBytes to cover each condition source but not its conditional target', () => {
    const bundles = validBundles()
    const command = firstCommand(bundles)
    command.minBytes = 8

    expect(issueCodes(bundles)).toContain('UNCOVERED_REQUIRED_OFFSET')

    command.minBytes = 9
    expect(issueCodes(bundles)).not.toContain('UNCOVERED_REQUIRED_OFFSET')
  })

  it('rejects duplicate field keys within one command', () => {
    const bundles = validBundles()
    const command = firstCommand(bundles)
    command.details[1]!.key = command.details[0]!.key

    expect(issueCodes(bundles)).toContain('DUPLICATE_FIELD_KEY')
  })

  it('rejects multiple unconditional fields at the same offset', () => {
    const bundles = validBundles()
    const command = firstCommand(bundles)
    command.details[1]!.offset = command.details[0]!.offset

    expect(issueCodes(bundles)).toContain('UNCONDITIONAL_OFFSET_CONFLICT')
  })

  it('rejects an unconditional field mixed with a conditional field at the same offset', () => {
    const bundles = validBundles()
    const command = firstCommand(bundles)
    const conditional = command.details.find((field) => field.when !== undefined)
    expect(conditional).toBeDefined()
    conditional!.offset = command.details[0]!.offset

    expect(issueCodes(bundles)).toContain('UNCONDITIONAL_CONDITIONAL_OFFSET_CONFLICT')
  })

  it('accepts mutually exclusive equals and in conditions at the same offset', () => {
    const bundles = validBundles()
    const command = commandWithInCondition(bundles)
    const conditionals = command.details.filter((field) => field.when !== undefined)

    expect(conditionals.map((field) => field.when?.operator)).toEqual(['equals', 'in'])
    expect(new Set(conditionals.map((field) => field.offset))).toEqual(new Set([9]))

    expect(issueCodes(bundles)).not.toContain('CONDITION_VALUE_OVERLAP')
  })

  it('rejects overlapping equals and in conditions at the same offset', () => {
    const bundles = validBundles()
    const command = commandWithInCondition(bundles)
    const inField = command.details.find((field) => field.when?.operator === 'in')
    expect(inField?.when?.operator).toBe('in')
    if (inField?.when?.operator === 'in') {
      inField.when.values.push('9D')
    }

    expect(issueCodes(bundles)).toContain('CONDITION_VALUE_OVERLAP')
  })

  it('rejects same-target conditions based on independent source offsets', () => {
    const bundles = validBundles()
    const command = firstCommand(bundles)
    const conditionals = command.details.filter(
      (field): field is FieldSchema & { when: NonNullable<FieldSchema['when']> } =>
        field.when !== undefined,
    )
    expect(conditionals).toHaveLength(2)
    conditionals[1]!.when.sourceOffset = 7

    expect(issueCodes(bundles)).toContain('CONDITION_SOURCE_AMBIGUITY')
  })

  it('validates runtime enum mappings even when a caller bypasses Zod', () => {
    const bundles = validBundles()
    const enumField = firstCommand(bundles).details.find((field) => field.decoder.kind === 'enum')
    expect(enumField?.decoder.kind).toBe('enum')
    if (enumField?.decoder.kind === 'enum') {
      enumField.decoder.mapping = { bad: 'Invalid key' }
    }

    expect(issueCodes(bundles)).toContain('INVALID_HEX_BYTE')
  })

  it('validates selector offsets even when a caller bypasses Zod', () => {
    const bundles = validBundles()
    bundles[0]!.selector.subTypeOffset = bundles[0]!.selector.categoryOffset

    expect(issueCodes(bundles)).toContain('SELECTOR_OFFSET_CONFLICT')
  })

  it('throws a typed error containing all semantic issues', () => {
    const bundles = validBundles()
    bundles[0]!.version = ''

    expect(() => assertProtocolSemantics(bundles)).toThrow(ProtocolSemanticValidationError)
    try {
      assertProtocolSemantics(bundles)
    } catch (error) {
      expect(error).toBeInstanceOf(ProtocolSemanticValidationError)
      if (error instanceof ProtocolSemanticValidationError) {
        expect(error.issues.map(({ code }) => code)).toContain('EMPTY_VERSION')
      }
    }
  })

  it('formats JSON paths for CLI and UI diagnostics', () => {
    expect(formatProtocolPath([0, 'commands', 2, 'details', 1, 'decoder', 'mapping', '9D']))
      .toBe('$[0].commands[2].details[1].decoder.mapping["9D"]')
    expect(formatProtocolPath(['key-with-hyphen'])).toBe('$["key-with-hyphen"]')
  })
})
