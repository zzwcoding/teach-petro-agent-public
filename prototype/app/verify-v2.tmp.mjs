import { chromium } from 'playwright-core'

const KEY = process.argv[2] || 'A2'
const errors = []
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } })
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message))

await page.goto(`file:///tmp/v2-${KEY}/index.html#/${KEY}`)
await page.waitForTimeout(1500)

const r = {}
if (KEY === 'A2') {
  // F2 default N-02 content
  r.n02 = await page.textContent('body').then(t => t.includes('渤中28-1-N2') && t.includes('48.60 吨') && t.includes('含水 70.6%'))
  // F3 ask recent
  await page.getByRole('button', { name: '它最近怎么样' }).click()
  await page.waitForTimeout(300)
  r.askRecent = await page.textContent('body').then(t => t.includes('本页背景已由系统注入') && t.includes('N-02 近期生产平稳'))
  // F3 ask decline (mutually exclusive card updates)
  await page.getByRole('button', { name: '有没有递减风险？' }).click()
  await page.waitForTimeout(300)
  r.askDecline = await page.textContent('body').then(t => t.includes('评级：低'))
  r.mutual = await page.textContent('body').then(t => !t.includes('N-02 近期生产平稳'))
  // F1 switch to N-06: answer card must collapse, prod card becomes注水台账
  await page.locator('.ant-select').last().click()
  await page.waitForTimeout(200)
  await page.locator('.ant-select-dropdown').getByText('N-06（渤南 · 注水 · 分层注水 3 层）').click()
  await page.waitForTimeout(900)
  r.n06 = await page.textContent('body').then(t => t.includes('注水台账') && t.includes('P1:60,P2:40') && t.includes('劈分系数'))
  r.askCollapsed = await page.textContent('body').then(t => !t.includes('本页背景已由系统注入'))
  r.disabledOption = await page.textContent('body').then(t => t.includes('无查看权限的井不在此列表'))
  // F3 N-06 decline
  await page.getByRole('button', { name: '有没有递减风险？' }).click()
  await page.waitForTimeout(300)
  r.n06decline = await page.textContent('body').then(t => t.includes('注水井不做产油递减评级'))
  // F1 switch to N-11
  await page.locator('.ant-select').last().click()
  await page.waitForTimeout(200)
  await page.locator('.ant-select-dropdown').getByText('N-11（渤中 · 采油 · 停产）').click()
  await page.waitForTimeout(900)
  r.n11 = await page.textContent('body').then(t => t.includes('20260911-T3') && t.includes('单位误录'))
  // F4 chain: expand nested layers
  await page.getByText('下一层 · 检修').click()
  await page.waitForTimeout(300)
  r.chain = await page.textContent('body').then(t => t.includes('检泵 2026-08-28 → 2026-09-06') && t.includes('追溯结论'))
  // workbench switcher
  r.switcher = await page.locator('.ant-segmented').textContent().then(t => t.includes('问一问') && t.includes('变更审批台'))
}
if (KEY === 'A3') {
  await page.waitForTimeout(800) // skeleton -> loaded
  r.initial = await page.textContent('body').then(t => t.includes('#WB-20260922-02') && t.includes('待审批') && t.includes('注采比 β') && t.includes('副作用'))
  r.badges = await page.textContent('body').then(t => t.includes('建议像合同') && t.includes('高风险必须人点') && t.includes('全程审计'))
  r.audit1 = await page.locator('.ant-table').last().textContent().then(t => t.includes('老王') && t.includes('档案助手'))
  // F4 approve
  await page.getByRole('button', { name: '批准（高风险，必须人点）' }).click()
  await page.waitForTimeout(300)
  r.approved = await page.textContent('body').then(t => t.includes('已执行') && t.includes('生产原表（注水台账）不动'))
  r.btnGone = await page.getByRole('button', { name: '批准（高风险，必须人点）' }).count() === 0
  r.recordAppended = await page.textContent('body').then(t => t.includes('#WB-20260923-01 · 2026-09-23'))
  r.auditAppended = await page.locator('.ant-table').last().textContent().then(t => t.includes('阿强（当前角色 · 高风险终审）') && t.includes('配注优化助手'))
}

console.log(JSON.stringify({ key: KEY, results: r, consoleErrors: errors }, null, 1))
await page.screenshot({ path: `/tmp/v2-${KEY}.png`, fullPage: true })
await browser.close()
