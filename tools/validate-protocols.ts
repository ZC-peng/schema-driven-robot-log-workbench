import { readFile } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  formatProtocolPath,
  protocolBundleSchema,
  validateProtocolSemantics,
  type ProtocolBundle,
  type ProtocolPathSegment,
} from '../packages/protocol-schema/src/index'

interface LoadedBundle {
  filePath: string
  bundle: ProtocolBundle
}

interface LoadBundleResult {
  loaded?: LoadedBundle
  errorCount: number
}

const toolDirectory = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = resolve(toolDirectory, '..')
const defaultFiles = [
  resolve(repositoryRoot, 'packages/protocol-schema/protocols/single.json'),
  resolve(repositoryRoot, 'packages/protocol-schema/protocols/multi.json'),
]

function displayFilePath(filePath: string): string {
  const pathFromRepository = relative(repositoryRoot, filePath)
  return pathFromRepository.length > 0 ? pathFromRepository.replaceAll('\\', '/') : '.'
}

function toProtocolPath(path: readonly PropertyKey[]): ProtocolPathSegment[] {
  return path.map((segment) =>
    typeof segment === 'number' ? segment : typeof segment === 'symbol' ? segment.toString() : segment,
  )
}

function reportError(filePath: string, path: readonly ProtocolPathSegment[], message: string): void {
  console.error(`ERROR ${displayFilePath(filePath)} ${formatProtocolPath(path)}: ${message}`)
}

async function loadBundle(filePath: string): Promise<LoadBundleResult> {
  let source: string
  try {
    source = await readFile(filePath, 'utf8')
  } catch (error) {
    reportError(filePath, [], `Unable to read file: ${error instanceof Error ? error.message : String(error)}`)
    return { errorCount: 1 }
  }

  let rawBundle: unknown
  try {
    rawBundle = JSON.parse(source) as unknown
  } catch (error) {
    reportError(filePath, [], `Invalid JSON: ${error instanceof Error ? error.message : String(error)}`)
    return { errorCount: 1 }
  }

  const result = protocolBundleSchema.safeParse(rawBundle)
  if (!result.success) {
    result.error.issues.forEach((issue) => {
      reportError(filePath, toProtocolPath(issue.path), `[${issue.code}] ${issue.message}`)
    })
    return { errorCount: result.error.issues.length }
  }

  return { loaded: { filePath, bundle: result.data }, errorCount: 0 }
}

async function main(): Promise<void> {
  const requestedFiles = process.argv.slice(2)
  const files = requestedFiles.length > 0
    ? requestedFiles.map((filePath) => resolve(process.cwd(), filePath))
    : defaultFiles

  const loadResults = await Promise.all(files.map((filePath) => loadBundle(filePath)))
  const validBundles = loadResults
    .map(({ loaded }) => loaded)
    .filter((entry): entry is LoadedBundle => entry !== undefined)
  let errorCount = loadResults.reduce((count, result) => count + result.errorCount, 0)

  if (validBundles.length === loadResults.length) {
    const semanticIssues = validateProtocolSemantics(validBundles.map(({ bundle }) => bundle))
    errorCount += semanticIssues.length

    semanticIssues.forEach((issue) => {
      const [bundleIndex, ...bundlePath] = issue.path
      if (typeof bundleIndex === 'number') {
        const source = validBundles[bundleIndex]
        if (source !== undefined) {
          reportError(source.filePath, bundlePath, `[${issue.code}] ${issue.message}`)
          return
        }
      }

      console.error(`ERROR <catalog> ${formatProtocolPath(issue.path)}: [${issue.code}] ${issue.message}`)
    })
  }

  if (errorCount > 0) {
    console.error(`Protocol validation failed with ${errorCount} error${errorCount === 1 ? '' : 's'}.`)
    process.exitCode = 1
    return
  }

  console.log(`Validated ${validBundles.length} synthetic protocol bundles successfully:`)
  validBundles.forEach(({ filePath, bundle }) => {
    console.log(`- ${displayFilePath(filePath)} (${bundle.processType}@${bundle.version}, ${bundle.commands.length} commands)`)
  })
}

await main()
