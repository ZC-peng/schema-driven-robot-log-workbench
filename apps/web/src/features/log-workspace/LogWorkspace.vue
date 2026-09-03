<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import FixedVirtualList from '@srlw/virtual-list/vue'
import type { VirtualListController } from '@srlw/virtual-list'
import type { HexByte } from '@srlw/protocol-schema'
import type { ParsedCommand } from '@srlw/parser-core'
import { useWorkspaceStore } from '@/stores/workspace'
import { filterCommands, uniqueHex } from './filters'
import ResultCommandRow from './ResultCommandRow.vue'

const workspace = useWorkspaceStore()
const leftList = ref<VirtualListController>()
const detailOpen = ref(false)

// This opt-in branch exists only so the synthetic benchmark can reconstruct
// the historical one-sided-virtualization failure mode. Production builds and
// normal development URLs always keep the right side virtualized.
const benchmarkFullResultList = import.meta.env.DEV &&
  new URLSearchParams(window.location.search).get('__srlw_benchmark_right') === 'full'

const session = computed(() => workspace.activeSession)
const view = computed(() => workspace.activeViewState)

const visibleCommands = computed(() => {
  const current = session.value
  const state = view.value
  if (!current || !state) return []
  return filterCommands(current.parsedCommands, state)
})

const availableCategories = computed(() => uniqueHex(session.value?.parsedCommands.map((item) => item.category)))
const availableSubTypes = computed(() => uniqueHex(session.value?.parsedCommands.map((item) => item.subType)))
const selectedCommand = computed(() => {
  const selectedId = view.value?.selectedCommandId
  return selectedId ? session.value?.parsedCommands.find((item) => item.id === selectedId) : undefined
})
const selectedVisibleIndex = computed(() => {
  const selectedId = view.value?.selectedCommandId
  return selectedId ? visibleCommands.value.findIndex((item) => item.id === selectedId) : -1
})
const selectedIsFiltered = computed(() => Boolean(selectedCommand.value && selectedVisibleIndex.value < 0))
const logIssues = computed(() => session.value?.issues.filter((issue) => issue.rawLineIndex === undefined) ?? [])
const logIssueDescription = computed(() => logIssues.value.map((issue) => {
  if (issue.code === 'NO_TARGET_LINES') return '未发现 [WIRE:TX] / [WIRE:RX] 虚构链路帧。'
  if (issue.code === 'NO_DECODABLE_TARGET_LINES') return '存在目标行，但没有足够的合法字节用于判定进程类型。'
  if (issue.code === 'MIXED_PROCESS_TYPES') return '同一日志混合了 single 与 multi 标记，解析器没有逐行猜测协议。'
  return issue.message
}).join(' '))

watch(() => session.value?.id, () => {
  detailOpen.value = false
})

function updateQuery(value: string): void {
  if (session.value) workspace.updateViewState(session.value.id, { query: value })
}

function updateCategories(value: HexByte[]): void {
  if (session.value) workspace.updateViewState(session.value.id, { categoryFilters: [...value] })
}

function updateSubTypes(value: HexByte[]): void {
  if (session.value) workspace.updateViewState(session.value.id, { subTypeFilters: [...value] })
}

function clearFilters(): void {
  if (session.value) {
    workspace.updateViewState(session.value.id, { query: '', categoryFilters: [], subTypeFilters: [] })
  }
}

function updateRawScrollOffset(value: number): void {
  if (session.value) workspace.updateViewState(session.value.id, { rawScrollOffset: value })
}

function updateResultScrollOffset(value: number): void {
  if (session.value) workspace.updateViewState(session.value.id, { resultScrollOffset: value })
}

async function locateCommand(command: ParsedCommand): Promise<void> {
  const current = session.value
  if (!current) return
  const start = performance.now()
  workspace.selectCommand(current.id, command)
  await nextTick()
  leftList.value?.scrollToIndex(command.rawLineIndex, 'center')
  detailOpen.value = true
  performance.measure('locate_raw_line_ms', {
    start,
    end: performance.now(),
    detail: { logId: current.id, rawLineIndex: command.rawLineIndex },
  })
}

function statusLabel(command: ParsedCommand): string {
  if (command.status === 'translated') return '已翻译'
  if (command.status === 'unknown') return '未知'
  return '异常'
}

function directionLabel(command: ParsedCommand): string {
  return command.direction === 'up' ? 'WIRE RX ↑' : command.direction === 'down' ? 'WIRE TX ↓' : '方向未知'
}

function bytesLabel(command: ParsedCommand): string {
  return command.bytes.map((byte) => byte.toString(16).padStart(2, '0').toUpperCase()).join(' ')
}
</script>

