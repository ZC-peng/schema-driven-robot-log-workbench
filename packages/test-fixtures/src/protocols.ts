import {
  protocolBundleSchema,
  type ProtocolBundle,
} from '@srlw/protocol-schema'

import syntheticMultiJson from '../protocols/synthetic-multi.json'
import syntheticSingleJson from '../protocols/synthetic-single.json'

/**
 * Public, entirely synthetic protocol fixtures. Parsing the JSON here makes
 * fixture loading exercise the same untrusted-JSON boundary as the app.
 */
export const syntheticSingleBundle: ProtocolBundle =
  protocolBundleSchema.parse(syntheticSingleJson)

export const syntheticMultiBundle: ProtocolBundle =
  protocolBundleSchema.parse(syntheticMultiJson)

export const syntheticProtocolBundles: readonly ProtocolBundle[] = [
  syntheticSingleBundle,
  syntheticMultiBundle,
]
