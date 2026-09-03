export {
  buildProtocolIndex,
  lookupProtocol,
  lookupProtocol as lookup,
} from '@srlw/protocol-schema'
export type {
  CategoryIndex,
  CommandSchema,
  Direction,
  DirectionIndex,
  FieldCondition,
  FieldDecoder,
  FieldSchema,
  HexByte,
  ProcessType,
  ProtocolIndex,
  SubTypeIndex,
} from '@srlw/protocol-schema'

export { commandId, decodeValue, matchesConditionValue, parseCommandWithSchema, parseField } from './fields'
export {
  insufficientBytesIssue,
  invalidHexIssue,
  missingDirectionIssue,
  mixedProcessTypesIssue,
  noDecodableTargetLinesIssue,
  noTargetLinesIssue,
  unknownCommandIssue,
} from './issues'
export { decodeTargetLine, isTargetLine, splitLines, toHexByte } from './line'
export { detectLogProcessType, parseLog } from './parser'
export type {
  DecodeTargetLineResult,
  FieldParseResult,
  ParsedCommand,
  ParsedField,
  ParsedTargetLine,
  ParseExecutionHooks,
  ParseIssue,
  ParseIssueCode,
  ParseLogRequest,
  ParseLogResult,
  ParseSummary,
  ProcessTypeDetectionResult,
  TranslationStatus,
} from './types'
