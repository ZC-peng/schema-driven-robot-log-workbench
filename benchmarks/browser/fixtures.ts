export const DEFAULT_BROWSER_BENCHMARK_SEED = 20_260_901
export const DEFAULT_BROWSER_BENCHMARK_SIZES = [1_000, 10_000, 30_000] as const
export const STRESS_BROWSER_BENCHMARK_SIZE = 100_000

export type SyntheticProcessType = 'single' | 'multi'

export interface BrowserFixture {
  fileName: string
  rawText: string
  lineCount: number
  targetLineCount: number
  seed: number
  processType: SyntheticProcessType
}

export interface BrowserFixtureOptions {
  lineCount: number
  seed?: number
  processType?: SyntheticProcessType
  targetEvery?: number
  fileName?: string
}

function createPrng(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0
    return state / 0x1_0000_0000
  }
}

function timestamp(lineIndex: number): string {
  const milliseconds = lineIndex % 1_000
  const seconds = Math.floor(lineIndex / 1_000) % 60
  const minutes = Math.floor(lineIndex / 60_000) % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`
}

function hexByte(value: number): string {
  return value.toString(16).padStart(2, '0').toUpperCase()
}

function singleTargetLine(
  lineIndex: number,
  targetIndex: number,
  random: () => number,
): string {
  const token = hexByte(Math.floor(random() * 256))
  const value = hexByte(Math.floor(random() * 256))

  if (targetIndex % 2 === 0) {
    const modulation = targetIndex % 3 === 0 ? '4C' : '5D'
    const parameter = targetIndex % 4 === 0 ? 'B2' : 'C3'
    return `[${timestamp(lineIndex)}] [WIRE:TX] F1:31:C4:8E:72:9A:${token}:${modulation}:${parameter}:${value}`
  }

  const phase = ['6E', '7F', '8D'][targetIndex % 3] ?? '6E'
  return `[${timestamp(lineIndex)}] [WIRE:RX] F2:31:C4:8F:73:9B:${token}:${phase}:${value}`
}

function multiTargetLine(
  lineIndex: number,
  targetIndex: number,
  random: () => number,
): string {
  const shard = hexByte(Math.floor(random() * 128))
  const value = hexByte(Math.floor(random() * 256))

  if (targetIndex % 2 === 0) {
    const binding = ['2A', '3B', '4D'][targetIndex % 3] ?? '2A'
    return `[${timestamp(lineIndex)}] [WIRE:TX] F3:D7:E6:90:74:D2:${shard}:${binding}:${value}`
  }

  const result = ['5A', '6B', '7C'][targetIndex % 3] ?? '5A'
  const selector = targetIndex % 4 === 1 ? '9D' : 'A8'
  return `[${timestamp(lineIndex)}] [WIRE:RX] F4:D7:E6:91:75:D3:${shard}:${result}:${selector}:${value}`
}

export function generateBrowserFixture(options: BrowserFixtureOptions): BrowserFixture {
  if (!Number.isSafeInteger(options.lineCount) || options.lineCount < 1) {
    throw new RangeError('lineCount must be a positive safe integer')
  }

  const targetEvery = options.targetEvery ?? 5
  if (!Number.isSafeInteger(targetEvery) || targetEvery < 1) {
    throw new RangeError('targetEvery must be a positive safe integer')
  }

  const seed = options.seed ?? DEFAULT_BROWSER_BENCHMARK_SEED
  if (!Number.isSafeInteger(seed)) {
    throw new RangeError('seed must be a safe integer')
  }

  const processType = options.processType ?? 'single'
  const random = createPrng(seed)
  const lines = new Array<string>(options.lineCount)
  let targetLineCount = 0

  for (let lineIndex = 0; lineIndex < options.lineCount; lineIndex += 1) {
    if (lineIndex % targetEvery === 0) {
      lines[lineIndex] = processType === 'single'
        ? singleTargetLine(lineIndex, targetLineCount, random)
        : multiTargetLine(lineIndex, targetLineCount, random)
      targetLineCount += 1
      continue
    }

    const sample = Math.floor(random() * 1_000_000)
    lines[lineIndex] = `[${timestamp(lineIndex)}] fictional carrier noise=${sample}`
  }

  return {
    fileName:
      options.fileName ??
      `synthetic-${processType}-${options.lineCount}-seed-${seed}.log`,
    rawText: lines.join('\n'),
    lineCount: options.lineCount,
    targetLineCount,
    seed,
    processType,
  }
}
