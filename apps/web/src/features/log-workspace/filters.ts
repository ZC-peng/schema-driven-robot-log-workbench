import type { ParsedCommand } from '@srlw/parser-core'
import type { HexByte } from '@srlw/protocol-schema'

export interface CommandFilters {
  query: string
  categoryFilters: readonly HexByte[]
  subTypeFilters: readonly HexByte[]
}

export function filterCommands(
  commands: readonly ParsedCommand[],
  filters: CommandFilters,
): ParsedCommand[] {
  const query = filters.query.trim().toLocaleLowerCase()

  return commands.filter((command) => {
    if (
      filters.categoryFilters.length > 0
      && (!command.category || !filters.categoryFilters.includes(command.category))
    ) {
      return false
    }
    if (
      filters.subTypeFilters.length > 0
      && (!command.subType || !filters.subTypeFilters.includes(command.subType))
    ) {
      return false
    }
    if (!query) return true

    const fieldText = command.fields
      .map((field) => `${field.label} ${field.displayValue ?? ''} ${field.rawHex ?? ''}`)
      .join(' ')
    return [
      command.rawText,
      command.commandDescription ?? '',
      command.category ?? '',
      command.subType ?? '',
      fieldText,
      command.status,
    ].join(' ').toLocaleLowerCase().includes(query)
  })
}

export function uniqueHex(values: Array<HexByte | undefined> | undefined): HexByte[] {
  return [...new Set((values ?? []).filter((value): value is HexByte => Boolean(value)))].sort()
}
