import { z } from 'zod'

const NON_EMPTY_MESSAGE = 'Must contain at least one non-whitespace character'

export const processTypeSchema = z.enum(['single', 'multi'])

export const directionSchema = z.enum(['up', 'down'])

export const hexByteSchema = z
  .string()
  .regex(/^[0-9A-F]{2}$/, 'Expected an uppercase two-digit hexadecimal byte')

export const byteOffsetSchema = z
  .number()
  .int('Offset must be an integer')
  .nonnegative('Offset must be non-negative')

const nonEmptyStringSchema = z.string().trim().min(1, NON_EMPTY_MESSAGE)

export const hexFieldDecoderSchema = z.strictObject({
  kind: z.literal('hex'),
})

export const uint8FieldDecoderSchema = z.strictObject({
  kind: z.literal('uint8'),
})

export const enumFieldDecoderSchema = z.strictObject({
  kind: z.literal('enum'),
  mapping: z.record(hexByteSchema, nonEmptyStringSchema),
}).superRefine((decoder, context) => {
  if (Object.keys(decoder.mapping).length === 0) {
    context.addIssue({
      code: 'custom',
      message: 'Enum mapping must contain at least one entry',
      path: ['mapping'],
    })
  }
})

export const fieldDecoderSchema = z.discriminatedUnion('kind', [
  hexFieldDecoderSchema,
  uint8FieldDecoderSchema,
  enumFieldDecoderSchema,
])

export const equalsFieldConditionSchema = z.strictObject({
  sourceOffset: byteOffsetSchema,
  operator: z.literal('equals'),
  value: hexByteSchema,
})

export const inFieldConditionSchema = z.strictObject({
  sourceOffset: byteOffsetSchema,
  operator: z.literal('in'),
  values: z.array(hexByteSchema).min(1, 'Condition values must not be empty'),
}).superRefine((condition, context) => {
  const seen = new Set<string>()

  condition.values.forEach((value, index) => {
    if (seen.has(value)) {
      context.addIssue({
        code: 'custom',
        message: `Condition value ${value} is duplicated`,
        path: ['values', index],
      })
    }
    seen.add(value)
  })
})

export const fieldConditionSchema = z.discriminatedUnion('operator', [
  equalsFieldConditionSchema,
  inFieldConditionSchema,
])

export const fieldSchema = z.strictObject({
  key: nonEmptyStringSchema,
  label: nonEmptyStringSchema,
  description: nonEmptyStringSchema.optional(),
  offset: byteOffsetSchema,
  decoder: fieldDecoderSchema,
  when: fieldConditionSchema.optional(),
})

export const commandSchema = z.strictObject({
  direction: directionSchema,
  category: hexByteSchema,
  subType: hexByteSchema,
  description: nonEmptyStringSchema,
  minBytes: z.number().int('minBytes must be an integer').nonnegative('minBytes must be non-negative'),
  details: z.array(fieldSchema),
})

export const protocolSelectorSchema = z.strictObject({
  categoryOffset: byteOffsetSchema,
  subTypeOffset: byteOffsetSchema,
}).superRefine((selector, context) => {
  if (selector.categoryOffset === selector.subTypeOffset) {
    context.addIssue({
      code: 'custom',
      message: 'Category and subtype selectors must use different offsets',
      path: ['subTypeOffset'],
    })
  }
})

export const protocolBundleSchema = z.strictObject({
  version: z.string(),
  processType: processTypeSchema,
  selector: protocolSelectorSchema,
  commands: z.array(commandSchema),
})

export const protocolBundlesSchema = z.array(protocolBundleSchema)

export type ProcessType = z.infer<typeof processTypeSchema>
export type Direction = z.infer<typeof directionSchema>
export type HexByte = z.infer<typeof hexByteSchema>
export type ByteOffset = z.infer<typeof byteOffsetSchema>
export type HexFieldDecoder = z.infer<typeof hexFieldDecoderSchema>
export type Uint8FieldDecoder = z.infer<typeof uint8FieldDecoderSchema>
export type EnumFieldDecoder = z.infer<typeof enumFieldDecoderSchema>
export type FieldDecoder = z.infer<typeof fieldDecoderSchema>
export type EqualsFieldCondition = z.infer<typeof equalsFieldConditionSchema>
export type InFieldCondition = z.infer<typeof inFieldConditionSchema>
export type FieldCondition = z.infer<typeof fieldConditionSchema>
export type FieldSchema = z.infer<typeof fieldSchema>
export type CommandSchema = z.infer<typeof commandSchema>
export type ProtocolSelector = z.infer<typeof protocolSelectorSchema>
export type ProtocolBundle = z.infer<typeof protocolBundleSchema>

export interface ProtocolCatalog {
  catalogVersion: string
  bundles: ProtocolBundle[]
}
