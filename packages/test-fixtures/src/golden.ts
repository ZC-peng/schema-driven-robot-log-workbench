import goldenCasesJson from '../golden/cases.json'

export interface GoldenSummary {
  totalLines: number
  targetLines: number
  translated: number
  unknown: number
  malformed: number
}

export interface GoldenExpected {
  processType?: 'single' | 'multi'
  statuses: Array<'translated' | 'unknown' | 'malformed'>
  directions?: Array<'up' | 'down' | null>
  rawLineIndices: number[]
  categories?: Array<string | null>
  subTypes?: Array<string | null>
  issueCodes: string[]
  fieldValues?: Record<string, string>
  fieldApplied?: Record<string, boolean>
  summary: GoldenSummary
}

export interface GoldenCase {
  name: string
  rule: string
  inputLog: string
  expected: GoldenExpected
}

/** Golden expectations are reviewable JSON rather than parser-derived values. */
export const goldenCases = goldenCasesJson as GoldenCase[]
