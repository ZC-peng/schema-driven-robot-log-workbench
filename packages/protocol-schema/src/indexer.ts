import type {
  CommandSchema,
  Direction,
  HexByte,
  ProcessType,
  ProtocolBundle,
  ProtocolSelector,
} from './schema'
import { commandCompositeKey } from './validation'

export type SubTypeIndex = Map<HexByte, CommandSchema>
export type CategoryIndex = Map<HexByte, SubTypeIndex>
export type DirectionIndex = Map<Direction, CategoryIndex>
export interface ProtocolIndex extends Map<ProcessType, DirectionIndex> {
  readonly selectors: ReadonlyMap<ProcessType, ProtocolSelector>
}

export function buildProtocolIndex(bundles: readonly ProtocolBundle[]): ProtocolIndex {
  const selectors = new Map<ProcessType, ProtocolSelector>()
  const index = new Map<ProcessType, DirectionIndex>() as ProtocolIndex
  Object.defineProperty(index, 'selectors', {
    configurable: false,
    enumerable: false,
    value: selectors,
    writable: false,
  })
  const keys = new Set<string>()

  bundles.forEach((bundle) => {
    selectors.set(bundle.processType, { ...bundle.selector })
    let directionIndex = index.get(bundle.processType)
    if (directionIndex === undefined) {
      directionIndex = new Map()
      index.set(bundle.processType, directionIndex)
    }

    bundle.commands.forEach((command) => {
      const key = commandCompositeKey(bundle.processType, command)
      if (keys.has(key)) {
        throw new Error(`Cannot index duplicate protocol command ${key}`)
      }
      keys.add(key)

      let categoryIndex = directionIndex.get(command.direction)
      if (categoryIndex === undefined) {
        categoryIndex = new Map()
        directionIndex.set(command.direction, categoryIndex)
      }

      let subTypeIndex = categoryIndex.get(command.category)
      if (subTypeIndex === undefined) {
        subTypeIndex = new Map()
        categoryIndex.set(command.category, subTypeIndex)
      }

      subTypeIndex.set(command.subType, command)
    })
  })

  return index
}

export function lookupProtocol(
  index: ProtocolIndex,
  processType: ProcessType,
  direction: Direction,
  category: HexByte,
  subType: HexByte,
): CommandSchema | undefined {
  return index.get(processType)?.get(direction)?.get(category)?.get(subType)
}

export const lookup = lookupProtocol

export function getProtocolSelector(
  index: ProtocolIndex,
  processType: ProcessType,
): ProtocolSelector | undefined {
  return index.selectors.get(processType)
}
