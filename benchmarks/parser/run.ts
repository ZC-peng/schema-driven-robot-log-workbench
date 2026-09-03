import { execFileSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { cpus, platform, release } from 'node:os'
import { join, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

import {
  buildProtocolIndex,
  deriveCatalogVersion,
} from '@srlw/protocol-schema'
import { parseLog } from '@srlw/parser-core'
import {
  BENCHMARK_LINE_COUNTS,
  DEFAULT_FIXTURE_SEED,
  generateSyntheticLog,
  syntheticProtocolBundles,
} from '@srlw/test-fixtures'

interface ParserBenchmarkRecord {
  benchmark: 'parser'
  timestamp: string
  catalogVersion: string
  gitCommit?: string
  browser: string
  os: string
  cpu?: string
  fixture: string
  lineCount: number
  targetLineCount: number
  samples: number
  warmupRuns: number
  rawValuesMs: number[]
  medianMs: number
  p95Ms: number
  notes: string
}

function positiveInteger(value: string, name: string): number {
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer.`)
  }
  return parsed
}

function percentile(values: readonly number[], percentileValue: number): number {
  const sorted = [...values].sort((left, right) => left - right)
  const index = Math.max(0, Math.ceil(sorted.length * percentileValue) - 1)
  return sorted[index] ?? 0
}

function rounded(value: number): number {
  return Number(value.toFixed(3))
}

function gitCommit(): string | undefined {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return undefined
  }
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      sizes: { type: 'string' },
      samples: { type: 'string' },
      warmup: { type: 'string' },
      seed: { type: 'string' },
      output: { type: 'string' },
    },
  })

  const sizes =
    values.sizes === undefined
      ? [...BENCHMARK_LINE_COUNTS]
      : values.sizes
          .split(',')
          .map((value) => positiveInteger(value.trim(), '--sizes'))
  const sampleCount =
    values.samples === undefined
      ? 10
      : positiveInteger(values.samples, '--samples')
  const warmupRuns =
    values.warmup === undefined
      ? 2
      : positiveInteger(values.warmup, '--warmup')
  const seed =
    values.seed === undefined
      ? DEFAULT_FIXTURE_SEED
      : positiveInteger(values.seed, '--seed')
  const index = buildProtocolIndex(syntheticProtocolBundles)
  const timestamp = new Date().toISOString()
  const commit = gitCommit()
  const cpuModel = cpus()[0]?.model
  const catalogVersion = await deriveCatalogVersion(syntheticProtocolBundles)
  const records: ParserBenchmarkRecord[] = []

  for (const lineCount of sizes) {
    const fixture = generateSyntheticLog({
      lineCount,
      seed,
      processType: 'multi',
    })
    const request = {
      logId: `benchmark-${lineCount}`,
      rawText: fixture.rawText,
      catalogVersion,
    }

    for (let run = 0; run < warmupRuns; run += 1) parseLog(request, index)

    const rawValuesMs: number[] = []
    for (let sample = 0; sample < sampleCount; sample += 1) {
      const start = performance.now()
      const result = parseLog(request, index)
      const elapsed = performance.now() - start
      if (result.summary.targetLines !== fixture.targetLineCount) {
        throw new Error('Benchmark parser result failed its target-count check.')
      }
      rawValuesMs.push(elapsed)
    }

    records.push({
      benchmark: 'parser',
      timestamp,
      catalogVersion,
      ...(commit === undefined ? {} : { gitCommit: commit }),
      browser: `Node ${process.version}`,
      os: `${platform()} ${release()}`,
      ...(cpuModel === undefined ? {} : { cpu: cpuModel }),
      fixture: `${lineCount}-lines-seed-${seed}-multi`,
      lineCount,
      targetLineCount: fixture.targetLineCount,
      samples: sampleCount,
      warmupRuns,
      rawValuesMs,
      medianMs: rounded(percentile(rawValuesMs, 0.5)),
      p95Ms: rounded(percentile(rawValuesMs, 0.95)),
      notes:
        'Node baseline of the framework-agnostic parser. Values are raw wall-clock samples; no browser main-thread claim is inferred.',
    })
  }

  const defaultOutputDirectory = fileURLToPath(
    new URL('./results/', import.meta.url),
  )
  const outputDirectory = resolve(values.output ?? defaultOutputDirectory)
  await mkdir(outputDirectory, { recursive: true })
  const safeTimestamp = timestamp.replace(/[:.]/gu, '-')
  const outputPath = join(outputDirectory, `parser-${safeTimestamp}.json`)
  await writeFile(outputPath, `${JSON.stringify(records, null, 2)}\n`, 'utf8')
  process.stdout.write(`Wrote ${records.length} records to ${outputPath}.\n`)
}

await main()
