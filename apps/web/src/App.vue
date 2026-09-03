<script setup lang="ts">
import FileImporter from '@/features/log-upload/FileImporter.vue'
import LogWorkspace from '@/features/log-workspace/LogWorkspace.vue'
import SessionTabs from '@/features/log-workspace/SessionTabs.vue'
import { useWorkspaceStore } from '@/stores/workspace'

const workspace = useWorkspaceStore()

function shortCatalogVersion(value?: string): string {
  if (!value) return '初始化中'
  const hash = value.split('#').at(-1) ?? value
  return hash.length > 12 ? `${hash.slice(0, 12)}…` : hash
}
</script>

<template>
  <div class="app-shell">
    <header class="app-header">
      <div class="brand-lockup">
        <div class="brand-mark" aria-hidden="true">
          <svg viewBox="0 0 32 32" role="img">
            <path d="M7 9.5h18v13H7z" />
            <path d="M11 6.5v3m10-3v3M11 25.5v-3m10 3v-3" />
            <circle cx="12" cy="16" r="1.6" />
            <circle cx="20" cy="16" r="1.6" />
          </svg>
        </div>
        <div>
          <div class="brand-eyebrow">
            SCHEMA-DRIVEN · LOCAL · SYNTHETIC
          </div>
          <h1>Schema-Driven Robot Log Workbench</h1>
        </div>
      </div>
      <div class="header-meta">
        <div class="meta-item">
          <span>协议目录</span>
          <code :title="workspace.catalog?.catalogVersion">
            {{ shortCatalogVersion(workspace.catalog?.catalogVersion) }}
          </code>
        </div>
        <div class="privacy-pill">
          <span class="privacy-dot"></span>
          文件不离开浏览器
        </div>
      </div>
    </header>

    <main class="app-main">
      <el-alert
        v-if="workspace.bootstrapError"
        class="bootstrap-error"
        title="协议目录无法启动"
        type="error"
        :description="workspace.bootstrapError"
        :closable="false"
        show-icon
      />

      <template v-else>
        <section class="control-deck" aria-label="日志导入与会话">
          <FileImporter />
          <SessionTabs v-if="workspace.sessionOrder.length > 0" />
        </section>

        <LogWorkspace v-if="workspace.activeSession" />

        <section v-else class="welcome-panel">
          <div class="welcome-copy">
            <span class="section-kicker">START A LOCAL SESSION</span>
            <h2>把十六进制日志，变成可定位的结构化解释。</h2>
            <p>
              上传一个或多个 UTF-8 合成日志。解析器会识别通信方向、在日志级判断单/多进程，
              再以协议 Schema 翻译字段；未知与非法指令不会打断后续解析。
            </p>
            <div class="welcome-facts">
              <div><strong>2</strong><span>方向索引</span></div>
              <div><strong>2</strong><span>Schema 选择字段</span></div>
              <div><strong>100k</strong><span>虚拟列表压力规模</span></div>
            </div>
          </div>
          <div class="flow-map" aria-label="解析流程">
            <div class="flow-step">
              <b>01</b><span>Scan</span><small>筛选目标行</small>
            </div>
            <i></i>
            <div class="flow-step">
              <b>02</b><span>Detect</span><small>判定进程类型</small>
            </div>
            <i></i>
            <div class="flow-step">
              <b>03</b><span>Lookup</span><small>索引合成协议</small>
            </div>
            <i></i>
            <div class="flow-step">
              <b>04</b><span>Decode</span><small>解释字段与条件</small>
            </div>
          </div>
        </section>
      </template>
    </main>

    <footer class="app-footer">
      Schema 驱动的机器人日志解析工作台 · 个人脱敏重构 · 协议与日志均为合成数据 · 不是公司源码
    </footer>
  </div>
</template>
