import { expect, test, type Locator, type Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { cpus, platform, release } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  deriveCatalogVersion,
  protocolBundlesSchema,
} from '@srlw/protocol-schema'

import {
  DEFAULT_BROWSER_BENCHMARK_SEED,
  DEFAULT_BROWSER_BENCHMARK_SIZES,
  STRESS_BROWSER_BENCHMARK_SIZE,
  generateBrowserFixture,
  type BrowserFixture,
} from './fixtures'
import { percentile, roundMilliseconds } from './statistics'
import type {
  BrowserBenchmarkOperation,
  BrowserBenchmarkRecord,
  BrowserBenchmarkReport,
  BrowserPhaseSample,
  LongTaskSample,
  RenderedListMetrics,
  StructuralMetricsSample,
} from './types'

const RAW_LIST_SELECTOR = '[aria-label="完整原始日志"]'
const RESULT_LIST_SELECTOR = '[aria-label="翻译结果"]'
const LEFT_ITEM_HEIGHT = 32
const LEFT_OVERSCAN = 8
const RIGHT_ITEM_HEIGHT = 76
const RIGHT_OVERSCAN = 5

interface TimedOperation {
  elapsedMs: number
  startedAt: number
  endedAt: number
}

interface LocateOperation extends TimedOperation {
  rawLineIndex: number
}

interface MeasurementSample {
  timing: TimedOperation
  structure: StructuralMetricsSample
  longTasks: LongTaskSample
  phases?: BrowserPhaseSample
}

interface LocateMeasurementSample extends MeasurementSample {
  timing: LocateOperation
}

interface RunEnvironment {
  timestamp: string
  catalogVersion: string
  browser: string
  browserChannel: string
  os: string
  cpu?: string
  gitCommit?: string
  viewport: { width: number; height: number }
}

