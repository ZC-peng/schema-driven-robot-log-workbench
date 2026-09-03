import {
  getProtocolSelector,
  lookupProtocol,
  type HexByte,
  type ProcessType,
  type ProtocolIndex,
  type ProtocolSelector,
} from '@srlw/protocol-schema'

import { commandId, parseCommandWithSchema } from './fields'
import {
  insufficientBytesIssue,
  mixedProcessTypesIssue,
  noDecodableTargetLinesIssue,
  noTargetLinesIssue,
  unknownCommandIssue,
} from './issues'
import { decodeTargetLine, isTargetLine, splitLines, toHexByte } from './line'
import type {
  DecodeTargetLineResult,
  ParsedCommand,
  ParsedTargetLine,
  ParseExecutionHooks,
  ParseIssue,
  ParseLogRequest,
  ParseLogResult,
  ProcessTypeDetectionResult,
} from './types'

function malformedFromDecodeFailure(
  failure: Extract<DecodeTargetLineResult, { ok: false }>,
): ParsedCommand {
  return {
    id: commandId(failure.rawLineIndex),
    rawLineIndex: failure.rawLineIndex,
    rawText: failure.rawText,
    ...(failure.direction === undefined
      ? {}
      : { direction: failure.direction }),
    bytes: [],
    status: 'malformed',
    fields: [],
    issues: [failure.error],
  }
}

function malformedFromTarget(
  target: ParsedTargetLine,
  issue: ParseIssue,
  selector?: ProtocolSelector,
): ParsedCommand {
  const category = selector === undefined
    ? undefined
    : target.bytes[selector.categoryOffset]
  const subType = selector === undefined
    ? undefined
    : target.bytes[selector.subTypeOffset]

  return {
    id: commandId(target.rawLineIndex),
    rawLineIndex: target.rawLineIndex,
    rawText: target.rawText,
    direction: target.direction,
    bytes: [...target.bytes],
    ...(category === undefined ? {} : { category: toHexByte(category) }),
    ...(subType === undefined ? {} : { subType: toHexByte(subType) }),
    status: 'malformed',
    fields: [],
    issues: [issue],
  }
}

function malformedForLogType(
  target: ParsedTargetLine,
  issue: ParseIssue,
): ParsedCommand {
  return malformedFromTarget(target, issue)
}

function unknownResult(
  target: ParsedTargetLine,
  processType: ProcessType,
  category: HexByte,
  subType: HexByte,
): ParsedCommand {
  const issue = unknownCommandIssue(target.rawLineIndex)
  return {
    id: commandId(target.rawLineIndex),
    rawLineIndex: target.rawLineIndex,
    rawText: target.rawText,
    direction: target.direction,
    processType,
    bytes: [...target.bytes],
    category,
    subType,
    status: 'unknown',
    fields: [],
    issues: [issue],
  }
}

export function detectLogProcessType(
  targets: readonly ParsedTargetLine[],
  targetLineCount: number,
): ProcessTypeDetectionResult {
  if (targetLineCount === 0) return { ok: false, error: noTargetLinesIssue() }
  if (targets.length === 0) {
    return { ok: false, error: noDecodableTargetLinesIssue() }
  }

  const observed = new Set<ProcessType>()
  for (const target of targets) {
    const marker = target.bytes[1]
    if (marker === undefined) continue
    observed.add(marker === 0xd7 ? 'multi' : 'single')
  }

  if (observed.size === 0) {
    return { ok: false, error: noDecodableTargetLinesIssue() }
  }
  if (observed.size > 1) {
    return { ok: false, error: mixedProcessTypesIssue() }
  }

  const processType = observed.values().next().value
  if (processType === undefined) {
    return { ok: false, error: noDecodableTargetLinesIssue() }
  }
  return { ok: true, processType }
}

function stableSortCommands(commands: readonly ParsedCommand[]): ParsedCommand[] {
  return commands
    .map((command, insertionIndex) => ({ command, insertionIndex }))
    .sort(
      (left, right) =>
        left.command.rawLineIndex - right.command.rawLineIndex ||
        left.insertionIndex - right.insertionIndex,
    )
    .map(({ command }) => command)
}

