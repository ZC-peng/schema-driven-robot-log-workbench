import type {
  CommandSchema,
  FieldCondition,
  FieldSchema,
  HexByte,
  ProcessType,
  ProtocolBundle,
} from './schema'

export type ProtocolPathSegment = string | number

export type ProtocolSemanticIssueCode =
  | 'MISSING_PROCESS_TYPE'
  | 'DUPLICATE_PROCESS_TYPE'
  | 'EMPTY_VERSION'
  | 'DUPLICATE_COMMAND_KEY'
  | 'INVALID_MIN_BYTES'
  | 'SELECTOR_OFFSET_CONFLICT'
  | 'UNCOVERED_REQUIRED_OFFSET'
  | 'INVALID_OFFSET'
  | 'INVALID_HEX_BYTE'
  | 'INVALID_ENUM_MAPPING'
  | 'DUPLICATE_FIELD_KEY'
  | 'UNCONDITIONAL_OFFSET_CONFLICT'
  | 'UNCONDITIONAL_CONDITIONAL_OFFSET_CONFLICT'
  | 'CONDITION_SOURCE_AMBIGUITY'
  | 'CONDITION_VALUE_OVERLAP'

export interface ProtocolSemanticIssue {
  severity: 'error'
  code: ProtocolSemanticIssueCode
  message: string
  path: ProtocolPathSegment[]
}

export class ProtocolSemanticValidationError extends Error {
  readonly issues: ProtocolSemanticIssue[]

  constructor(issues: ProtocolSemanticIssue[]) {
    super(
      `Protocol semantics are invalid (${issues.length} ${issues.length === 1 ? 'issue' : 'issues'})`,
    )
    this.name = 'ProtocolSemanticValidationError'
    this.issues = issues
  }
}

const PROCESS_TYPES: readonly ProcessType[] = ['single', 'multi']
const HEX_BYTE_PATTERN = /^[0-9A-F]{2}$/

function addIssue(
  issues: ProtocolSemanticIssue[],
  code: ProtocolSemanticIssueCode,
  path: ProtocolPathSegment[],
  message: string,
): void {
  issues.push({ severity: 'error', code, path, message })
}

function isNonNegativeInteger(value: number): boolean {
  return Number.isInteger(value) && value >= 0
}

function validateHexByte(
  value: string,
  path: ProtocolPathSegment[],
  issues: ProtocolSemanticIssue[],
): void {
  if (!HEX_BYTE_PATTERN.test(value)) {
    addIssue(
      issues,
      'INVALID_HEX_BYTE',
      path,
      `Expected an uppercase two-digit hexadecimal byte, received ${JSON.stringify(value)}`,
    )
  }
}

function validateOffset(
  value: number,
  path: ProtocolPathSegment[],
  issues: ProtocolSemanticIssue[],
): void {
  if (!isNonNegativeInteger(value)) {
    addIssue(issues, 'INVALID_OFFSET', path, `Offset must be a non-negative integer, received ${value}`)
  }
}

function conditionValues(condition: FieldCondition): ReadonlySet<HexByte> {
  return new Set(condition.operator === 'equals' ? [condition.value] : condition.values)
}

function validateDecoder(
  field: FieldSchema,
  path: ProtocolPathSegment[],
  issues: ProtocolSemanticIssue[],
): void {
  if (field.decoder.kind !== 'enum') {
    return
  }

  const entries = Object.entries(field.decoder.mapping)
  if (entries.length === 0) {
    addIssue(issues, 'INVALID_ENUM_MAPPING', [...path, 'decoder', 'mapping'], 'Enum mapping must not be empty')
  }

  entries.forEach(([key, label]) => {
    validateHexByte(key, [...path, 'decoder', 'mapping', key], issues)
    if (label.trim().length === 0) {
      addIssue(
        issues,
        'INVALID_ENUM_MAPPING',
        [...path, 'decoder', 'mapping', key],
        'Enum mapping labels must not be empty',
      )
    }
  })
}

function validateCondition(
  field: FieldSchema,
  path: ProtocolPathSegment[],
  issues: ProtocolSemanticIssue[],
): void {
  if (field.when === undefined) {
    return
  }

  validateOffset(field.when.sourceOffset, [...path, 'when', 'sourceOffset'], issues)

  if (field.when.operator === 'equals') {
    validateHexByte(field.when.value, [...path, 'when', 'value'], issues)
    return
  }

  const seen = new Set<HexByte>()
  field.when.values.forEach((value, valueIndex) => {
    validateHexByte(value, [...path, 'when', 'values', valueIndex], issues)
    if (seen.has(value)) {
      addIssue(
        issues,
        'CONDITION_VALUE_OVERLAP',
        [...path, 'when', 'values', valueIndex],
        `Condition value ${value} is duplicated in the same condition`,
      )
    }
    seen.add(value)
  })
}