interface RecordInput {
  operation: BrowserBenchmarkOperation
  fixture: string
  fixtureSeed: number
  lineCount: number
  targetLineCount: number
  samples: readonly MeasurementSample[]
  warmupRuns: number
  notes: string
  locatedRawLineIndexes?: number[]
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

function nonNegativeIntegerEnvironment(name: string, fallback: number): number {
  const rawValue = process.env[name]
  if (rawValue === undefined) return fallback
  const value = Number(rawValue)
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative safe integer`)
  }
  return value
}

function benchmarkSizes(): number[] {
  const explicitSizes = process.env.SRLW_BENCH_SIZES
  const sizes = explicitSizes === undefined
    ? [...DEFAULT_BROWSER_BENCHMARK_SIZES]
    : explicitSizes.split(',').map((rawValue) => {
        const value = Number(rawValue.trim())
        if (!Number.isSafeInteger(value) || value < 1) {
          throw new Error('SRLW_BENCH_SIZES must be a comma-separated list of positive integers')
        }
        return value
      })

  if (
    process.env.SRLW_BENCH_INCLUDE_STRESS === '1' &&
    !sizes.includes(STRESS_BROWSER_BENCHMARK_SIZE)
  ) {
    sizes.push(STRESS_BROWSER_BENCHMARK_SIZE)
  }
  return sizes
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

async function loadActualProtocolBundles() {
  const protocolFiles = [
    new URL('../../packages/protocol-schema/protocols/single.json', import.meta.url),
    new URL('../../packages/protocol-schema/protocols/multi.json', import.meta.url),
  ]
  const rawBundles = await Promise.all(
    protocolFiles.map(async (fileUrl) => JSON.parse(await readFile(fileUrl, 'utf8')) as unknown),
  )
  return protocolBundlesSchema.parse(rawBundles)
}

function benchmarkKind(operation: BrowserBenchmarkOperation): BrowserBenchmarkRecord['benchmark'] {
  if (operation === 'import-to-ready') return 'initial-render'
  if (operation === 'switch-active-tab-to-visible') return 'tab-switch'
  return 'scroll'
}

function createRecord(environment: RunEnvironment, input: RecordInput): BrowserBenchmarkRecord {
  const rawValuesMs = input.samples.map(({ timing }) => roundMilliseconds(timing.elapsedMs))
  const rawLongTaskDurationsMsBySample = input.samples.map(({ longTasks }) =>
    longTasks.rawDurationsMs.map(roundMilliseconds),
  )
  const phaseSamples = input.samples.flatMap(({ phases }) =>
    phases === undefined
      ? []
      : [{
          fileReadMs: roundMilliseconds(phases.fileReadMs),
          parseMs: roundMilliseconds(phases.parseMs),
          uploadToFirstResultMs: roundMilliseconds(phases.uploadToFirstResultMs),
        }],
  )
  const phaseEvidence = phaseSamples.length === input.samples.length
    ? {
        phaseSamples,
        phaseSummary: {
          fileReadMs: summarizePhase(phaseSamples.map(({ fileReadMs }) => fileReadMs)),
          parseMs: summarizePhase(phaseSamples.map(({ parseMs }) => parseMs)),
          uploadToFirstResultMs: summarizePhase(
            phaseSamples.map(({ uploadToFirstResultMs }) => uploadToFirstResultMs),
          ),
        },
      }
    : {}

  return {
    benchmark: benchmarkKind(input.operation),
    operation: input.operation,
    timestamp: environment.timestamp,
    catalogVersion: environment.catalogVersion,
    browser: environment.browser,
    browserChannel: environment.browserChannel,
    os: environment.os,
    ...(environment.cpu === undefined ? {} : { cpu: environment.cpu }),
    ...(environment.gitCommit === undefined ? {} : { gitCommit: environment.gitCommit }),
    viewport: environment.viewport,
    fixture: input.fixture,
    fixtureSeed: input.fixtureSeed,
    lineCount: input.lineCount,
    targetLineCount: input.targetLineCount,
    stressScale: input.lineCount >= STRESS_BROWSER_BENCHMARK_SIZE,
    samples: input.samples.length,
    warmupRuns: input.warmupRuns,
    rawValuesMs,
    medianMs: percentile(rawValuesMs, 0.5),
    p95Ms: percentile(rawValuesMs, 0.95),
    structuralSamples: input.samples.map(({ structure }) => structure),
    ...(input.locatedRawLineIndexes === undefined
      ? {}
      : { locatedRawLineIndexes: input.locatedRawLineIndexes }),
    longTaskSupported: input.samples.every(({ longTasks }) => longTasks.supported),
    rawLongTaskDurationsMsBySample,
    ...phaseEvidence,
    notes: input.notes,
  }
}

function summarizePhase(values: readonly number[]): { medianMs: number; p95Ms: number } {
  return {
    medianMs: percentile(values, 0.5),
    p95Ms: percentile(values, 0.95),
  }
}

async function afterTwoAnimationFrames(page: Page): Promise<void> {
  await page.evaluate(
    () => new Promise<void>((resolveFrame) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolveFrame()))
    }),
  )
}

async function startLongTaskObservation(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    type LongTaskState = {
      entries: Array<{ startTime: number; duration: number }>
      observer: PerformanceObserver
    }
    const benchmarkWindow = window as typeof window & {
      __rltLongTaskState?: LongTaskState
    }
    benchmarkWindow.__rltLongTaskState?.observer.disconnect()
    delete benchmarkWindow.__rltLongTaskState

    if (!PerformanceObserver.supportedEntryTypes.includes('longtask')) {
      return false
    }

    const entries: LongTaskState['entries'] = []
    const observer = new PerformanceObserver((entryList) => {
      entryList.getEntries().forEach((entry) => {
        entries.push({ startTime: entry.startTime, duration: entry.duration })
      })
    })
    observer.observe({ type: 'longtask', buffered: false })
    benchmarkWindow.__rltLongTaskState = { entries, observer }
    return true
  })
}

async function finishLongTaskObservation(
  page: Page,
  supported: boolean,
  timing: TimedOperation,
): Promise<LongTaskSample> {
  if (!supported) return { supported: false, rawDurationsMs: [] }

  const rawDurationsMs = await page.evaluate(({ startedAt, endedAt }) => {
    type LongTaskState = {
      entries: Array<{ startTime: number; duration: number }>
      observer: PerformanceObserver
    }
    const benchmarkWindow = window as typeof window & {
      __rltLongTaskState?: LongTaskState
    }
    const state = benchmarkWindow.__rltLongTaskState
    if (state === undefined) return []

    state.observer.takeRecords().forEach((entry) => {
      state.entries.push({ startTime: entry.startTime, duration: entry.duration })
    })
    state.observer.disconnect()
    delete benchmarkWindow.__rltLongTaskState

    return state.entries
      .filter((entry) => entry.startTime >= startedAt && entry.startTime <= endedAt)
      .map((entry) => entry.duration)
  }, timing)

  return { supported: true, rawDurationsMs }
}

async function readListMetrics(
  locator: Locator,
  itemHeight: number,
  overscan: number,
): Promise<RenderedListMetrics> {
  const metrics = await locator.evaluate(
    (element, geometry) => ({
      renderedAttributeCount: Number(element.dataset.renderedCount),
      renderedDomCount: element.querySelectorAll('[data-testid="virtual-list-item"]').length,
      renderedUpperBound: Math.ceil(element.clientHeight / geometry.itemHeight) + geometry.overscan * 2 + 2,
      visibleStart: Number(element.dataset.visibleStart),
      visibleEnd: Number(element.dataset.visibleEnd),
      viewportHeight: element.clientHeight,
      scrollTop: element.scrollTop,
      scrollHeight: element.scrollHeight,
    }),
    { itemHeight, overscan },
  )

  if (metrics.renderedAttributeCount !== metrics.renderedDomCount) {
    throw new Error('Rendered-count attribute does not match the actual virtual item DOM count')
  }
  if (metrics.renderedDomCount > metrics.renderedUpperBound) {
    throw new Error(
      `Virtual list rendered ${metrics.renderedDomCount} items, above structural bound ${metrics.renderedUpperBound}`,
    )
  }
  if (metrics.visibleEnd - metrics.visibleStart !== metrics.renderedDomCount) {
    throw new Error('Visible range does not match the rendered virtual item count')
  }
  return metrics
}

async function captureStructuralMetrics(page: Page): Promise<StructuralMetricsSample> {
  return {
    left: await readListMetrics(
      page.locator(RAW_LIST_SELECTOR),
      LEFT_ITEM_HEIGHT,
      LEFT_OVERSCAN,
    ),
    right: await readListMetrics(
      page.locator(RESULT_LIST_SELECTOR),
      RIGHT_ITEM_HEIGHT,
      RIGHT_OVERSCAN,
    ),
  }
}

async function openCleanApplication(page: Page, catalogVersion: string): Promise<void> {
  await page.goto('/')
  await expect(page.getByTestId('file-input')).toBeAttached()
  await expect(page.locator('.meta-item code')).toHaveAttribute('title', catalogVersion)
  await expect(page.locator('.bootstrap-error')).toHaveCount(0)
}

function filePayload(fixture: BrowserFixture) {
  return {
    name: fixture.fileName,
    mimeType: 'text/plain',
    buffer: Buffer.from(fixture.rawText, 'utf8'),
  }
}

async function waitForFixtureReady(page: Page, fixture: BrowserFixture): Promise<void> {
  await expect(page.locator('[data-testid="log-workspace"] .workspace-heading h2'))
    .toHaveText(fixture.fileName)
  await expect(page.locator('.session-tab.is-active .session-status.is-ready')).toBeVisible()
  await expect(page.locator(RAW_LIST_SELECTOR)).toBeVisible()
  await expect(page.locator(RESULT_LIST_SELECTOR)).toBeVisible()
  await expect(page.locator('.summary-strip > div').first().locator('strong'))
    .toHaveText(String(fixture.lineCount))
  await expect(page.locator('.summary-strip > div').nth(1).locator('strong'))
    .toHaveText(String(fixture.targetLineCount))
  await afterTwoAnimationFrames(page)
}

async function measureInitialImport(
  page: Page,
  fixture: BrowserFixture,
  catalogVersion: string,
): Promise<MeasurementSample> {
  await openCleanApplication(page, catalogVersion)
  const longTaskSupported = await startLongTaskObservation(page)
  const startedAt = await page.evaluate(() => performance.now())
  await page.getByTestId('file-input').setInputFiles(filePayload(fixture))
  await waitForFixtureReady(page, fixture)
  const endedAt = await page.evaluate(() => performance.now())
  const timing = { startedAt, endedAt, elapsedMs: endedAt - startedAt }
  const phases = await page.evaluate(() => {
    const duration = (name: string): number => {
      const entry = performance.getEntriesByName(name, 'measure').at(-1)
      if (entry === undefined) throw new Error(`Missing application measure: ${name}`)
      return entry.duration
    }
    return {
      fileReadMs: duration('file_read_ms'),
      parseMs: duration('parse_ms'),
      uploadToFirstResultMs: duration('upload_to_first_result_ms'),
    }
  })
  return {
    timing,
    phases,
    structure: await captureStructuralMetrics(page),
    longTasks: await finishLongTaskObservation(page, longTaskSupported, timing),
  }
}

async function measureProgrammaticScroll(
  page: Page,
  selector: string,
  fraction: number,
): Promise<MeasurementSample> {
  const longTaskSupported = await startLongTaskObservation(page)
  const timing = await page.evaluate(async ({ listSelector, targetFraction }) => {
    const element = document.querySelector<HTMLElement>(listSelector)
    if (element === null) throw new Error(`Virtual list not found: ${listSelector}`)
    const startedAt = performance.now()
    element.scrollTop = (element.scrollHeight - element.clientHeight) * targetFraction
    element.dispatchEvent(new Event('scroll'))
    await new Promise<void>((resolveFrame) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolveFrame()))
    })
    const endedAt = performance.now()
    return { startedAt, endedAt, elapsedMs: endedAt - startedAt }
  }, { listSelector: selector, targetFraction: fraction })

  return {
    timing,
    structure: await captureStructuralMetrics(page),
    longTasks: await finishLongTaskObservation(page, longTaskSupported, timing),
  }
}

async function prepareLocateTarget(page: Page, fraction: number): Promise<void> {
  await page.evaluate(async ({ listSelector, targetFraction }) => {
    const element = document.querySelector<HTMLElement>(listSelector)
    if (element === null) throw new Error('Result virtual list was not found')
    element.scrollTop = (element.scrollHeight - element.clientHeight) * targetFraction
    element.dispatchEvent(new Event('scroll'))
    await new Promise<void>((resolveFrame) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolveFrame()))
    })
  }, { listSelector: RESULT_LIST_SELECTOR, targetFraction: fraction })
}

async function measureLocate(
  page: Page,
  fraction: number,
): Promise<LocateMeasurementSample> {
  await prepareLocateTarget(page, fraction)
  const longTaskSupported = await startLongTaskObservation(page)
  const timing = await page.evaluate(async ({ rawSelector, resultSelector }) => {
    const resultList = document.querySelector<HTMLElement>(resultSelector)
    if (resultList === null) throw new Error('Result virtual list was not found')
    const buttons = [...resultList.querySelectorAll<HTMLButtonElement>('.command-row')]
    const button = buttons[Math.floor(buttons.length / 2)]
    if (button === undefined) throw new Error('No rendered result command is available for locate')
    const commandId = button.dataset.commandId
    const rawLineIndex = commandId?.startsWith('line-')
      ? Number(commandId.slice('line-'.length))
      : Number.NaN
    if (!Number.isSafeInteger(rawLineIndex)) throw new Error('Command id does not contain a raw line index')

    const startedAt = performance.now()
    button.click()
    let located = false
    for (let frame = 0; frame < 120; frame += 1) {
      await new Promise<void>((resolveFrame) => requestAnimationFrame(() => resolveFrame()))
      const rawList = document.querySelector<HTMLElement>(rawSelector)
      const target = rawList?.querySelector<HTMLElement>(`[data-raw-line-index="${rawLineIndex}"]`)
      const visibleStart = Number(rawList?.dataset.visibleStart)
      const visibleEnd = Number(rawList?.dataset.visibleEnd)
      located =
        target?.classList.contains('is-highlighted') === true &&
        rawLineIndex >= visibleStart &&
        rawLineIndex < visibleEnd
      if (located) break
    }
    if (!located) throw new Error(`Raw line ${rawLineIndex} did not become visible and highlighted`)
    const endedAt = performance.now()
    return { startedAt, endedAt, elapsedMs: endedAt - startedAt, rawLineIndex }
  }, { rawSelector: RAW_LIST_SELECTOR, resultSelector: RESULT_LIST_SELECTOR })

  return {
    timing,
    structure: await captureStructuralMetrics(page),
    longTasks: await finishLongTaskObservation(page, longTaskSupported, timing),
  }
}

async function importTabPair(
  page: Page,
  first: BrowserFixture,
  second: BrowserFixture,
  catalogVersion: string,
): Promise<void> {
  await openCleanApplication(page, catalogVersion)
  await page.getByTestId('file-input').setInputFiles([
    filePayload(first),
    filePayload(second),
  ])
  await waitForFixtureReady(page, second)
  await expect(page.locator('.session-tab .session-status.is-ready')).toHaveCount(2)
}

async function measureTabSwitch(
  page: Page,
  targetFileName: string,
): Promise<MeasurementSample> {
  const longTaskSupported = await startLongTaskObservation(page)
  const timing = await page.evaluate(async (fileName) => {
    const names = [...document.querySelectorAll<HTMLElement>('.session-name')]
    const nameElement = names.find((element) => element.title === fileName)
    const button = nameElement
      ?.closest<HTMLElement>('.session-tab')
      ?.querySelector<HTMLButtonElement>('.session-tab-main')
    if (button === null || button === undefined) throw new Error(`Tab not found for ${fileName}`)

    const startedAt = performance.now()
    button.click()
    let visible = false
    for (let frame = 0; frame < 120; frame += 1) {
      await new Promise<void>((resolveFrame) => requestAnimationFrame(() => resolveFrame()))
      const heading = document.querySelector<HTMLElement>('[data-testid="log-workspace"] .workspace-heading h2')
      const resultList = document.querySelector<HTMLElement>('[aria-label="翻译结果"]')
      visible = heading?.textContent?.trim() === fileName && resultList !== null
      if (visible) break
    }
    if (!visible) throw new Error(`Tab ${fileName} did not become visible`)
    const endedAt = performance.now()
    return { startedAt, endedAt, elapsedMs: endedAt - startedAt }
  }, targetFileName)

  return {
    timing,
    structure: await captureStructuralMetrics(page),
    longTasks: await finishLongTaskObservation(page, longTaskSupported, timing),
  }
}

test.describe.configure({ mode: 'serial' })

test('records reproducible browser rendering, tab, scroll, and locate samples', async ({
  browser,
  browserName,
  page,
}, testInfo) => {
  test.setTimeout(30 * 60 * 1_000)

  const bundles = await loadActualProtocolBundles()
  const catalogVersion = await deriveCatalogVersion(bundles)
  const timestamp = new Date().toISOString()
  const viewport = page.viewportSize()
  if (viewport === null) throw new Error('Benchmark requires a fixed viewport')
  const cpuModel = cpus()[0]?.model
  const commit = gitCommit()

  const environment: RunEnvironment = {
    timestamp,
    catalogVersion,
    browser: `${browserName} ${browser.version()}`,
    browserChannel: process.env.SRLW_BENCH_BROWSER_CHANNEL ?? 'chrome',
    os: `${platform()} ${release()}`,
    ...(cpuModel === undefined ? {} : { cpu: cpuModel }),
    ...(commit === undefined ? {} : { gitCommit: commit }),
    viewport,
  }

  const sampleCount = positiveIntegerEnvironment('SRLW_BENCH_SAMPLES', 5)
  const warmupRuns = nonNegativeIntegerEnvironment('SRLW_BENCH_WARMUP', 1)
  const fixtureSeed = positiveIntegerEnvironment(
    'SRLW_BENCH_SEED',
    DEFAULT_BROWSER_BENCHMARK_SEED,
  )
  const records: BrowserBenchmarkRecord[] = []

  for (const lineCount of benchmarkSizes()) {
    const fixture = generateBrowserFixture({
      lineCount,
      seed: fixtureSeed,
      processType: 'single',
    })

    for (let warmup = 0; warmup < warmupRuns; warmup += 1) {
      await measureInitialImport(page, fixture, catalogVersion)
    }
    const initialSamples: MeasurementSample[] = []
    for (let sample = 0; sample < sampleCount; sample += 1) {
      initialSamples.push(await measureInitialImport(page, fixture, catalogVersion))
    }
    records.push(createRecord(environment, {
      operation: 'import-to-ready',
      fixture: fixture.fileName,
      fixtureSeed,
      lineCount,
      targetLineCount: fixture.targetLineCount,
      samples: initialSamples,
      warmupRuns,
      notes:
        'Browser performance.now() from file-input assignment immediately before change dispatch through ready UI plus two animation frames. Includes File reading, main-thread parse, Vue commit, and first virtual-list paint observation.',
    }))

    const scrollDefinitions = [
      {
        selector: RAW_LIST_SELECTOR,
        operation: 'raw-list-programmatic-scroll' as const,
        notes:
          'Programmatic raw-list scrollTop change through two animation frames. This is a repeatable DOM update measurement, not an FPS or subjective wheel-smoothness claim.',
      },
      {
        selector: RESULT_LIST_SELECTOR,
        operation: 'result-list-programmatic-scroll' as const,
        notes:
          'Programmatic result-list scrollTop change through two animation frames. This is a repeatable DOM update measurement, not an FPS or subjective wheel-smoothness claim.',
      },
    ]
    for (const definition of scrollDefinitions) {
      for (let warmup = 0; warmup < warmupRuns; warmup += 1) {
        await measureProgrammaticScroll(page, definition.selector, warmup % 2 === 0 ? 0.85 : 0.15)
      }
      const scrollSamples: MeasurementSample[] = []
      for (let sample = 0; sample < sampleCount; sample += 1) {
        scrollSamples.push(
          await measureProgrammaticScroll(
            page,
            definition.selector,
            sample % 2 === 0 ? 0.85 : 0.15,
          ),
        )
      }
      records.push(createRecord(environment, {
        operation: definition.operation,
        fixture: fixture.fileName,
        fixtureSeed,
        lineCount,
        targetLineCount: fixture.targetLineCount,
        samples: scrollSamples,
        warmupRuns,
        notes: definition.notes,
      }))
    }

    for (let warmup = 0; warmup < warmupRuns; warmup += 1) {
      await measureLocate(page, warmup % 2 === 0 ? 0.85 : 0.15)
    }
    const locateSamples: LocateMeasurementSample[] = []
    for (let sample = 0; sample < sampleCount; sample += 1) {
      locateSamples.push(await measureLocate(page, sample % 2 === 0 ? 0.85 : 0.15))
    }
    records.push(createRecord(environment, {
      operation: 'result-to-raw-locate',
      fixture: fixture.fileName,
      fixtureSeed,
      lineCount,
      targetLineCount: fixture.targetLineCount,
      samples: locateSamples,
      warmupRuns,
      locatedRawLineIndexes: locateSamples.map(({ timing }) => timing.rawLineIndex),
      notes:
        'Browser performance.now() from a rendered result-row click until its rawLineIndex is both inside the left virtual range and represented by the highlighted DOM row.',
    }))

    const secondFixture = generateBrowserFixture({
      lineCount,
      seed: fixtureSeed + 1,
      processType: 'multi',
    })
    await importTabPair(page, fixture, secondFixture, catalogVersion)
    for (let warmup = 0; warmup < warmupRuns; warmup += 1) {
      await measureTabSwitch(page, warmup % 2 === 0 ? fixture.fileName : secondFixture.fileName)
    }
    const tabSamples: MeasurementSample[] = []
    for (let sample = 0; sample < sampleCount; sample += 1) {
      const target = sample % 2 === 0 ? secondFixture.fileName : fixture.fileName
      tabSamples.push(await measureTabSwitch(page, target))
    }
    records.push(createRecord(environment, {
      operation: 'switch-active-tab-to-visible',
      fixture: `${fixture.fileName}+${secondFixture.fileName}`,
      fixtureSeed,
      lineCount,
      targetLineCount: fixture.targetLineCount,
      samples: tabSamples,
      warmupRuns,
      notes:
        'Browser performance.now() from tab button click until the target heading and result virtual list are committed to the page. Both sessions are already parsed; this isolates UI tab switching.',
    }))
  }

  const report: BrowserBenchmarkReport = {
    schemaVersion: 1,
    generatedAt: timestamp,
    syntheticDataOnly: true,
    records,
    exclusions: { fps: 'not measured', memory: 'not measured' },
  }
  const outputDirectory = resolve(
    process.env.SRLW_BENCH_OUTPUT_DIR ??
      fileURLToPath(new URL('../results/', import.meta.url)),
  )
  await mkdir(outputDirectory, { recursive: true })
  const safeTimestamp = timestamp.replace(/[:.]/gu, '-')
  const outputPath = join(outputDirectory, `browser-${safeTimestamp}.json`)
  const serializedReport = `${JSON.stringify(report, null, 2)}\n`
  await writeFile(outputPath, serializedReport, 'utf8')
  await testInfo.attach('browser-benchmark-results', {
    body: Buffer.from(serializedReport, 'utf8'),
    contentType: 'application/json',
  })
  console.log(`Wrote ${records.length} browser benchmark records to ${outputPath}`)
})