function buildParseResult(
  request: ParseLogRequest,
  totalLines: number,
  targetLines: number,
  processType: ProcessType | undefined,
  commands: readonly ParsedCommand[],
  issues: readonly ParseIssue[],
): ParseLogResult {
  const orderedCommands = stableSortCommands(commands)
  const summary = {
    totalLines,
    targetLines,
    translated: orderedCommands.filter(
      (command) => command.status === 'translated',
    ).length,
    unknown: orderedCommands.filter((command) => command.status === 'unknown')
      .length,
    malformed: orderedCommands.filter(
      (command) => command.status === 'malformed',
    ).length,
  }

  return {
    logId: request.logId,
    catalogVersion: request.catalogVersion,
    ...(processType === undefined ? {} : { processType }),
    commands: orderedCommands,
    issues: [...issues],
    summary,
  }
}

function progressInterval(hooks: ParseExecutionHooks): number {
  const candidate = hooks.progressEveryLines
  return candidate !== undefined && Number.isInteger(candidate) && candidate > 0
    ? candidate
    : 1_000
}

export function parseLog(
  request: ParseLogRequest,
  index: ProtocolIndex,
  hooks: ParseExecutionHooks = {},
): ParseLogResult {
  const lines = splitLines(request.rawText)
  const decodedTargets: ParsedTargetLine[] = []
  const commands: ParsedCommand[] = []
  const issues: ParseIssue[] = []
  let targetLineCount = 0
  const interval = progressInterval(hooks)

  for (let rawLineIndex = 0; rawLineIndex < lines.length; rawLineIndex += 1) {
    if (hooks.onProgress !== undefined && rawLineIndex % interval === 0) {
      hooks.onProgress(rawLineIndex, lines.length)
    }

    const rawText = lines[rawLineIndex]
    if (rawText === undefined || !isTargetLine(rawText)) continue
    targetLineCount += 1

    const target = decodeTargetLine(rawText, rawLineIndex)
    if (!target.ok) {
      commands.push(malformedFromDecodeFailure(target))
      issues.push(target.error)
      continue
    }

    if (target.value.bytes.length < 2) {
      const issue = insufficientBytesIssue(rawLineIndex, 2)
      commands.push(malformedFromTarget(target.value, issue))
      issues.push(issue)
      continue
    }

    decodedTargets.push(target.value)
  }

  if (hooks.onProgress !== undefined) hooks.onProgress(lines.length, lines.length)

  const detection = detectLogProcessType(decodedTargets, targetLineCount)
  if (!detection.ok) {
    issues.push(detection.error)
    commands.push(
      ...decodedTargets.map((target) =>
        malformedForLogType(target, detection.error),
      ),
    )
    return buildParseResult(
      request,
      lines.length,
      targetLineCount,
      undefined,
      commands,
      issues,
    )
  }

  const processType = detection.processType
  const selector = getProtocolSelector(index, processType)
  if (selector === undefined) {
    throw new Error(`Protocol selector is missing for process type ${processType}`)
  }
  const selectorBytes = Math.max(
    selector.categoryOffset,
    selector.subTypeOffset,
  ) + 1

  for (const target of decodedTargets) {
    if (target.bytes.length < selectorBytes) {
      const issue = insufficientBytesIssue(target.rawLineIndex, selectorBytes)
      commands.push(malformedFromTarget(target, issue, selector))
      issues.push(issue)
      continue
    }

    const categoryValue = target.bytes[selector.categoryOffset]
    const subTypeValue = target.bytes[selector.subTypeOffset]
    if (categoryValue === undefined || subTypeValue === undefined) continue

    const category = toHexByte(categoryValue)
    const subType = toHexByte(subTypeValue)
    const schema = lookupProtocol(
      index,
      processType,
      target.direction,
      category,
      subType,
    )

    if (schema === undefined) {
      const command = unknownResult(
        target,
        processType,
        category,
        subType,
      )
      commands.push(command)
      issues.push(...command.issues)
      continue
    }

    const command = parseCommandWithSchema(target, processType, schema)
    commands.push(command)
    issues.push(...command.issues)
  }

  return buildParseResult(
    request,
    lines.length,
    targetLineCount,
    processType,
    commands,
    issues,
  )
}