function validateFieldIdentity(
  command: CommandSchema,
  commandPath: ProtocolPathSegment[],
  issues: ProtocolSemanticIssue[],
): void {
  const keyToIndex = new Map<string, number>()

  command.details.forEach((field, fieldIndex) => {
    const previousIndex = keyToIndex.get(field.key)
    if (previousIndex !== undefined) {
      addIssue(
        issues,
        'DUPLICATE_FIELD_KEY',
        [...commandPath, 'details', fieldIndex, 'key'],
        `Field key ${JSON.stringify(field.key)} duplicates details[${previousIndex}].key`,
      )
    } else {
      keyToIndex.set(field.key, fieldIndex)
    }
  })
}

function validateFieldsAtSameOffset(
  command: CommandSchema,
  commandPath: ProtocolPathSegment[],
  issues: ProtocolSemanticIssue[],
): void {
  const fieldsByOffset = new Map<number, Array<{ field: FieldSchema; index: number }>>()

  command.details.forEach((field, index) => {
    const fields = fieldsByOffset.get(field.offset) ?? []
    fields.push({ field, index })
    fieldsByOffset.set(field.offset, fields)
  })

  for (const [offset, fields] of fieldsByOffset) {
    if (fields.length < 2) {
      continue
    }

    const unconditional = fields.filter(({ field }) => field.when === undefined)
    const conditional = fields.filter(
      (entry): entry is { field: FieldSchema & { when: FieldCondition }; index: number } =>
        entry.field.when !== undefined,
    )

    unconditional.slice(1).forEach(({ index }) => {
      addIssue(
        issues,
        'UNCONDITIONAL_OFFSET_CONFLICT',
        [...commandPath, 'details', index, 'offset'],
        `Offset ${offset} has more than one unconditional field`,
      )
    })

    if (unconditional.length > 0 && conditional.length > 0) {
      conditional.forEach(({ index }) => {
        addIssue(
          issues,
          'UNCONDITIONAL_CONDITIONAL_OFFSET_CONFLICT',
          [...commandPath, 'details', index, 'when'],
          `Conditional field at offset ${offset} overlaps an unconditional field`,
        )
      })
    }

    for (let leftIndex = 0; leftIndex < conditional.length; leftIndex += 1) {
      const left = conditional[leftIndex]
      if (left === undefined) {
        continue
      }

      for (let rightIndex = leftIndex + 1; rightIndex < conditional.length; rightIndex += 1) {
        const right = conditional[rightIndex]
        if (right === undefined) {
          continue
        }

        if (left.field.when.sourceOffset !== right.field.when.sourceOffset) {
          addIssue(
            issues,
            'CONDITION_SOURCE_AMBIGUITY',
            [...commandPath, 'details', right.index, 'when', 'sourceOffset'],
            `Fields sharing offset ${offset} use different condition sources and can both apply`,
          )
          continue
        }

        const leftValues = conditionValues(left.field.when)
        const overlap = [...conditionValues(right.field.when)].filter((value) => leftValues.has(value))
        if (overlap.length > 0) {
          addIssue(
            issues,
            'CONDITION_VALUE_OVERLAP',
            [...commandPath, 'details', right.index, 'when'],
            `Fields sharing offset ${offset} overlap for ${overlap.join(', ')}`,
          )
        }
      }
    }
  }
}

function validateCommand(
  bundle: ProtocolBundle,
  bundleIndex: number,
  command: CommandSchema,
  commandIndex: number,
  issues: ProtocolSemanticIssue[],
): void {
  const commandPath: ProtocolPathSegment[] = [bundleIndex, 'commands', commandIndex]

  validateHexByte(command.category, [...commandPath, 'category'], issues)
  validateHexByte(command.subType, [...commandPath, 'subType'], issues)

  if (!Number.isInteger(command.minBytes) || command.minBytes < 0) {
    addIssue(
      issues,
      'INVALID_MIN_BYTES',
      [...commandPath, 'minBytes'],
      `minBytes must be a non-negative integer, received ${command.minBytes}`,
    )
  }

  let highestRequiredOffset = Math.max(
    bundle.selector.categoryOffset,
    bundle.selector.subTypeOffset,
  )

  command.details.forEach((field, fieldIndex) => {
    const fieldPath = [...commandPath, 'details', fieldIndex]
    validateOffset(field.offset, [...fieldPath, 'offset'], issues)
    validateDecoder(field, fieldPath, issues)
    validateCondition(field, fieldPath, issues)

    if (field.when === undefined) {
      highestRequiredOffset = Math.max(highestRequiredOffset, field.offset)
    } else {
      highestRequiredOffset = Math.max(highestRequiredOffset, field.when.sourceOffset)
    }
  })

  const requiredMinBytes = highestRequiredOffset + 1
  if (Number.isInteger(command.minBytes) && command.minBytes < requiredMinBytes) {
    addIssue(
      issues,
      'UNCOVERED_REQUIRED_OFFSET',
      [...commandPath, 'minBytes'],
      `minBytes ${command.minBytes} does not cover required offset ${highestRequiredOffset}; expected at least ${requiredMinBytes}`,
    )
  }

  validateFieldIdentity(command, commandPath, issues)
  validateFieldsAtSameOffset(command, commandPath, issues)
}

