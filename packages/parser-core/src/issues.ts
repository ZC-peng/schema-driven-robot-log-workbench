import type { ParseIssue } from './types'

export function invalidHexIssue(rawLineIndex: number): ParseIssue {
  return {
    code: 'INVALID_HEX',
    message:
      `Line ${rawLineIndex + 1} has an invalid hexadecimal payload; ` +
      'expected two-digit bytes separated by colons or whitespace.',
    rawLineIndex,
    severity: 'error',
  }
}

export function missingDirectionIssue(rawLineIndex: number): ParseIssue {
  return {
    code: 'MISSING_DIRECTION',
    message:
      `Line ${rawLineIndex + 1} must contain exactly one supported direction marker ` +
      '([WIRE:TX] or [WIRE:RX]).',
    rawLineIndex,
    severity: 'error',
  }
}

export function insufficientBytesIssue(
  rawLineIndex: number,
  requiredBytes: number,
): ParseIssue {
  return {
    code: 'INSUFFICIENT_BYTES',
    message: `Line ${rawLineIndex + 1} requires at least ${requiredBytes} bytes.`,
    rawLineIndex,
    severity: 'error',
  }
}

export function unknownCommandIssue(rawLineIndex: number): ParseIssue {
  return {
    code: 'UNKNOWN_COMMAND',
    message: `Line ${rawLineIndex + 1} does not match a command in the selected protocol.`,
    rawLineIndex,
    severity: 'warning',
  }
}

export function noTargetLinesIssue(): ParseIssue {
  return {
    code: 'NO_TARGET_LINES',
    message: 'The log does not contain any supported target lines.',
    severity: 'warning',
  }
}

export function noDecodableTargetLinesIssue(): ParseIssue {
  return {
    code: 'NO_DECODABLE_TARGET_LINES',
    message: 'The log contains target lines, but none has enough valid bytes to detect a process type.',
    severity: 'error',
  }
}

export function mixedProcessTypesIssue(): ParseIssue {
  return {
    code: 'MIXED_PROCESS_TYPES',
    message: 'The log mixes single- and multi-process markers; no protocol was selected.',
    severity: 'error',
  }
}
