import type {
  CommandSchema,
  Direction,
  FieldSchema,
  HexByte,
  ProcessType,
} from '@srlw/protocol-schema'

export interface ParseLogRequest {
  logId: string
  rawText: string
  catalogVersion: string
}

export interface ParseExecutionHooks {
  progressEveryLines?: number
  onProgress?: (processedLines: number, totalLines: number) => void
}

export interface ParsedTargetLine {
  rawLineIndex: number
  rawText: string
  direction: Direction
  bytes: number[]
}

export type TranslationStatus = 'translated' | 'unknown' | 'malformed'

export interface ParsedField {
  key: string
  label: string
  offset: number
  rawHex?: HexByte
  displayValue?: string
  applied: boolean
}

export interface ParsedCommand {
  id: string
  rawLineIndex: number
  rawText: string
  direction?: Direction
  processType?: ProcessType
  bytes: number[]
  category?: HexByte
  subType?: HexByte
  status: TranslationStatus
  commandDescription?: string
  fields: ParsedField[]
  issues: ParseIssue[]
}

export type ParseIssueCode =
  | 'INVALID_HEX'
  | 'MISSING_DIRECTION'
  | 'INSUFFICIENT_BYTES'
  | 'UNKNOWN_COMMAND'
  | 'NO_TARGET_LINES'
  | 'NO_DECODABLE_TARGET_LINES'
  | 'MIXED_PROCESS_TYPES'
  | 'AMBIGUOUS_PROTOCOL'

export interface ParseIssue {
  code: ParseIssueCode
  message: string
  rawLineIndex?: number
  severity: 'warning' | 'error'
}

export interface ParseSummary {
  totalLines: number
  targetLines: number
  translated: number
  unknown: number
  malformed: number
}

export interface ParseLogResult {
  logId: string
  catalogVersion: string
  processType?: ProcessType
  commands: ParsedCommand[]
  issues: ParseIssue[]
  summary: ParseSummary
}

export type DecodeTargetLineResult =
  | { ok: true; value: ParsedTargetLine }
  | {
      ok: false
      error: ParseIssue
      rawLineIndex: number
      rawText: string
      direction?: Direction
    }

export type ProcessTypeDetectionResult =
  | { ok: true; processType: ProcessType }
  | { ok: false; error: ParseIssue }

export type FieldParseResult =
  | { ok: true; field: ParsedField }
  | { ok: false; field: ParsedField; issue: ParseIssue }

export interface ParseCommandWithSchemaInput {
  target: ParsedTargetLine
  processType: ProcessType
  schema: CommandSchema
}

export interface ParseFieldInput {
  bytes: readonly number[]
  field: FieldSchema
  rawLineIndex: number
}
