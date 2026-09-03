export {
  byteOffsetSchema,
  commandSchema,
  directionSchema,
  enumFieldDecoderSchema,
  equalsFieldConditionSchema,
  fieldConditionSchema,
  fieldDecoderSchema,
  fieldSchema,
  hexByteSchema,
  hexFieldDecoderSchema,
  inFieldConditionSchema,
  processTypeSchema,
  protocolBundleSchema,
  protocolBundlesSchema,
  protocolSelectorSchema,
  uint8FieldDecoderSchema,
} from './schema'

export type {
  ByteOffset,
  CommandSchema,
  Direction,
  EnumFieldDecoder,
  EqualsFieldCondition,
  FieldCondition,
  FieldDecoder,
  FieldSchema,
  HexByte,
  HexFieldDecoder,
  InFieldCondition,
  ProcessType,
  ProtocolBundle,
  ProtocolCatalog,
  ProtocolSelector,
  Uint8FieldDecoder,
} from './schema'

export {
  assertProtocolSemantics,
  commandCompositeKey,
  formatProtocolIssue,
  formatProtocolPath,
  ProtocolSemanticValidationError,
  validateProtocolSemantics,
} from './validation'

export type {
  ProtocolPathSegment,
  ProtocolSemanticIssue,
  ProtocolSemanticIssueCode,
} from './validation'

export { buildProtocolIndex, getProtocolSelector, lookup, lookupProtocol } from './indexer'
export type {
  CategoryIndex,
  DirectionIndex,
  ProtocolIndex,
  SubTypeIndex,
} from './indexer'

export {
  canonicalize,
  canonicalizeProtocolBundles,
  createProtocolCatalog,
  deriveCatalogVersion,
} from './catalog'
