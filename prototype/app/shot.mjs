import { chromium } from 'playwright-core'

const url = 'file:///Users/divh/Downloads/teach-petro-agent/prototype/app/dist/index.html#/A1'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 940 } })
const errors = []
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', e => errors.push(String(e)))

await page.goto(url, { waitUntil: 'networkidle' })
await page.waitForTimeout(800)
await page.screenshot({ path: '/tmp/v2-a1-initial.png' })

// 点示例 → 流程跑完 → 截图
await page.getByRole('button', { name: /试试示例/ }).click()
await page.waitForTimeout(7600)
await page.screenshot({ path: '/tmp/v2-a1-flow.png', fullPage: true })

// 点"做成 PPT" → 等进度走完
await page.getByRole('button', { name: '做成 PPT' }).click()
await page.waitForTimeout(3200)
await page.screenshot({ path: '/tmp/v2-a1-artifact.png', fullPage: true })

// 导览弹窗
await page.getByRole('button', { name: '导览' }).click()
await page.waitForTimeout(400)
await page.screenshot({ path: '/tmp/v2-a1-guide.png' })
await page.keyboard.press('Escape')
await page.waitForTimeout(300)

// dev=1 溯源条
await page.goto('file:///Users/divh/Downloads/teach-petro-agent/prototype/app/dist/index.html?dev=1#/A1', { waitUntil: 'networkidle' })
await page.waitForTimeout(600)
await page.screenshot({ path: '/tmp/v2-a1-dev.png' })

// 实习生角色 → 菜单收缩
await page.goto(url, { waitUntil: 'networkidle' })
await page.waitForTimeout(500)
await page.locator('.ant-select').first().click()
await page.waitForTimeout(300)
await page.locator('.ant-select-item-option', { hasText: '实习生' }).click()
await page.waitForTimeout(400)
await page.screenshot({ path: '/tmp/v2-a1-intern.png' })

console.log('console errors:', errors.length ? errors : 'none')
await browser.close()
