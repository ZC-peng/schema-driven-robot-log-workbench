import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { cpus, platform, release } from 'node:os'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  deriveCatalogVersion,
  protocolBundlesSchema,
} from '@srlw/protocol-schema'

import {
  DEFAULT_BROWSER_BENCHMARK_SEED,
  generateBrowserFixture,
  type BrowserFixture,
} from '../browser/fixtures'
import { percentile, roundMilliseconds } from '../browser/statistics'

const LINE_COUNT = 30_000
const TARGET_EVERY = 10
const DEFAULT_SAMPLE_COUNT = 30
const DEFAULT_WARMUP_BLOCKS = 2
const ABBA_BLOCK = ['A', 'B', 'B', 'A'] as const
const RAW_LIST_SELECTOR = '[aria-label="完整原始日志"]'
const RESULT_LIST_SELECTOR = '[aria-label="翻译结果"]'

type Variant = (typeof ABBA_BLOCK)[number]

interface VariantDefinition {
  id: Variant
  label: string
  rightRendering: 'full' | 'virtual'
  query: string
}

const VARIANTS: Record<Variant, VariantDefinition> = {
  A: {
    id: 'A',
    label: '左侧虚拟化、右侧完整渲染',
    rightRendering: 'full',
    query: '?__srlw_benchmark_right=full',
  },
  B: {
    id: 'B',
    label: '左右双侧虚拟化',
    rightRendering: 'virtual',
    query: '?__srlw_benchmark_right=virtual',
  },
}

interface LongTaskState {
  supported: boolean
  durationsMs: number[]
}

interface RawSample {
  ordinal: number
  sequenceIndex: number
  variant: Variant
  targetFileName: string
  elapsedMs: number
  leftRenderedDomCount: number
  rightRenderedDomCount: number
  totalElementCount: number
  longTaskSupported: boolean
  longTaskDurationsMs: number[]
}

interface VariantSummary {
  variant: Variant
  label: string
  rightRendering: 'full' | 'virtual'
  samples: number
  rawValuesMs: number[]
  medianMs: number
  p95Ms: number
  minMs: number
  maxMs: number
  rightRenderedDomCounts: number[]
  rightRenderedDomCountMin: number
  rightRenderedDomCountMax: number
  longTaskSupported: boolean
  longTaskSampleCount: number
  rawLongTaskDurationsMsBySample: number[][]
}

interface SourceRevision {
  gitCommit: string | null
  sourceFilesSha256: string
  sourceFiles: string[]
}

