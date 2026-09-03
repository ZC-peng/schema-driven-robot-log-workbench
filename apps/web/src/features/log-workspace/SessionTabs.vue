<script setup lang="ts">
import { useWorkspaceStore } from '@/stores/workspace'

const workspace = useWorkspaceStore()

function lineCount(id: string): string {
  const count = workspace.sessions[id]?.rawLines.length ?? 0
  return count >= 1000 ? `${(count / 1000).toFixed(1)}k 行` : `${count} 行`
}
</script>

<template>
  <nav class="session-tabs" aria-label="日志会话">
    <div
      v-for="id in workspace.sessionOrder"
      :key="id"
      class="session-tab"
      :class="{ 'is-active': workspace.activeLogId === id }"
    >
      <button
        class="session-tab-main"
        :aria-current="workspace.activeLogId === id ? 'page' : undefined"
        :data-testid="`session-tab-${id}`"
        type="button"
        @click="workspace.activateSession(id)"
      >
        <span class="session-status" :class="`is-${workspace.sessions[id]?.status}`"></span>
        <span class="session-name" :title="workspace.sessions[id]?.fileName">
          {{ workspace.sessions[id]?.fileName }}
        </span>
        <small>{{ lineCount(id) }}</small>
      </button>
      <button
        class="session-close"
        :aria-label="`关闭 ${workspace.sessions[id]?.fileName}`"
        type="button"
        @click="workspace.removeSession(id)"
      >
        ×
      </button>
    </div>
  </nav>
</template>
