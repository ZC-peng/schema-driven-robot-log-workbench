export const DEFAULT_FIXTURE_SEED = 20_260_901
export const BENCHMARK_LINE_COUNTS = [1_000, 10_000, 30_000, 100_000] as const

export interface SyntheticLogOptions {
  lineCount: number
  seed?: number
  processType?: 'single' | 'multi'
  targetEvery?: number
}

export interface GeneratedSyntheticLog {
  rawText: string
  lineCount: number
  targetLineCount: number
  seed: number
  processType: 'single' | 'multi'
}

function createPrng(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0
    return state / 0x1_0000_0000
  }
}

function timestamp(lineIndex: number): string {
  const seconds = lineIndex % 60
  const minutes = Math.floor(lineIndex / 60) % 60
  const hours = Math.floor(lineIndex / 3_600) % 24
  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, '0'))
    .join(':')
}

function hexByte(value: number): string {
  return value.toString(16).padStart(2, '0').toUpperCase()
}

export function generateSyntheticLog(
  options: SyntheticLogOptions,
): GeneratedSyntheticLog {
  if (!Number.isInteger(options.lineCount) || options.lineCount < 0) {
    throw new RangeError('lineCount must be a non-negative integer.')
  }

  const seed = options.seed ?? DEFAULT_FIXTURE_SEED
  const processType = options.processType ?? 'multi'
  const targetEvery = options.targetEvery ?? 5
  if (!Number.isInteger(targetEvery) || targetEvery < 1) {
    throw new RangeError('targetEvery must be a positive integer.')
  }

  const random = createPrng(seed)
  const lines: string[] = []
  let targetLineCount = 0

  for (let lineIndex = 0; lineIndex < options.lineCount; lineIndex += 1) {
    const time = timestamp(lineIndex)
    if (lineIndex % targetEvery !== 0) {
      const sample = Math.floor(random() * 10_000)
      lines.push(`[${time}] synthetic aurora sample=${sample}`)
      continue
    }

    targetLineCount += 1
    const payload = Math.floor(random() * 256)
    if (processType === 'multi') {
      if (lineIndex % (targetEvery * 2) === 0) {
        lines.push(
          `[${time}] [WIRE:TX] F3:D7:E6:90:74:D2:2A:3B:${hexByte(payload)}`,
        )
      } else {
        lines.push(
          `[${time}] [WIRE:RX] F4:D7:E6:91:75:D3:3B:5A:9D:${hexByte(payload)}`,
        )
      }
    } else if (lineIndex % (targetEvery * 2) === 0) {
      lines.push(
        `[${time}] [WIRE:TX] F1:31:C4:8E:72:9A:4D:4C:B2:${hexByte(payload)}`,
      )
    } else {
      lines.push(
        `[${time}] [WIRE:RX] F2:31:C4:8F:73:9B:5E:6E:${hexByte(payload)}`,
      )
    }
  }

  return {
    rawText: lines.join('\n'),
    lineCount: options.lineCount,
    targetLineCount,
    seed,
    processType,
  }
}
