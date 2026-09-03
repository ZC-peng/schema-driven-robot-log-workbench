<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useWorkspaceStore } from '@/stores/workspace'

const workspace = useWorkspaceStore()
const input = ref<HTMLInputElement>()
const dragging = ref(false)
const importing = ref(false)

function openPicker(): void {
  input.value?.click()
}

async function onInput(event: Event): Promise<void> {
  const target = event.target as HTMLInputElement
  await processFiles(target.files)
  target.value = ''
}

async function onDrop(event: DragEvent): Promise<void> {
  dragging.value = false
  await processFiles(event.dataTransfer?.files ?? null)
}

async function processFiles(fileList: FileList | null): Promise<void> {
  if (!fileList || fileList.length === 0 || importing.value) return
  importing.value = true
  const outcomes = await workspace.importFiles(Array.from(fileList))
  importing.value = false

  for (const outcome of outcomes) {
    if (outcome.error) {
      ElMessage.error(`${outcome.fileName}：${outcome.error}`)
    } else if (outcome.duplicate) {
      ElMessage.info(`${outcome.fileName} 已存在，已切换到原会话`)
    } else {
      ElMessage.success(`${outcome.fileName} 已在浏览器内解析`)
    }
  }
}

async function loadDemo(): Promise<void> {
  importing.value = true
  const outcome = await workspace.loadSyntheticDemo()
  importing.value = false
  if (outcome.error) ElMessage.error(outcome.error)
  else if (outcome.duplicate) ElMessage.info('合成示例已打开')
  else ElMessage.success('已载入完全合成的演示日志')
}
</script>

<template>
  <div
    class="file-importer"
    :class="{ 'is-dragging': dragging }"
    @dragenter.prevent="dragging = true"
    @dragover.prevent="dragging = true"
    @dragleave.prevent="dragging = false"
    @drop.prevent="onDrop"
  >
    <input
      ref="input"
      data-testid="file-input"
      class="visually-hidden"
      type="file"
      accept=".log,.txt,text/plain"
      multiple
      @change="onInput"
    />
    <div class="import-copy">
      <span class="import-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24"><path d="M12 15V3m0 0L7.5 7.5M12 3l4.5 4.5M4 14v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5" /></svg>
      </span>
      <div><strong>导入本地日志</strong><span>拖放或选择多个 .log / .txt，UTF-8，单文件 ≤ 25 MiB</span></div>
    </div>
    <div class="import-actions">
      <el-button :loading="importing" type="primary" @click="openPicker">
        选择文件
      </el-button>
      <el-button :disabled="importing" plain @click="loadDemo">
        加载合成示例
      </el-button>
    </div>
  </div>
</template>
