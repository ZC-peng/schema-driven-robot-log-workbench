import type { Direction, HexByte } from '@srlw/protocol-schema'

import { invalidHexIssue, missingDirectionIssue } from './issues'
import type { DecodeTargetLineResult } from './types'

const TARGET_MARKER_PATTERN = /\[WIRE:(TX|RX)\]/giu

interface DirectionMarker {
  direction: Direction
  endIndex: number
}

export function splitLines(rawText: string): string[] {
  if (rawText.length === 0) return []

  const lines = rawText.split(/\r\n|\n|\r/u)
  if (/\r\n$|[\n\r]$/u.test(rawText)) lines.pop()
  return lines
}

export function isTargetLine(rawText: string): boolean {
  TARGET_MARKER_PATTERN.lastIndex = 0
  return TARGET_MARKER_PATTERN.test(rawText)
}

function findDirectionMarkers(rawText: string): DirectionMarker[] {
  const markers: DirectionMarker[] = []
  TARGET_MARKER_PATTERN.lastIndex = 0

  for (const match of rawText.matchAll(TARGET_MARKER_PATTERN)) {
    const source = match[1]?.toUpperCase()
    if (source !== 'TX' && source !== 'RX') continue

    markers.push({
      direction: source === 'TX' ? 'down' : 'up',
      endIndex: (match.index ?? 0) + match[0].length,
    })
  }

  return markers
}

function decodeHexPayload(payload: string): number[] | undefined {
  const trimmed = payload.trim()
  if (trimmed.length === 0) return undefined

  const tokens = trimmed.split(/[\s:]+/u)
  if (
    tokens.length === 0 ||
    tokens.some((token) => !/^[\dA-Fa-f]{2}$/u.test(token))
  ) {
    return undefined
  }

  return tokens.map((token) => Number.parseInt(token, 16))
}

export function decodeTargetLine(
  rawText: string,
  rawLineIndex: number,
): DecodeTargetLineResult {
  const markers = findDirectionMarkers(rawText)
  const directions = new Set(markers.map((marker) => marker.direction))

  if (markers.length === 0 || directions.size !== 1) {
    return {
      ok: false,
      error: missingDirectionIssue(rawLineIndex),
      rawLineIndex,
      rawText,
    }
  }

  const marker = markers[0]
  if (marker === undefined) {
    return {
      ok: false,
      error: missingDirectionIssue(rawLineIndex),
      rawLineIndex,
      rawText,
    }
  }

  const bytes = decodeHexPayload(rawText.slice(marker.endIndex))
  if (bytes === undefined) {
    return {
      ok: false,
      error: invalidHexIssue(rawLineIndex),
      rawLineIndex,
      rawText,
      direction: marker.direction,
    }
  }

  return {
    ok: true,
    value: {
      rawLineIndex,
      rawText,
      direction: marker.direction,
      bytes,
    },
  }
}

export function toHexByte(value: number): HexByte {
  if (!Number.isInteger(value) || value < 0 || value > 0xff) {
    throw new RangeError(`Hex byte must be an integer from 0 to 255; received ${value}.`)
  }

  return value.toString(16).padStart(2, '0').toUpperCase() as HexByte
}