function positiveIntegerEnvironment(name: string, fallback: number): number {
  const rawValue = process.env[name]
  if (rawValue === undefined) return fallback
  const value = Number(rawValue)
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive safe integer`)
  }
  return value
}

function gitCommit(): string | null {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return null
  }
}

async function sourceRevision(): Promise<SourceRevision> {
  const workspaceRoot = fileURLToPath(new URL('../../', import.meta.url))
  const sourceFiles = [
    'apps/web/src/features/log-workspace/LogWorkspace.vue',
    'apps/web/src/features/log-workspace/ResultCommandRow.vue',
    'apps/web/src/features/log-workspace/SessionTabs.vue',
    'apps/web/src/stores/workspace.ts',
    'packages/virtual-list/src/FixedVirtualList.vue',
    'benchmarks/browser/fixtures.ts',
    'benchmarks/tab-switch/run.ab.spec.ts',
  ]
  const hash = createHash('sha256')
  for (const sourceFile of sourceFiles) {
    const absolutePath = resolve(workspaceRoot, sourceFile)
    hash.update(sourceFile)
    hash.update('\0')
    hash.update(await readFile(absolutePath))
    hash.update('\0')
  }
  return {
    gitCommit: gitCommit(),
    sourceFilesSha256: `sha256:${hash.digest('hex')}`,
    sourceFiles: sourceFiles.map((sourceFile) =>
      relative(workspaceRoot, resolve(workspaceRoot, sourceFile)).replaceAll('\\', '/'),
    ),
  }
}

async function loadCatalogVersion(): Promise<string> {
  const protocolFiles = [
    new URL('../../packages/protocol-schema/protocols/single.json', import.meta.url),
    new URL('../../packages/protocol-schema/protocols/multi.json', import.meta.url),
  ]
  const rawBundles = await Promise.all(
    protocolFiles.map(async (fileUrl) =>
      JSON.parse(await readFile(fileUrl, 'utf8')) as unknown,
    ),
  )
  return deriveCatalogVersion(protocolBundlesSchema.parse(rawBundles))
}

function filePayload(fixture: BrowserFixture) {
  return {
    name: fixture.fileName,
    mimeType: 'text/plain',
    buffer: Buffer.from(fixture.rawText, 'utf8'),
  }
}

async function afterTwoAnimationFrames(page: Page): Promise<void> {
  await page.evaluate(
    () => new Promise<void>((resolveFrame) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolveFrame()))
    }),
  )
}

async function prepareVariantPage(
  context: BrowserContext,
  definition: VariantDefinition,
  fixtures: readonly [BrowserFixture, BrowserFixture],
  catalogVersion: string,
): Promise<Page> {
  const page = await context.newPage()
  await page.goto(`/${definition.query}`)
  await expect(page.getByTestId('file-input')).toBeAttached()
  await expect(page.locator('.meta-item code')).toHaveAttribute('title', catalogVersion)
  await expect(page.locator('.bootstrap-error')).toHaveCount(0)
  await page.getByTestId('file-input').setInputFiles(fixtures.map(filePayload))
  await expect(page.locator('.session-tab .session-status.is-ready')).toHaveCount(2)
  await expect(page.locator('.session-tab.is-active .session-name'))
    .toHaveText(fixtures[1].fileName)
  await expect(page.locator('[data-testid="log-workspace"] .workspace-heading h2'))
    .toHaveText(fixtures[1].fileName)

  const resultList = page.locator(RESULT_LIST_SELECTOR)
  await expect(resultList).toBeVisible()
  await expect(resultList).toHaveAttribute('data-rendering-mode', definition.rightRendering)
  if (definition.rightRendering === 'full') {
    await expect(resultList.locator('.command-row')).toHaveCount(fixtures[1].targetLineCount)
  } else {
    await expect(resultList.locator('.command-row').first()).toBeVisible()
  }
  await afterTwoAnimationFrames(page)
  return page
}

async function startLongTaskObservation(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    type BrowserState = {
      entries: Array<{ startTime: number; duration: number }>
      observer: PerformanceObserver
    }
    const benchmarkWindow = window as typeof window & {
      __rltTabAbLongTaskState?: BrowserState
    }
    benchmarkWindow.__rltTabAbLongTaskState?.observer.disconnect()
    delete benchmarkWindow.__rltTabAbLongTaskState

    if (!PerformanceObserver.supportedEntryTypes.includes('longtask')) return false
    const entries: BrowserState['entries'] = []
    const observer = new PerformanceObserver((entryList) => {
      entryList.getEntries().forEach((entry) => {
        entries.push({ startTime: entry.startTime, duration: entry.duration })
      })
    })
    observer.observe({ type: 'longtask', buffered: false })
    benchmarkWindow.__rltTabAbLongTaskState = { entries, observer }
    return true
  })
}

async function finishLongTaskObservation(
  page: Page,
  supported: boolean,
  startedAt: number,
  endedAt: number,
): Promise<LongTaskState> {
  if (!supported) return { supported: false, durationsMs: [] }

  await page.evaluate(() => new Promise<void>((resolveTask) => setTimeout(resolveTask, 0)))
  const durationsMs = await page.evaluate(({ start, end }) => {
    type BrowserState = {
      entries: Array<{ startTime: number; duration: number }>
      observer: PerformanceObserver
    }
    const benchmarkWindow = window as typeof window & {
      __rltTabAbLongTaskState?: BrowserState
    }
    const state = benchmarkWindow.__rltTabAbLongTaskState
    if (state === undefined) return []

    state.observer.takeRecords().forEach((entry) => {
      state.entries.push({ startTime: entry.startTime, duration: entry.duration })
    })
    state.observer.disconnect()
    delete benchmarkWindow.__rltTabAbLongTaskState
    return state.entries
      .filter((entry) => entry.startTime >= start - 1 && entry.startTime <= end)
      .map((entry) => entry.duration)
  }, { start: startedAt, end: endedAt })
  return { supported: true, durationsMs }
}

async function measureSwitch(
  page: Page,
  definition: VariantDefinition,
): Promise<Omit<RawSample, 'ordinal' | 'sequenceIndex' | 'variant'>> {
  // requestAnimationFrame is throttled for background pages. Bringing the
  // scheduled variant forward happens outside the measured window and avoids
  // confounding the virtualization treatment with tab visibility.
  await page.bringToFront()
  const longTaskSupported = await startLongTaskObservation(page)
  const timing = await page.evaluate(async ({ expectedRendering, resultSelector, rawSelector }) => {
    const activeName = document.querySelector<HTMLElement>(
      '.session-tab.is-active .session-name',
    )?.textContent?.trim()
    const tabs = [...document.querySelectorAll<HTMLElement>('.session-tab')]
    const targetTab = tabs.find((tab) =>
      tab.querySelector<HTMLElement>('.session-name')?.textContent?.trim() !== activeName,
    )
    const targetName = targetTab
      ?.querySelector<HTMLElement>('.session-name')
      ?.textContent
      ?.trim()
    const button = targetTab?.querySelector<HTMLButtonElement>('.session-tab-main')
    if (!button || targetName === undefined) {
      throw new Error('Could not resolve the inactive benchmark tab')
    }

    const startedAt = performance.now()
    button.click()
    let rightRenderedDomCount = 0
    let leftRenderedDomCount = 0
    let ready = false
    for (let frame = 0; frame < 120; frame += 1) {
      await new Promise<void>((resolveFrame) => requestAnimationFrame(() => resolveFrame()))
      const heading = document.querySelector<HTMLElement>(
        '[data-testid="log-workspace"] .workspace-heading h2',
      )
      const resultList = document.querySelector<HTMLElement>(resultSelector)
      const rawList = document.querySelector<HTMLElement>(rawSelector)
      rightRenderedDomCount = resultList?.querySelectorAll('.command-row').length ?? 0
      leftRenderedDomCount = rawList
        ?.querySelectorAll('[data-testid="virtual-list-item"]').length ?? 0
      const renderedCount = Number(resultList?.dataset.renderedCount)
      ready =
        heading?.textContent?.trim() === targetName &&
        resultList?.dataset.renderingMode === expectedRendering &&
        rightRenderedDomCount > 0 &&
        renderedCount === rightRenderedDomCount &&
        leftRenderedDomCount > 0
      if (ready) break
    }
    if (!ready) throw new Error(`Tab ${targetName} did not reach the measured ready state`)

    await new Promise<void>((resolveFrame) => requestAnimationFrame(() => resolveFrame()))
    const endedAt = performance.now()
    return {
      targetFileName: targetName,
      startedAt,
      endedAt,
      elapsedMs: endedAt - startedAt,
      leftRenderedDomCount,
      rightRenderedDomCount,
      totalElementCount: document.getElementsByTagName('*').length,
    }
  }, {
    expectedRendering: definition.rightRendering,
    resultSelector: RESULT_LIST_SELECTOR,
    rawSelector: RAW_LIST_SELECTOR,
  })
  const longTasks = await finishLongTaskObservation(
    page,
    longTaskSupported,
    timing.startedAt,
    timing.endedAt,
  )
  return {
    targetFileName: timing.targetFileName,
    elapsedMs: roundMilliseconds(timing.elapsedMs),
    leftRenderedDomCount: timing.leftRenderedDomCount,
    rightRenderedDomCount: timing.rightRenderedDomCount,
    totalElementCount: timing.totalElementCount,
    longTaskSupported: longTasks.supported,
    longTaskDurationsMs: longTasks.durationsMs.map(roundMilliseconds),
  }
}

function buildSequence(samplesPerVariant: number): Variant[] {
  if (samplesPerVariant % 2 !== 0) {
    throw new Error('SRLW_TAB_AB_SAMPLES must be even so complete ABBA blocks stay balanced')
  }
  return Array.from(
    { length: samplesPerVariant / 2 },
    () => [...ABBA_BLOCK],
  ).flat()
}

function summarizeVariant(samples: readonly RawSample[], definition: VariantDefinition): VariantSummary {
  const variantSamples = samples.filter(({ variant }) => variant === definition.id)
  const rawValuesMs = variantSamples.map(({ elapsedMs }) => elapsedMs)
  const rightRenderedDomCounts = variantSamples.map(({ rightRenderedDomCount }) => rightRenderedDomCount)
  return {
    variant: definition.id,
    label: definition.label,
    rightRendering: definition.rightRendering,
    samples: variantSamples.length,
    rawValuesMs,
    medianMs: percentile(rawValuesMs, 0.5),
    p95Ms: percentile(rawValuesMs, 0.95),
    minMs: roundMilliseconds(Math.min(...rawValuesMs)),
    maxMs: roundMilliseconds(Math.max(...rawValuesMs)),
    rightRenderedDomCounts,
    rightRenderedDomCountMin: Math.min(...rightRenderedDomCounts),
    rightRenderedDomCountMax: Math.max(...rightRenderedDomCounts),
    longTaskSupported: variantSamples.every(({ longTaskSupported }) => longTaskSupported),
    longTaskSampleCount: variantSamples.filter(({ longTaskDurationsMs }) =>
      longTaskDurationsMs.length > 0,
    ).length,
    rawLongTaskDurationsMsBySample: variantSamples.map(({ longTaskDurationsMs }) =>
      longTaskDurationsMs,
    ),
  }
}

test('same-run one-sided versus two-sided virtualization tab-switch A/B', async ({
  context,
  browserName,
}, testInfo) => {
  const sampleCount = positiveIntegerEnvironment('SRLW_TAB_AB_SAMPLES', DEFAULT_SAMPLE_COUNT)
  const warmupBlocks = positiveIntegerEnvironment(
    'SRLW_TAB_AB_WARMUP_BLOCKS',
    DEFAULT_WARMUP_BLOCKS,
  )
  if (sampleCount < 30) {
    throw new Error('SRLW_TAB_AB_SAMPLES must be at least 30 per variant')
  }
  if (warmupBlocks * 2 < 3) {
    throw new Error('Warmup configuration must provide at least three runs per variant')
  }

  const seed = positiveIntegerEnvironment('SRLW_TAB_AB_SEED', DEFAULT_BROWSER_BENCHMARK_SEED)
  const fixtures = [
    generateBrowserFixture({
      lineCount: LINE_COUNT,
      targetEvery: TARGET_EVERY,
      seed,
      processType: 'single',
    }),
    generateBrowserFixture({
      lineCount: LINE_COUNT,
      targetEvery: TARGET_EVERY,
      seed: seed + 1,
      processType: 'multi',
    }),
  ] as const
  for (const fixture of fixtures) {
    expect(fixture.targetLineCount).toBe(3_000)
  }

  const catalogVersion = await loadCatalogVersion()
  const pageA = await prepareVariantPage(context, VARIANTS.A, fixtures, catalogVersion)
  const pageB = await prepareVariantPage(context, VARIANTS.B, fixtures, catalogVersion)
  const pages: Record<Variant, Page> = { A: pageA, B: pageB }

  const warmupSequence = Array.from({ length: warmupBlocks }, () => [...ABBA_BLOCK]).flat()
  for (const variant of warmupSequence) {
    await measureSwitch(pages[variant], VARIANTS[variant])
  }

  const sequence = buildSequence(sampleCount)
  const rawSamples: RawSample[] = []
  for (const [sequenceIndex, variant] of sequence.entries()) {
    const measurement = await measureSwitch(pages[variant], VARIANTS[variant])
    rawSamples.push({
      ordinal: rawSamples.filter((sample) => sample.variant === variant).length + 1,
      sequenceIndex,
      variant,
      ...measurement,
    })
  }

  const summaryA = summarizeVariant(rawSamples, VARIANTS.A)
  const summaryB = summarizeVariant(rawSamples, VARIANTS.B)
  expect(summaryA.samples).toBe(sampleCount)
  expect(summaryB.samples).toBe(sampleCount)
  expect(summaryA.rightRenderedDomCountMin).toBe(3_000)
  expect(summaryA.rightRenderedDomCountMax).toBe(3_000)
  expect(summaryB.rightRenderedDomCountMax).toBeLessThan(3_000)

  const timestamp = new Date().toISOString()
  const viewport = pageA.viewportSize()
  if (viewport === null) throw new Error('A/B benchmark requires a fixed viewport')
  const cpuModel = cpus()[0]?.model ?? null
  const browser = context.browser()
  if (browser === null) throw new Error('Browser context is detached')
  const medianReductionMs = roundMilliseconds(summaryA.medianMs - summaryB.medianMs)
  const p95ReductionMs = roundMilliseconds(summaryA.p95Ms - summaryB.p95Ms)
  const report = {
    schemaVersion: 1,
    generatedAt: timestamp,
    syntheticDataOnly: true,
    historicalProductionData: false,
    purpose:
      'Current privacy-safe reconstruction: same-run A/B of historical one-sided versus corrected two-sided list virtualization.',
    productionDefaultUnchanged: true,
    environment: {
      browser: `${browserName} ${browser.version()}`,
      browserChannel: process.env.SRLW_TAB_AB_BROWSER_CHANNEL ?? 'chrome',
      node: process.version,
      os: `${platform()} ${release()}`,
      cpu: cpuModel,
      viewport,
    },
    sourceRevision: await sourceRevision(),
    catalogVersion,
    fixture: {
      seed,
      secondSeed: seed + 1,
      lineCountPerSession: LINE_COUNT,
      targetEvery: TARGET_EVERY,
      targetResultCountPerSession: fixtures[0].targetLineCount,
      sessionCountPerVariant: 2,
      files: fixtures.map(({ fileName, processType, lineCount, targetLineCount }) => ({
        fileName,
        processType,
        lineCount,
        targetLineCount,
      })),
    },
    design: {
      variantA: VARIANTS.A,
      variantB: VARIANTS.B,
      sharedResultRowComponent:
        'apps/web/src/features/log-workspace/ResultCommandRow.vue',
      order: 'ABBA repeated',
      sequence,
      samplesPerVariant: sampleCount,
      warmupRunsPerVariant: warmupBlocks * 2,
      sessionsParsedBeforeMeasurement: true,
      pageBroughtToFrontBeforeEachSample: true,
      measurementBoundary:
        'performance.now() immediately before inactive tab click through heading/list commit and two requestAnimationFrame boundaries.',
      excludedFromTiming: ['file read', 'SHA-256 deduplication', 'log parsing'],
    },
    rawSamples,
    summaries: [summaryA, summaryB],
    comparison: {
      baseline: 'A',
      candidate: 'B',
      medianReductionMs,
      medianReductionPercent: roundMilliseconds(
        (medianReductionMs / summaryA.medianMs) * 100,
      ),
      p95ReductionMs,
      p95ReductionPercent: roundMilliseconds(
        (p95ReductionMs / summaryA.p95Ms) * 100,
      ),
      interpretationBoundary:
        'This is a controlled result on the recorded machine and synthetic reconstruction, not an internship production measurement or a universal speedup claim.',
    },
    exclusions: {
      fps: 'not measured',
      memory: 'not measured',
      historicalInternshipBuild: 'not available for direct measurement',
    },
  }

  const outputDirectory = resolve(
    process.env.SRLW_TAB_AB_OUTPUT_DIR ??
      fileURLToPath(new URL('./results/', import.meta.url)),
  )
  await mkdir(outputDirectory, { recursive: true })
  const safeTimestamp = timestamp.replace(/[:.]/gu, '-')
  const outputPath = join(outputDirectory, `tab-switch-ab-${safeTimestamp}.json`)
  const serializedReport = `${JSON.stringify(report, null, 2)}\n`
  await writeFile(outputPath, serializedReport, 'utf8')
  await testInfo.attach('tab-switch-ab-results', {
    body: Buffer.from(serializedReport, 'utf8'),
    contentType: 'application/json',
  })
  console.log(`Wrote same-run tab-switch A/B report to ${outputPath}`)
})
