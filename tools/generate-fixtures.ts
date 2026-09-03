import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

import {
  BENCHMARK_LINE_COUNTS,
  DEFAULT_FIXTURE_SEED,
  generateSyntheticLog,
} from '@srlw/test-fixtures'

interface FixtureManifestEntry {
  fileName: string
  lineCount: number
  targetLineCount: number
  seed: number
  processType: 'single' | 'multi'
}

function parsePositiveInteger(value: string, optionName: string): number {
  const result = Number(value)
  if (!Number.isSafeInteger(result) || result < 1) {
    throw new Error(`${optionName} must be a positive integer; received ${value}.`)
  }
  return result
}

function parseSizes(value: string | undefined): number[] {
  if (value === undefined) return [...BENCHMARK_LINE_COUNTS]
  const sizes = value
    .split(',')
    .map((item) => parsePositiveInteger(item.trim(), '--sizes'))
  return [...new Set(sizes)]
}

function displayHelp(): void {
  process.stdout.write(
    [
      'Generate deterministic, entirely synthetic parser benchmark fixtures.',
      'These fixtures target @srlw/test-fixtures protocols, not the Web app catalog.',
      '',
      'Usage: npm run fixtures:generate -- [options]',
      '',
      'Options:',
      '  --sizes  Comma-separated line counts (default: 1000,10000,30000,100000)',
      `  --seed   Positive integer seed (default: ${DEFAULT_FIXTURE_SEED})`,
      '  --process single|multi (default: multi)',
      '  --output Output directory',
      '  --help   Show this message',
      '',
    ].join('\n'),
  )
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      sizes: { type: 'string' },
      seed: { type: 'string' },
      process: { type: 'string' },
      output: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
    strict: true,
  })

  if (values.help === true) {
    displayHelp()
    return
  }

  const sizes = parseSizes(values.sizes)
  const seed =
    values.seed === undefined
      ? DEFAULT_FIXTURE_SEED
      : parsePositiveInteger(values.seed, '--seed')
  if (
    values.process !== undefined &&
    values.process !== 'single' &&
    values.process !== 'multi'
  ) {
    throw new Error('--process must be either single or multi.')
  }
  const processType = values.process ?? 'multi'
  const outputDirectory = resolve(
    values.output ??
      fileURLToPath(
        new URL('../packages/test-fixtures/logs/generated/', import.meta.url),
      ),
  )

  await mkdir(outputDirectory, { recursive: true })
  const manifest: FixtureManifestEntry[] = []

  for (const lineCount of sizes) {
    const fixture = generateSyntheticLog({ lineCount, seed, processType })
    const suffix =
      lineCount % 1_000 === 0 ? `${lineCount / 1_000}k` : String(lineCount)
    const fileName = `synthetic-${suffix}-seed-${seed}-${processType}.log`
    await writeFile(join(outputDirectory, fileName), fixture.rawText, 'utf8')
    manifest.push({
      fileName,
      lineCount: fixture.lineCount,
      targetLineCount: fixture.targetLineCount,
      seed: fixture.seed,
      processType: fixture.processType,
    })
  }

  const manifestPath = join(outputDirectory, 'manifest.json')
  await writeFile(
    manifestPath,
    `${JSON.stringify(
      {
        notice: 'All generated logs are synthetic and deterministic.',
        generatedBy: 'tools/generate-fixtures.ts',
        fixtures: manifest,
      },
      null,
      2,
    )}\n`,
    'utf8',
  )

  process.stdout.write(
    `Generated ${manifest.length} fixture(s) in ${outputDirectory}.\n`,
  )
}

await main()
