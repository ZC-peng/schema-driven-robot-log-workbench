<script setup lang="ts">
import type { ParsedCommand } from '@srlw/parser-core'

defineProps<{
  command: ParsedCommand
  selected: boolean
}>()

const emit = defineEmits<{
  select: [command: ParsedCommand]
}>()

function statusLabel(command: ParsedCommand): string {
  if (command.status === 'translated') return '已翻译'
  if (command.status === 'unknown') return '未知'
  return '异常'
}

function directionLabel(command: ParsedCommand): string {
  return command.direction === 'up'
    ? 'WIRE RX ↑'
    : command.direction === 'down'
      ? 'WIRE TX ↓'
      : '方向未知'
}

function bytesLabel(command: ParsedCommand): string {
  return command.bytes
    .map((byte) => byte.toString(16).padStart(2, '0').toUpperCase())
    .join(' ')
}
</script>

<template>
  <button
    class="command-row"
    :class="[`is-${command.status}`, { 'is-selected': selected }]"
    :data-command-id="command.id"
    type="button"
    @click="emit('select', command)"
  >
    <span class="command-locator">L{{ command.rawLineIndex + 1 }}</span>
    <span class="command-main">
      <span class="command-title">{{ command.commandDescription ?? '未匹配的合成指令' }}</span>
      <code>{{ bytesLabel(command) }}</code>
    </span>
    <span class="command-meta">
      <small>{{ directionLabel(command) }}</small>
      <em :class="`is-${command.status}`">
        {{ statusLabel(command) }}
      </em>
    </span>
  </button>
</template>