export function commandCompositeKey(
  processType: ProcessType,
  command: Pick<CommandSchema, 'direction' | 'category' | 'subType'>,
): string {
  return `${processType}:${command.direction}:${command.category}:${command.subType}`
}

export function validateProtocolSemantics(
  bundles: readonly ProtocolBundle[],
): ProtocolSemanticIssue[] {
  const issues: ProtocolSemanticIssue[] = []
  const processTypeToIndex = new Map<ProcessType, number>()
  const commandKeyToPath = new Map<string, ProtocolPathSegment[]>()

  bundles.forEach((bundle, bundleIndex) => {
    if (bundle.version.trim().length === 0) {
      addIssue(issues, 'EMPTY_VERSION', [bundleIndex, 'version'], 'Bundle version must not be empty')
    }

    validateOffset(
      bundle.selector.categoryOffset,
      [bundleIndex, 'selector', 'categoryOffset'],
      issues,
    )
    validateOffset(
      bundle.selector.subTypeOffset,
      [bundleIndex, 'selector', 'subTypeOffset'],
      issues,
    )
    if (bundle.selector.categoryOffset === bundle.selector.subTypeOffset) {
      addIssue(
        issues,
        'SELECTOR_OFFSET_CONFLICT',
        [bundleIndex, 'selector', 'subTypeOffset'],
        'Category and subtype selectors must use different offsets',
      )
    }

    const previousBundleIndex = processTypeToIndex.get(bundle.processType)
    if (previousBundleIndex !== undefined) {
      addIssue(
        issues,
        'DUPLICATE_PROCESS_TYPE',
        [bundleIndex, 'processType'],
        `Process type ${bundle.processType} duplicates bundle ${previousBundleIndex}`,
      )
    } else {
      processTypeToIndex.set(bundle.processType, bundleIndex)
    }

    bundle.commands.forEach((command, commandIndex) => {
      const commandPath: ProtocolPathSegment[] = [bundleIndex, 'commands', commandIndex]
      const key = commandCompositeKey(bundle.processType, command)
      const previousCommandPath = commandKeyToPath.get(key)
      if (previousCommandPath !== undefined) {
        addIssue(
          issues,
          'DUPLICATE_COMMAND_KEY',
          commandPath,
          `Command key ${key} duplicates ${formatProtocolPath(previousCommandPath)}`,
        )
      } else {
        commandKeyToPath.set(key, commandPath)
      }

      validateCommand(bundle, bundleIndex, command, commandIndex, issues)
    })
  })

  PROCESS_TYPES.forEach((processType) => {
    if (!processTypeToIndex.has(processType)) {
      addIssue(
        issues,
        'MISSING_PROCESS_TYPE',
        [],
        `Catalog must contain exactly one ${processType} bundle`,
      )
    }
  })

  return issues
}

export function assertProtocolSemantics(bundles: readonly ProtocolBundle[]): void {
  const issues = validateProtocolSemantics(bundles)
  if (issues.length > 0) {
    throw new ProtocolSemanticValidationError(issues)
  }
}

export function formatProtocolPath(path: readonly ProtocolPathSegment[]): string {
  if (path.length === 0) {
    return '$'
  }

  return path.reduce<string>((formatted, segment) => {
    if (typeof segment === 'number') {
      return `${formatted}[${segment}]`
    }

    if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(segment)) {
      return `${formatted}.${segment}`
    }

    return `${formatted}[${JSON.stringify(segment)}]`
  }, '$')
}

export function formatProtocolIssue(issue: ProtocolSemanticIssue): string {
  return `${formatProtocolPath(issue.path)} [${issue.code}] ${issue.message}`
}