<template>
  <section v-if="session && view" class="workspace" data-testid="log-workspace">
    <div class="workspace-heading">
      <div>
        <span class="section-kicker">ACTIVE LOG SESSION</span>
        <h2>{{ session.fileName }}</h2>
      </div>
      <div class="summary-strip" aria-label="解析摘要">
        <div><span>总行数</span><strong>{{ session.summary?.totalLines ?? session.rawLines.length }}</strong></div>
        <div><span>目标行</span><strong>{{ session.summary?.targetLines ?? 0 }}</strong></div>
        <div class="is-success">
          <span>已翻译</span><strong>{{ session.summary?.translated ?? 0 }}</strong>
        </div>
        <div class="is-warning">
          <span>未知</span><strong>{{ session.summary?.unknown ?? 0 }}</strong>
        </div>
        <div class="is-danger">
          <span>异常</span><strong>{{ session.summary?.malformed ?? 0 }}</strong>
        </div>
      </div>
    </div>

    <div v-if="session.status === 'parsing'" class="state-panel">
      <span class="state-spinner"></span><strong>正在浏览器主线程内解析…</strong>
    </div>
    <el-alert
      v-else-if="session.status === 'error'"
      type="error"
      title="本日志解析失败"
      :description="session.errorMessage"
      :closable="false"
      show-icon
    />

    <template v-else>
      <el-alert
        v-if="logIssues.length"
        class="log-issue-alert"
        type="warning"
        title="日志级解析提示"
        :description="logIssueDescription"
        :closable="false"
        show-icon
      />

      <div class="filter-toolbar">
        <el-input
          :model-value="view.query"
          data-testid="search-input"
          clearable
          placeholder="搜索原文、命令说明或字段值"
          @update:model-value="updateQuery"
        >
          <template #prefix>
            <span class="search-glyph">⌕</span>
          </template>
        </el-input>
        <el-select
          :model-value="view.categoryFilters"
          data-testid="category-filter"
          multiple
          collapse-tags
          placeholder="大类"
          @update:model-value="updateCategories"
        >
          <el-option v-for="value in availableCategories" :key="value" :label="`0x${value}`" :value="value" />
        </el-select>
        <el-select
          :model-value="view.subTypeFilters"
          data-testid="subtype-filter"
          multiple
          collapse-tags
          placeholder="子类"
          @update:model-value="updateSubTypes"
        >
          <el-option v-for="value in availableSubTypes" :key="value" :label="`0x${value}`" :value="value" />
        </el-select>
        <el-button :disabled="!view.query && !view.categoryFilters.length && !view.subTypeFilters.length" @click="clearFilters">
          清除筛选
        </el-button>
      </div>

      <div v-if="view.categoryFilters.length || view.subTypeFilters.length" class="filter-tags" data-testid="filter-tags">
        <span>当前筛选</span>
        <el-tag
          v-for="value in view.categoryFilters"
          :key="`category-${value}`"
          closable
          @close="updateCategories(view.categoryFilters.filter((item) => item !== value))"
        >
          大类 0x{{ value }}
        </el-tag>
        <el-tag
          v-for="value in view.subTypeFilters"
          :key="`subtype-${value}`"
          closable
          type="info"
          @close="updateSubTypes(view.subTypeFilters.filter((item) => item !== value))"
        >
          子类 0x{{ value }}
        </el-tag>
      </div>

      <el-alert
        v-if="selectedIsFiltered"
        class="selection-filtered-alert"
        type="info"
        title="所选结果当前被筛选隐藏；清除筛选后会恢复选中状态。"
        :closable="false"
      />

      <div class="split-workspace">
        <article class="log-pane raw-pane">
          <header class="pane-header">
            <div><span class="pane-index">A</span><div><h3>原始日志</h3><p>完整上下文 · {{ session.rawLines.length }} 行</p></div></div>
            <code v-if="view.highlightedRawLineIndex !== undefined">定位 L{{ view.highlightedRawLineIndex + 1 }}</code>
          </header>
          <FixedVirtualList
            :key="`raw-${session.id}`"
            ref="leftList"
            class="log-list"
            :item-count="session.rawLines.length"
            :item-height="32"
            :initial-scroll-offset="view.rawScrollOffset"
            :overscan="8"
            :selected-index="view.highlightedRawLineIndex ?? null"
            aria-label="完整原始日志"
            @scroll-offset-change="updateRawScrollOffset"
          >
            <template #default="{ index, selected }">
              <div class="raw-row" :class="{ 'is-highlighted': selected }" :data-raw-line-index="index">
                <span class="line-number">{{ String(index + 1).padStart(5, '0') }}</span>
                <code :title="session.rawLines[index]">{{ session.rawLines[index] }}</code>
              </div>
            </template>
          </FixedVirtualList>
        </article>

        <article class="log-pane result-pane">
          <header class="pane-header">
            <div><span class="pane-index">B</span><div><h3>翻译结果</h3><p>筛选后 {{ visibleCommands.length }} / {{ session.parsedCommands.length }} 条</p></div></div>
            <span class="process-badge">{{ session.processType ?? '未判定' }}</span>
          </header>
          <FixedVirtualList
            v-if="visibleCommands.length > 0 && !benchmarkFullResultList"
            :key="`result-${session.id}`"
            class="log-list result-list"
            :item-count="visibleCommands.length"
            :item-height="76"
            :initial-scroll-offset="view.resultScrollOffset"
            :overscan="5"
            :selected-index="selectedVisibleIndex >= 0 ? selectedVisibleIndex : null"
            :data-source-count="visibleCommands.length"
            data-rendering-mode="virtual"
            aria-label="翻译结果"
            @scroll-offset-change="updateResultScrollOffset"
          >
            <template #default="{ index, selected }">
              <ResultCommandRow
                v-if="visibleCommands[index]"
                :command="visibleCommands[index]"
                :selected="selected"
                @select="locateCommand"
              />
            </template>
          </FixedVirtualList>
          <div
            v-else-if="visibleCommands.length > 0"
            :key="`result-full-${session.id}`"
            class="log-list result-list result-list-full"
            :data-rendered-count="visibleCommands.length"
            :data-source-count="visibleCommands.length"
            data-rendering-mode="full"
            aria-label="翻译结果"
          >
            <div
              v-for="command in visibleCommands"
              :key="command.id"
              class="result-list-full__item"
              data-testid="full-list-item"
            >
              <ResultCommandRow
                :command="command"
                :selected="command.id === view.selectedCommandId"
                @select="locateCommand"
              />
            </div>
          </div>
          <div v-else class="pane-empty">
            <span>∅</span>
            <strong>{{ session.parsedCommands.length ? '没有符合当前筛选的结果' : '没有可展示的目标指令' }}</strong>
            <p>未知或非法目标行仍会出现在结果列表中；普通非目标行只保留在左侧。</p>
          </div>
        </article>
      </div>
    </template>

    <el-drawer v-model="detailOpen" size="460px" append-to-body class="command-drawer">
      <template #header>
        <div class="drawer-heading">
          <span class="section-kicker">FIXED-HEIGHT LIST · DETAIL PANEL</span>
          <h3>{{ selectedCommand?.commandDescription ?? '指令详情' }}</h3>
        </div>
      </template>
      <div v-if="selectedCommand" class="command-detail">
        <div class="detail-facts">
          <div><span>原始位置</span><strong>L{{ selectedCommand.rawLineIndex + 1 }}</strong></div>
          <div><span>状态</span><strong>{{ statusLabel(selectedCommand) }}</strong></div>
          <div><span>方向</span><strong>{{ directionLabel(selectedCommand) }}</strong></div>
          <div><span>进程</span><strong>{{ selectedCommand.processType ?? '—' }}</strong></div>
          <div><span>大类</span><strong>{{ selectedCommand.category ? `0x${selectedCommand.category}` : '—' }}</strong></div>
          <div><span>子类</span><strong>{{ selectedCommand.subType ? `0x${selectedCommand.subType}` : '—' }}</strong></div>
        </div>
        <section class="detail-section">
          <h4>字节</h4><code class="byte-block">{{ bytesLabel(selectedCommand) || '无可解码字节' }}</code>
        </section>
        <section class="detail-section">
          <h4>Schema 字段</h4>
          <div v-if="selectedCommand.fields.length" class="field-list">
            <div v-for="field in selectedCommand.fields" :key="field.key" :class="{ 'is-skipped': !field.applied }">
              <span>{{ field.label }} <small>@{{ field.offset }}</small></span>
              <strong>{{ field.applied ? (field.displayValue ?? '缺失') : '条件未满足' }}</strong>
              <code>{{ field.rawHex ? `0x${field.rawHex}` : '—' }}</code>
            </div>
          </div>
          <p v-else class="detail-muted">
            该结果没有可展示字段。
          </p>
        </section>
        <section v-if="selectedCommand.issues.length" class="detail-section issue-section">
          <h4>问题</h4>
          <div v-for="issue in selectedCommand.issues" :key="`${issue.code}-${issue.message}`" class="issue-row">
            <code>{{ issue.code }}</code><p>{{ issue.message }}</p>
          </div>
        </section>
        <section class="detail-section">
          <h4>原始证据</h4><pre>{{ selectedCommand.rawText }}</pre>
        </section>
      </div>
    </el-drawer>
  </section>
</template>
