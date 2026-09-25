import { chromium } from 'playwright-core'
const errors = []
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } })
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message))
await page.goto('file:///tmp/v2-A3/index.html#/A3')
await page.waitForTimeout(120)
const r = {}
r.skeletonOnMount = await page.locator('.ant-skeleton').count() > 0
await page.waitForTimeout(900)
// F5 驳回 with typed reason
await page.getByRole('button', { name: '驳回（须写理由）' }).click()
await page.waitForTimeout(200)
r.modalOpen = await page.locator('.ant-modal').isVisible()
await page.locator('.ant-modal textarea').fill('影响测算没覆盖含水上升风险，补测算后再议')
await page.getByRole('button', { name: '提交驳回' }).click()
await page.waitForTimeout(300)
r.rejected = await page.textContent('body').then(t => t.includes('已驳回') && t.includes('理由：影响测算没覆盖含水上升风险') && t.includes('建议退回配注优化助手'))
r.modalClosed = await page.locator('.ant-modal-wrap').isVisible().catch(() => false) === false
r.rejectBtnGone = await page.getByRole('button', { name: '驳回（须写理由）' }).count() === 0
await page.screenshot({ path: '/tmp/v2-A3-reject.png', fullPage: true })
// default reason path
await page.reload()
await page.waitForTimeout(1100)
await page.getByRole('button', { name: '驳回（须写理由）' }).click()
await page.waitForTimeout(200)
await page.getByRole('button', { name: '提交驳回' }).click()
await page.waitForTimeout(300)
r.defaultReason = await page.textContent('body').then(t => t.includes('理由：影响测算不足'))
console.log(JSON.stringify({ results: r, consoleErrors: errors }, null, 1))
await browser.close()
