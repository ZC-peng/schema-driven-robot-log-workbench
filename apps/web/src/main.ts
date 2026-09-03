import { createApp } from 'vue'
import { createPinia } from 'pinia'
import {
  ElAlert,
  ElButton,
  ElDrawer,
  ElInput,
  ElOption,
  ElSelect,
  ElTag,
} from 'element-plus'
import 'element-plus/es/components/base/style/css'
import 'element-plus/es/components/alert/style/css'
import 'element-plus/es/components/button/style/css'
import 'element-plus/es/components/drawer/style/css'
import 'element-plus/es/components/input/style/css'
import 'element-plus/es/components/message/style/css'
import 'element-plus/es/components/select/style/css'
import 'element-plus/es/components/tag/style/css'
import App from './App.vue'
import { loadAppCatalog } from '@/app/catalog'
import { useWorkspaceStore } from '@/stores/workspace'
import '@/styles/main.css'

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)
app.use(ElAlert)
app.use(ElButton)
app.use(ElDrawer)
app.use(ElInput)
app.use(ElOption)
app.use(ElSelect)
app.use(ElTag)

const workspace = useWorkspaceStore(pinia)
try {
  workspace.initializeCatalog(await loadAppCatalog())
} catch (error) {
  workspace.failBootstrap(error instanceof Error ? error.message : '协议目录初始化失败')
}

app.mount('#app')
