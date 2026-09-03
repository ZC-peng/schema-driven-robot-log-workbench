import { describe, expect, it } from 'vitest'
import multiProtocol from '../protocols/multi.json'
import singleProtocol from '../protocols/single.json'
import {
  enumFieldDecoderSchema,
  fieldSchema,
  hexByteSchema,
  protocolBundleSchema,
  protocolBundlesSchema,
} from '../src/index'

describe('protocol Zod schemas', () => {
  it('parses the synthetic single and multi bundles', () => {
    const result = protocolBundlesSchema.safeParse([singleProtocol, multiProtocol])

    expect(result.success).toBe(true)
  })

  it.each(['0a', 'A', 'AAA', 'G0', ' 0A'])('rejects invalid hex byte %j', (value) => {
    expect(hexByteSchema.safeParse(value).success).toBe(false)
  })

  it.each(['00', '0A', 'A0', 'FF'])('accepts uppercase two-digit hex byte %j', (value) => {
    expect(hexByteSchema.safeParse(value).success).toBe(true)
  })

  it.each([-1, 1.5])('rejects invalid field offset %s', (offset) => {
    const field = {
      key: 'syntheticField',
      label: 'Synthetic field',
      offset,
      decoder: { kind: 'hex' },
    }

    expect(fieldSchema.safeParse(field).success).toBe(false)
  })

  it('rejects malformed and empty enum mappings', () => {
    expect(enumFieldDecoderSchema.safeParse({ kind: 'enum', mapping: {} }).success).toBe(false)
    expect(
      enumFieldDecoderSchema.safeParse({ kind: 'enum', mapping: { aa: 'Lowercase key' } }).success,
    ).toBe(false)
    expect(
      enumFieldDecoderSchema.safeParse({ kind: 'enum', mapping: { AA: '   ' } }).success,
    ).toBe(false)
  })

  it('rejects duplicate values within an in condition', () => {
    const field = {
      key: 'conditionalValue',
      label: 'Conditional value',
      offset: 7,
      decoder: { kind: 'uint8' },
      when: {
        sourceOffset: 6,
        operator: 'in',
        values: ['01', '01'],
      },
    }

    expect(fieldSchema.safeParse(field).success).toBe(false)
  })

  it('rejects unknown properties instead of silently stripping them', () => {
    const bundleWithExpression = {
      ...singleProtocol,
      expression: 'bytes[0] === 0x10',
    }

    const result = protocolBundleSchema.safeParse(bundleWithExpression)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.code).toBe('unrecognized_keys')
    }
  })

  it('accepts configurable selector offsets and rejects collisions', () => {
    const bundle = structuredClone(singleProtocol)
    bundle.selector.categoryOffset = 1
    bundle.selector.subTypeOffset = 4

    expect(protocolBundleSchema.safeParse(bundle).success).toBe(true)

    bundle.selector.subTypeOffset = 1
    expect(protocolBundleSchema.safeParse(bundle).success).toBe(false)

    bundle.selector.subTypeOffset = -1
    expect(protocolBundleSchema.safeParse(bundle).success).toBe(false)
  })
})
