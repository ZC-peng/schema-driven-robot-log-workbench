import type {
  CommandSchema,
  FieldCondition,
  FieldDecoder,
  FieldSchema,
  ProcessType,
} from '@srlw/protocol-schema'

import { insufficientBytesIssue } from './issues'
import { toHexByte } from './line'
import type {
  FieldParseResult,
  ParsedCommand,
  ParsedField,
  ParsedTargetLine,
} from './types'

export function matchesConditionValue(
  value: number,
  condition: FieldCondition,
): boolean {
  const rawHex = toHexByte(value)
  if (condition.operator === 'equals') return rawHex === condition.value
  return condition.values.includes(rawHex)
}

export function decodeValue(value: number, decoder: FieldDecoder): string {
  if (decoder.kind === 'uint8') return String(value)

  const rawHex = toHexByte(value)
  if (decoder.kind === 'hex') return rawHex
  return decoder.mapping[rawHex] ?? `Unknown (0x${rawHex})`
}

export function parseField(
  bytes: readonly number[],
  field: FieldSchema,
  rawLineIndex: number,
): FieldParseResult {
  if (field.when !== undefined) {
    const conditionValue = bytes[field.when.sourceOffset]
    if (conditionValue === undefined) {
      return {
        ok: false,
        field: {
          key: field.key,
          label: field.label,
          offset: field.offset,
          applied: false,
        },
        issue: insufficientBytesIssue(
          rawLineIndex,
          field.when.sourceOffset + 1,
        ),
      }
    }

    if (!matchesConditionValue(conditionValue, field.when)) {
      return {
        ok: true,
        field: {
          key: field.key,
          label: field.label,
          offset: field.offset,
          applied: false,
        },
      }
    }
  }

  const value = bytes[field.offset]
  if (value === undefined) {
    return {
      ok: false,
      field: {
        key: field.key,
        label: field.label,
        offset: field.offset,
        applied: true,
      },
      issue: insufficientBytesIssue(rawLineIndex, field.offset + 1),
    }
  }

  return {
    ok: true,
    field: {
      key: field.key,
      label: field.label,
      offset: field.offset,
      rawHex: toHexByte(value),
      displayValue: decodeValue(value, field.decoder),
      applied: true,
    },
  }
}

function addIssueOnce(
  issues: ParsedCommand['issues'],
  issue: ParsedCommand['issues'][number],
): void {
  const duplicate = issues.some(
    (candidate) =>
      candidate.code === issue.code &&
      candidate.message === issue.message &&
      candidate.rawLineIndex === issue.rawLineIndex,
  )
  if (!duplicate) issues.push(issue)
}

export function parseCommandWithSchema(
  target: ParsedTargetLine,
  processType: ProcessType,
  schema: CommandSchema,
): ParsedCommand {
  const fields: ParsedField[] = []
  const issues: ParsedCommand['issues'] = []

  if (target.bytes.length < schema.minBytes) {
    addIssueOnce(
      issues,
      insufficientBytesIssue(target.rawLineIndex, schema.minBytes),
    )
  }

  for (const fieldSchema of schema.details) {
    const result = parseField(target.bytes, fieldSchema, target.rawLineIndex)
    fields.push(result.field)
    if (!result.ok) addIssueOnce(issues, result.issue)
  }

  return {
    id: commandId(target.rawLineIndex),
    rawLineIndex: target.rawLineIndex,
    rawText: target.rawText,
    direction: target.direction,
    processType,
    bytes: [...target.bytes],
    category: schema.category,
    subType: schema.subType,
    status: issues.length === 0 ? 'translated' : 'malformed',
    commandDescription: schema.description,
    fields,
    issues,
  }
}

export function commandId(rawLineIndex: number): string {
  return `line-${rawLineIndex}`
}
