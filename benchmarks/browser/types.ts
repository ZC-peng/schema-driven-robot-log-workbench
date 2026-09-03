export type BrowserBenchmarkKind = 'initial-render' | 'tab-switch' | 'scroll'

export type BrowserBenchmarkOperation =
  | 'import-to-ready'
  | 'switch-active-tab-to-visible'
  | 'raw-list-programmatic-scroll'
  | 'result-list-programmatic-scroll'
  | 'result-to-raw-locate'

export interface RenderedListMetrics {
  renderedAttributeCount: number
  renderedDomCount: number
  renderedUpperBound: number
  visibleStart: number
  visibleEnd: number
  viewportHeight: number
  scrollTop: number
  scrollHeight: number
}

export interface StructuralMetricsSample {
  left: RenderedListMetrics
  right: RenderedListMetrics
}

export interface LongTaskSample {
  supported: boolean
  rawDurationsMs: number[]
}

export interface BrowserPhaseSample {
  fileReadMs: number
  parseMs: number
  uploadToFirstResultMs: number
}

export interface BrowserPhaseSummary {
  fileReadMs: { medianMs: number; p95Ms: number }
  parseMs: { medianMs: number; p95Ms: number }
  uploadToFirstResultMs: { medianMs: number; p95Ms: number }
}

export interface BrowserBenchmarkRecord {
  benchmark: BrowserBenchmarkKind
  operation: BrowserBenchmarkOperation
  timestamp: string
  catalogVersion: string
  browser: string
  browserChannel: string
  os: string
  cpu?: string
  gitCommit?: string
  viewport: { width: number; height: number }
  fixture: string
  fixtureSeed: number
  lineCount: number
  targetLineCount: number
  stressScale: boolean
  samples: number
  warmupRuns: number
  rawValuesMs: number[]
  medianMs: number
  p95Ms: number
  structuralSamples: StructuralMetricsSample[]
  locatedRawLineIndexes?: number[]
  longTaskSupported: boolean
  rawLongTaskDurationsMsBySample: number[][]
  phaseSamples?: BrowserPhaseSample[]
  phaseSummary?: BrowserPhaseSummary
  notes: string
}

export interface BrowserBenchmarkReport {
  schemaVersion: 1
  generatedAt: string
  syntheticDataOnly: true
  records: BrowserBenchmarkRecord[]
  exclusions: {
    fps: 'not measured'
    memory: 'not measured'
  }
}
