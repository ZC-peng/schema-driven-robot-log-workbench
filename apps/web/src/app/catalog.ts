import multiProtocol from '@srlw/protocol-schema/protocols/multi'
import singleProtocol from '@srlw/protocol-schema/protocols/single'
import {
  buildProtocolIndex,
  deriveCatalogVersion,
  formatProtocolIssue,
  protocolBundlesSchema,
  validateProtocolSemantics,
  type ProtocolBundle,
  type ProtocolIndex,
} from '@srlw/protocol-schema'

export interface AppCatalog {
  bundles: ProtocolBundle[]
  catalogVersion: string
  index: ProtocolIndex
}

export async function loadAppCatalog(): Promise<AppCatalog> {
  const parsed = protocolBundlesSchema.safeParse([singleProtocol, multiProtocol])

  if (!parsed.success) {
    const message = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
      .join('\n')
    throw new Error(`合成协议结构校验失败：\n${message}`)
  }

  const semanticIssues = validateProtocolSemantics(parsed.data)
  const errors = semanticIssues.filter((issue) => issue.severity === 'error')
  if (errors.length > 0) {
    throw new Error(`合成协议语义校验失败：\n${errors.map(formatProtocolIssue).join('\n')}`)
  }

  return {
    bundles: parsed.data,
    catalogVersion: await deriveCatalogVersion(parsed.data),
    index: buildProtocolIndex(parsed.data),
  }
}
