import { computed, markRaw, nextTick, ref, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import {
  parseLog,
  splitLines,
  type ParseIssue,
  type ParsedCommand,
  type ParseSummary,
} from '@srlw/parser-core'
import type { HexByte, ProcessType } from '@srlw/protocol-schema'
import type { AppCatalog } from '@/app/catalog'
import { SYNTHETIC_DEMO_LOG } from '@/features/log-upload/demo-log'

export type ParseStatus = 'idle' | 'reading' | 'parsing' | 'ready' | 'error'

export interface LogSession {
  id: string
  fingerprint: string
  fileName: string
  size: number
  lastModified: number
  rawLines: string[]
  parsedCommands: ParsedCommand[]
  issues: ParseIssue[]
  status: ParseStatus
  catalogVersion: string
  processType?: ProcessType
  summary?: ParseSummary
  errorMessage?: string
}

export interface LogViewState {
  query: string
  categoryFilters: HexByte[]
  subTypeFilters: HexByte[]
  rawScrollOffset: number
  resultScrollOffset: number
  selectedCommandId?: string
  highlightedRawLineIndex?: number
}

export interface ImportOutcome {
  fileName: string
  sessionId?: string
  duplicate: boolean
  error?: string
}

const DEFAULT_VIEW_STATE = (): LogViewState => ({
  query: '',
  categoryFilters: [],
  subTypeFilters: [],
  rawScrollOffset: 0,
  resultScrollOffset: 0,
})

const MAX_FILE_BYTES = 25 * 1024 * 1024

export const useWorkspaceStore = defineStore('workspace', () => {
  const catalog = shallowRef<AppCatalog>()
  const bootstrapError = ref<string>()
  const sessions = shallowRef<Record<string, LogSession>>({})
  const sessionOrder = ref<string[]>([])
  const activeLogId = ref<string>()
  const viewStates = ref<Record<string, LogViewState>>({})

  const activeSession = computed(() => {
    const id = activeLogId.value
    return id ? sessions.value[id] : undefined
  })

  const activeViewState = computed(() => {
    const id = activeLogId.value
    return id ? viewStates.value[id] : undefined
  })

  function initializeCatalog(value: AppCatalog): void {
    catalog.value = markRaw(value)
    bootstrapError.value = undefined
  }

  function failBootstrap(message: string): void {
    bootstrapError.value = message
  }

  function replaceSession(id: string, patch: Partial<LogSession>): void {
    const current = sessions.value[id]
    if (!current) return
    sessions.value = {
      ...sessions.value,
      [id]: { ...current, ...patch },
    }
  }

  function addSession(session: LogSession): void {
    sessions.value = { ...sessions.value, [session.id]: session }
    sessionOrder.value = [...sessionOrder.value, session.id]
    viewStates.value = { ...viewStates.value, [session.id]: DEFAULT_VIEW_STATE() }
    activeLogId.value = session.id
  }

  async function importFiles(files: File[]): Promise<ImportOutcome[]> {
    const outcomes: ImportOutcome[] = []
    for (const file of files) outcomes.push(await importFile(file))
    return outcomes
  }

  async function importFile(file: File): Promise<ImportOutcome> {
    if (!catalog.value) {
      return { fileName: file.name, duplicate: false, error: '协议目录尚未就绪' }
    }
    if (!/\.(log|txt)$/i.test(file.name)) {
      return { fileName: file.name, duplicate: false, error: '仅支持 .log 或 .txt 文件' }
    }
    if (file.size > MAX_FILE_BYTES) {
      return { fileName: file.name, duplicate: false, error: '文件超过 25 MiB 的演示上限' }
    }

    const importStartedAt = performance.now()
    try {
      const bytes = await file.arrayBuffer()
      const fingerprint = await sha256(bytes)
      const duplicate = Object.values(sessions.value).find(
        (session) => session.fingerprint === fingerprint,
      )
      if (duplicate) {
        activeLogId.value = duplicate.id
        return { fileName: file.name, sessionId: duplicate.id, duplicate: true }
      }

      let rawText: string
      try {
        rawText = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
      } catch {
        return { fileName: file.name, duplicate: false, error: '文件不是有效的 UTF-8 文本' }
      }

      const id = crypto.randomUUID()
      const rawLines = splitLines(rawText)
      const diagnosticContext = {
        sessionId: id,
        logId: id,
        parseRunId: `${id}:initial`,
        catalogVersion: catalog.value.catalogVersion,
        fileSize: file.size,
        lineCount: rawLines.length,
      }
      recordPerformanceMeasure('file_read_ms', importStartedAt, diagnosticContext)
      const base: LogSession = {
        id,
        fingerprint,
        fileName: file.name,
        size: file.size,
        lastModified: file.lastModified,
        rawLines: markRaw(rawLines),
        parsedCommands: markRaw([]),
        issues: markRaw([]),
        status: 'parsing',
        catalogVersion: catalog.value.catalogVersion,
      }
      addSession(base)
      await nextTick()
      await yieldToBrowser()

      const parseStartedAt = performance.now()
      try {
        const result = parseLog(
          { logId: id, rawText, catalogVersion: catalog.value.catalogVersion },
          catalog.value.index,
        )
        recordPerformanceMeasure('parse_ms', parseStartedAt, diagnosticContext)
        replaceSession(id, {
          parsedCommands: markRaw(result.commands),
          issues: markRaw(result.issues),
          summary: result.summary,
          ...(result.processType === undefined ? {} : { processType: result.processType }),
          status: 'ready',
        })
        await nextTick()
        await yieldToBrowser()
        recordPerformanceMeasure(
          'upload_to_first_result_ms',
          importStartedAt,
          diagnosticContext,
        )
      } catch {
        recordPerformanceMeasure('parse_ms', parseStartedAt, diagnosticContext)
        const errorMessage = '解析器遇到意外错误；原始日志已保留在错误会话。'
        replaceSession(id, {
          status: 'error',
          errorMessage,
        })
        return {
          fileName: file.name,
          sessionId: id,
          duplicate: false,
          error: errorMessage,
        }
      }

      return { fileName: file.name, sessionId: id, duplicate: false }
    } catch {
      return { fileName: file.name, duplicate: false, error: '浏览器无法读取该文件' }
    }
  }

  async function loadSyntheticDemo(): Promise<ImportOutcome> {
    const file = new File([SYNTHETIC_DEMO_LOG], 'synthetic-demo.log', {
      type: 'text/plain;charset=utf-8',
      lastModified: 1_788_192_000_000,
    })
    return importFile(file)
  }

  function activateSession(id: string): void {
    if (sessions.value[id]) activeLogId.value = id
  }

  function removeSession(id: string): void {
    const index = sessionOrder.value.indexOf(id)
    if (index < 0) return

    const nextSessions = { ...sessions.value }
    delete nextSessions[id]
    sessions.value = nextSessions
    sessionOrder.value = sessionOrder.value.filter((sessionId) => sessionId !== id)

    const nextViews = { ...viewStates.value }
    delete nextViews[id]
    viewStates.value = nextViews

    if (activeLogId.value === id) {
      const nextIndex = Math.min(index, sessionOrder.value.length - 1)
      activeLogId.value = nextIndex >= 0 ? sessionOrder.value[nextIndex] : undefined
    }
  }

  function updateViewState(id: string, patch: Partial<LogViewState>): void {
    const current = viewStates.value[id]
    if (!current) return
    viewStates.value = {
      ...viewStates.value,
      [id]: { ...current, ...patch },
    }
  }

  function selectCommand(id: string, command: ParsedCommand): void {
    updateViewState(id, {
      selectedCommandId: command.id,
      highlightedRawLineIndex: command.rawLineIndex,
    })
  }

  return {
    catalog,
    bootstrapError,
    sessions,
    sessionOrder,
    activeLogId,
    viewStates,
    activeSession,
    activeViewState,
    initializeCatalog,
    failBootstrap,
    importFiles,
    loadSyntheticDemo,
    activateSession,
    removeSession,
    updateViewState,
    selectCommand,
  }
})

async function sha256(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('')
}

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()))
}

function recordPerformanceMeasure(
  name: string,
  start: number,
  detail: Record<string, string | number>,
): void {
  try {
    performance.measure(name, { start, end: performance.now(), detail })
  } catch {
    // Diagnostics must never make local file parsing fail in a partial Performance API implementation.
  }
}
