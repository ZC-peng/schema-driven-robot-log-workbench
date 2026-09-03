import { fileURLToPath } from 'node:url'
import { expect, test, type Page } from '@playwright/test'

const SYNTHETIC_SINGLE_PATH = fileURLToPath(
  new URL('./fixtures/synthetic-single.log', import.meta.url),
)
const SYNTHETIC_MULTI_PATH = fileURLToPath(
  new URL('./fixtures/synthetic-multi.log', import.meta.url),
)
const DOCUMENTED_DEMO_PATH = fileURLToPath(
  new URL('../packages/test-fixtures/logs/demo.log', import.meta.url),
)

async function openReadyApp(page: Page): Promise<void> {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Schema-Driven Robot Log Workbench' })).toBeVisible()
  await expect(page.locator('.meta-item code')).not.toHaveText('初始化中')
}

async function loadSyntheticDemo(page: Page): Promise<void> {
  await page.getByRole('button', { name: '加载合成示例' }).click()
  await expect(page.getByTestId('log-workspace')).toBeVisible()
  await expect(page.getByTestId('log-workspace').getByRole('heading', {
    name: 'synthetic-demo.log',
  })).toBeVisible()
}

test.describe('合成日志工作区', () => {
  test.beforeEach(async ({ page }) => {
    await openReadyApp(page)
  })

  test('加载完全合成的内置示例', async ({ page }) => {
    await loadSyntheticDemo(page)

    await expect(page.locator('.session-tab')).toHaveCount(1)
    await expect(page.locator('.session-tab')).toContainText('synthetic-demo.log')
    await expect(page.locator('.summary-strip')).toContainText('总行数12')
    await expect(page.getByLabel('完整原始日志')).toHaveAttribute(
      'data-rendered-count',
      /\d+/,
    )
    await expect(page.getByLabel('翻译结果')).toHaveAttribute(
      'data-rendered-count',
      /\d+/,
    )
  })

  test('README 首次运行日志可直接上传并解析', async ({ page }) => {
    await page.getByTestId('file-input').setInputFiles(DOCUMENTED_DEMO_PATH)

    await expect(page.getByTestId('log-workspace')).toBeVisible()
    await expect(page.locator('.summary-strip')).toContainText('总行数12')
    await expect(page.locator('.summary-strip')).toContainText('已翻译5')
    await expect(page.locator('.summary-strip')).toContainText('未知1')
    await expect(page.locator('.summary-strip')).toContainText('异常2')
  })

  test('一次上传两份不同的合成日志并隔离会话', async ({ page }) => {
    await page.getByTestId('file-input').setInputFiles([
      SYNTHETIC_SINGLE_PATH,
      SYNTHETIC_MULTI_PATH,
    ])

    const tabs = page.locator('.session-tab')
    await expect(tabs).toHaveCount(2)
    await expect(tabs.nth(0)).toContainText('synthetic-single.log')
    await expect(tabs.nth(1)).toContainText('synthetic-multi.log')
    await expect(tabs.nth(1).locator('.session-tab-main')).toHaveAttribute(
      'aria-current',
      'page',
    )
    await expect(page.getByTestId('log-workspace')).toContainText('multi')

    await tabs.nth(0).locator('.session-tab-main').click()
    await expect(tabs.nth(0).locator('.session-tab-main')).toHaveAttribute(
      'aria-current',
      'page',
    )
    await expect(page.getByTestId('log-workspace').getByRole('heading', {
      name: 'synthetic-single.log',
    })).toBeVisible()
    await expect(page.getByTestId('log-workspace')).toContainText('single')
  })

  test('搜索只保留匹配的翻译结果', async ({ page }) => {
    await loadSyntheticDemo(page)

    await page.getByPlaceholder('搜索原文、命令说明或字段值').fill('7F')
    await expect(page.locator('.result-pane .pane-header')).toContainText(
      /筛选后 1 \/ \d+ 条/,
    )
    await expect(page.locator('.result-pane .command-row')).toHaveCount(1)
    await expect(page.locator('.result-pane .command-row')).toContainText('7F')
  })

  test('点击右侧结果通过 rawLineIndex 定位左侧并打开独立详情', async ({ page }) => {
    await loadSyntheticDemo(page)

    const firstResult = page.locator('.result-pane .command-row').first()
    const locatorText = await firstResult.locator('.command-locator').innerText()
    await firstResult.click()

    await expect(page.locator('.raw-pane .pane-header')).toContainText(`定位 ${locatorText}`)
    await expect(page.locator('.raw-row.is-highlighted')).toBeVisible()
    await expect(page.locator('.command-drawer')).toBeVisible()
    await expect(page.locator('.command-drawer')).toContainText('原始位置')
    await expect(page.locator('.command-drawer')).toContainText(locatorText)
  })

  test('没有目标行时展示日志级原因而非泛化空态', async ({ page }) => {
    await page.getByTestId('file-input').setInputFiles({
      name: 'no-target.log',
      mimeType: 'text/plain',
      buffer: Buffer.from('[00:00:00] fictional carrier noise only'),
    })

    await expect(page.getByText('日志级解析提示')).toBeVisible()
    await expect(page.getByText(/未发现 \[WIRE:TX\]/)).toBeVisible()
  })
})
