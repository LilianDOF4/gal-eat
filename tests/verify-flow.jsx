// 流程集成仿真（真渲染版）：加载**真实客户端产物** → apply(ctx) → **渲染**已注册的覆盖层组件
// → 在真实元素树上找按钮并点击，验证"点一下会发生什么"。
//
// 覆盖不到的：真实浏览器布局/像素（要人眼）。覆盖得到的：
//   ① apply 的正常 / 降级（无 gal-view）两条路径；覆盖层注册（4 层）与卸载清理
//   ② **渲染期就把背景切过去**（首版只放 effect 里，导致"点了去吃饭背景不变"）——
//      这条现在由渲染断言守住，不依赖 effect 是否执行
//   ③ HUD 真渲染出数字/爱心等级；「去吃饭」点一下真的推进阶段并封锁
//   ④ 吃饭页面各阶段真渲染（intro 的继续/回家、菜单的购买按钮启用与禁用、评价页）
//   ⑤ 点击「购买」真的调用 feed（带 restaurantId，每日限购记账要用）
//   ⑥ 首次启动 0 券；挂机 100 分钟可买最便宜的菜；存档损坏仍能起来
//
// 用法: node --loader ./tests/jsx-loader.mjs tests/verify-flow.jsx
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import React, { resetHooks } from './react-double.mjs'
import { createGalViewExt } from '../gal-view/.dsh-plugin/client/galview-ext.mjs'

const ROOT = resolve(import.meta.dirname, '..')
const code = readFileSync(resolve(ROOT, '.dsh-plugin/client.js'), 'utf8')

const errors = []
const check = (cond, msg) => { if (!cond) errors.push(msg) }

// ---------------- 元素树工具 ----------------
function walk(node, visit) {
  if (node === null || node === undefined || typeof node !== 'object') return
  if (Array.isArray(node)) { for (const n of node) walk(n, visit); return }
  visit(node)
  walk(node.props?.children, visit)
}

function allText(node) {
  let out = ''
  walk(node, el => { /* 只收集字符串子节点 */ })
  const collect = n => {
    if (n === null || n === undefined || n === false) return ''
    if (typeof n === 'string' || typeof n === 'number') return String(n)
    if (Array.isArray(n)) return n.map(collect).join('')
    if (typeof n === 'object') return collect(n.props?.children)
    return ''
  }
  return collect(node) || out
}

function buttons(node) {
  const out = []
  walk(node, el => {
    if (el.type === 'button') {
      const label = allText(el.props?.children)
      out.push({ label, props: el.props, disabled: el.props?.disabled === true })
    }
  })
  return out
}

function findByAttr(node, attr) {
  let hit = null
  walk(node, el => { if (hit === null && el.props !== undefined && el.props[attr] !== undefined) hit = el })
  return hit
}

/** 收集树里所有 class 名（用于断言"某个界面/样式有没有渲染出来"）。 */
function classesIn(node) {
  const out = new Set()
  walk(node, el => {
    const cn = el.props?.className
    if (typeof cn === 'string') for (const c of cn.split(/\s+/)) if (c !== '') out.add(c)
  })
  return [...out]
}

/** 取某个 class 的元素的 inline style（用于断言缩放等样式真的应用了）。 */
function styleOfClass(node, cls) {
  let hit = null
  walk(node, el => {
    if (hit !== null) return
    const cn = el.props?.className
    if (typeof cn === 'string' && cn.split(/\s+/).includes(cls)) hit = el.props?.style ?? null
  })
  return hit
}

/** 收集树里所有 title（鼠标悬停提示词），用于断言提示真的挂上了。 */
function titlesIn(node) {
  const out = []
  walk(node, el => {
    const t = el.props?.title
    if (typeof t === 'string' && t !== '') out.push(t)
  })
  return out
}

// ---------------- 假宿主环境 ----------------
let captured = null
const storageMap = new Map()
const windowMock = {
  localStorage: {
    getItem: k => (storageMap.has(k) ? storageMap.get(k) : null),
    setItem: (k, v) => storageMap.set(k, String(v)),
    removeItem: k => storageMap.delete(k),
  },
  addEventListener: () => {},
  removeEventListener: () => {},
  __ModuleLoader__: { load: ({ id, factory }) => { captured = { id, ...factory(name => {
    if (name === 'react') return React
    throw new Error('产物 require 了未预期的模块: ' + name)
  }) } } },
}
function fakeNode(tag = 'div') {
  const node = {
    tagName: String(tag).toUpperCase(), children: [], attrs: {}, className: '', textContent: '', style: {},
    setAttribute(k, v) { node.attrs[k] = String(v) },
    getAttribute(k) { return node.attrs[k] ?? null },
    append(c) { node.children.push(c); return node },
    remove() {},
    addEventListener() {},
    querySelector() { return null },
  }
  return node
}
const documentMock = {
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: tag => fakeNode(tag),
  head: { append() {} },
  body: fakeNode('body'),
  addEventListener: () => {},
  removeEventListener: () => {},
}

/** 加载产物并 apply；返回 { pkg, cleanups, threw }。 */
function boot(ext, seed = null) {
  storageMap.clear()
  if (seed !== null) storageMap.set('gal-eat:state:v1', seed)
  resetHooks()
  new Function('window', 'document', 'setInterval', 'clearInterval', 'console', code)(
    windowMock, documentMock, () => 0, () => {}, { info: () => {}, warn: () => {}, error: () => {} },
  )
  const cleanups = []
  const ctx = {
    get: name => (name === 'galViewExt' ? ext ?? undefined : undefined),
    provide: () => () => {},
    effect: (setup) => {
      const dispose = typeof setup === 'function' ? setup() : undefined
      cleanups.push(typeof dispose === 'function' ? dispose : () => {})
    },
    slots: { inject: () => {}, register: () => () => {} },
  }
  let threw = null
  try { captured.apply(ctx) } catch (error) { threw = error }
  return { pkg: captured, cleanups, threw }
}

function richState(tickets = 1000, satiety = 50) {
  return JSON.stringify({ tickets, satiety, affectionPoints: 0, affectionLevel: 3, lastSeenAt: Date.now(), menuBought: {} })
}

/** 渲染某个覆盖层：拿到组件后按 gal-view 的方式调用（传 overlayRuntime）。 */
function renderOverlay(ext, id, runtime) {
  const item = ext.listOverlays().find(o => o.id === id)
  if (item === undefined) return null
  resetHooks()
  return item.component({ overlayRuntime: item.runtime ?? null, extOptions: item.options ?? {} })
}

// ============================================================================
// 场景 A：装好 gal-view —— 真渲染 + 真点击
// ============================================================================
{
  const history = []
  const blockHistory = []
  const ext = createGalViewExt({
    host: {
      onBlockChange: r => blockHistory.push(r),
      getScene: () => ({ elements: [] }),
      getAssets: () => new Map(),
      appendHistoryLine: line => { history.push(line); return true },
    },
    console: { warn: () => {}, info: () => {}, error: () => {} },
  })
  const { pkg, threw, cleanups } = boot(ext, richState())
  check(threw === null, 'A: apply 不该抛错：' + String(threw))
  check(pkg.__test?.runtime !== null && pkg.__test?.runtime !== undefined, 'A: 应导出内部 runtime 句柄')
  const rt = pkg.__test.runtime
  check(ext.listOverlays().length === 4, 'A: 应注册 4 个覆盖层，实际 ' + ext.listOverlays().length)

  // —— ② 覆盖层注册时必须带上 runtime（否则渲染层拿不到状态源，界面出不来）——
  for (const item of ext.listOverlays()) {
    check(item.runtime !== null && item.runtime !== undefined,
      'A: 覆盖层 ' + item.id + ' 注册时必须带 runtime（首版漏了这一步 → 界面渲染不出来）')
  }

  // —— ③ HUD 真渲染 ——
  const left = renderOverlay(ext, 'gal-eat-hud-left', rt)
  const leftText = allText(left)
  check(leftText.includes('饱食度'), 'A: HUD 左应渲染出「饱食度」，实际 ' + JSON.stringify(leftText.slice(0, 40)))
  check(leftText.includes('好感度'), 'A: HUD 左应渲染出「好感度」')
  check(leftText.includes('50%'), 'A: 应显示当前饱食度数值 50%')
  check(leftText.includes('3'), 'A: 应显示好感等级 3')

  const right = renderOverlay(ext, 'gal-eat-hud-right', rt)
  const hudButtons = buttons(right)
  check(hudButtons.some(b => b.label === '去吃饭'), 'A: HUD 右应有「去吃饭」按钮，实际 ' + JSON.stringify(hudButtons.map(b => b.label)))
  check(allText(right).includes('1000'), 'A: HUD 右应显示券数 1000')

  // —— ④ 点「去吃饭」：阶段真的推进 + 背景真的换 + 封锁 ——
  check(ext.getBackdrop() === null, 'A: 点击前不该有背景覆盖')
  const eatBtn = hudButtons.find(b => b.label === '去吃饭')
  eatBtn.props.onClick()
  check(rt.eatSource.getSnapshot().phase === 'intro', 'A: 点「去吃饭」应进入 intro，实际 ' + rt.eatSource.getSnapshot().phase)
  check(ext.getBackdrop() !== null, 'A: 点「去吃饭」后应立刻有背景覆盖（渲染期兜底）')
  check(ext.stateSource.getSnapshot().stageOwned === true, 'A: 吃饭应接管舞台')
  check(ext.getBlockReason() !== null, 'A: 吃饭应封锁')
  check(rt.hudVisible() === false, 'A: 吃饭期间 HUD 应隐藏')

  // —— 界面放大（用户验收：左上 ×2、右上 ×2、吃饭右栏 ×1.5）——
  // 待机时渲染 HUD 两半，断言真的带上了缩放
  rt.leaveStreet()
  const hudView = renderOverlay(ext, 'gal-eat-hud-left', rt)
  const hudLeftStyle = styleOfClass(hudView, 'ge-hud-left')
  check(hudLeftStyle?.transform === 'scale(2)', 'A: 左上双条应放大到 200%，实际 ' + JSON.stringify(hudLeftStyle?.transform))
  const hudRightView = renderOverlay(ext, 'gal-eat-hud-right', rt)
  const hudRightStyle = styleOfClass(hudRightView, 'ge-hud-right')
  check(hudRightStyle?.transform === 'scale(2)', 'A: 右上券/去吃饭应放大到 200%，实际 ' + JSON.stringify(hudRightStyle?.transform))
  check(hudRightStyle?.transformOrigin === '100% 0', 'A: 右上以右上角为原点缩放（否则会被推出画面）')
  // 两条状态条的悬停提示词（与鲸元券/去吃饭同样的 title）
  const hints = titlesIn(hudView)
  const satHint = hints.find(t => String(t).includes('饱食度：'))
  const affHint = hints.find(t => String(t).includes('好感度：'))
  check(satHint !== undefined, 'A: 饱食度条应有悬停提示词')
  check(affHint !== undefined, 'A: 好感度条应有悬停提示词')
  check(String(satHint).includes('上涨') && String(satHint).includes('下降'), 'A: 饱食度提示要写清涨/降规则')
  check(String(affHint).includes('上涨') && String(affHint).includes('下降'), 'A: 好感度提示要写清涨/降规则')
  // 右上角鲸元券的悬停提示：必须写"每分钟 +2"
  // （曾把速率硬编码成"挂机 1 分钟 = 1 券"，改速率时漏改，被用户发现）
  const rightHints = titlesIn(hudRightView)
  const ticketHint = rightHints.find(t => String(t).includes('鲸元券'))
  check(ticketHint !== undefined, 'A: 鲸元券数字应有悬停提示词，实际提示=' + JSON.stringify(rightHints))
  check(String(ticketHint).includes('每分钟 +2'), 'A: 鲸元券提示应写每分钟 +2，实际 ' + JSON.stringify(ticketHint))
  check(!String(ticketHint).includes('1 券'), 'A: 鲸元券提示不该再有旧的"1 券"')
  rt.enterStreet({ type: 'start', count: 2, random: () => 0 })

  // —— ⑤ 吃饭页面真渲染（intro）——
  const introView = renderOverlay(ext, 'gal-eat-eat', rt)
  check(introView !== null, 'A: 吃饭页面应渲染出来')
  const introText = allText(introView)
  check(introText.includes('美食街'), 'A: 吃饭页面应含「美食街」标题')
  const introClasses = classesIn(introView)
  // 用户验收反馈后的最终设计：**不再自绘对话框**（自绘版会变成大色块、且拿不到立绘），
  // 台词改为交给 gal-view 自己的对话框（setLineOverride → 它自带样式/名牌/立绘/打字机）。
  check(!introClasses.includes('ge-fake-dlg'), 'A: 不该再自绘对话框（应改用 gal-view 自己的对话框）')
  check(!introClasses.includes('ge-eat-veil'), 'A: 不该有半透黑罩子（用户明确要求去掉）')
  const eatRightStyle = styleOfClass(introView, 'ge-eat-right')
  check(eatRightStyle?.transform === 'scale(1.5)', 'A: 吃饭页右栏应放大到 150%，实际 ' + JSON.stringify(eatRightStyle?.transform))
  // 顶栏（美食街·时段 / 鲸元券 / 回家）放大 150%
  const headStyle = styleOfClass(introView, 'ge-eat-head')
  // 必须用 zoom（布局级缩放）：用 transform 时盒子仍按整条 1920px 布局，
  // 只有视觉变宽，最左侧的「美食街·时段」会被推出舞台（用户实测过两次）。
  check(headStyle?.zoom === '1.5', 'A: 吃饭页顶栏应以 zoom 放大到 150%，实际 ' + JSON.stringify(headStyle?.zoom))
  check(headStyle?.transform === undefined, 'A: 顶栏不该用 transform 缩放（会把左右两端挤出舞台）')
  check(!buttons(introView).some(b => b.label === '继续'), 'A: 不该再需要点「继续」（文字自动推进）')
  const introButtons = buttons(introView).map(b => b.label)
  check(introButtons.includes('今天不吃了，回家'), 'A: intro 应保留「今天不吃了，回家」')
  // 台词必须能交给 gal-view 的对话框（真实环境由组件 effect 调用；这里直接驱动同一个能力）
  const introSession = rt.eatSource.getSnapshot()
  rt.say(introSession.introLines[0], 'gal-eat:intro:0')
  const lineOverride = ext.getLineOverride()
  check(lineOverride !== null, 'A: 吃饭台词应能交给 gal-view 对话框显示（setLineOverride）')
  if (lineOverride !== null) {
    check(introSession.introLines.includes(lineOverride.text),
      'A: 覆盖的台词应是开场短语之一，实际 ' + JSON.stringify(lineOverride.text))
  }
  rt.clearLine()

  // —— ⑥ 推进到菜单并渲染 ——
  // 开场自动推进在真实环境靠 effect 定时；这里直接驱动阶段机（等价于"说完了"）
  rt.dispatch({ type: 'introNext' })
  rt.dispatch({ type: 'introNext' })
  check(rt.eatSource.getSnapshot().phase === 'restaurant', 'A: 说满应进餐厅列表（实际 ' + rt.eatSource.getSnapshot().phase + '）')
  const listView = renderOverlay(ext, 'gal-eat-eat', rt)
  const cards = buttons(listView).map(b => b.label).filter(l => l.includes('券'))
  check(cards.length >= 5, 'A: 餐厅列表应渲染 5 家以上卡片，实际 ' + cards.length)

  rt.dispatch({ type: 'pickRestaurant', restaurantId: 'western' })
  const menuView = renderOverlay(ext, 'gal-eat-eat', rt)
  const menuText = allText(menuView)
  check(menuText.includes('话梅西餐厅'), 'A: 菜单应显示餐厅名')
  check(menuText.includes('罐焖牛肉'), 'A: 菜单应列出菜品')
  const buyButtons = buttons(menuView).filter(b => ['购买', '券不够', '已售罄'].includes(b.label))
  check(buyButtons.length === 6, 'A: 应有 6 个购买按钮，实际 ' + buyButtons.length)
  check(buyButtons.filter(b => b.label === '购买').length === 6, 'A: 1000 券时六档都买得起')
  // 菜品收益写进菜单栏中间那片空位：饱食度增量 + 好感增量（含高价额外）
  const gainClasses = classesIn(menuView).filter(c => c.startsWith('ge-gain-') || c === 'ge-dish-gain')
  check(gainClasses.includes('ge-dish-gain'), 'A: 菜品行应有收益栏（中间那片空位）')
  const menuText2 = allText(menuView)
  check(menuText2.includes('饱食 +'), 'A: 收益栏应写出饱食度增量，实际文本片段=' + JSON.stringify(menuText2.slice(0, 120)))
  check(menuText2.includes('好感 +'), 'A: 收益栏应写出好感增量')
  const gainTitles = titlesIn(menuView).filter(t => t.includes('吃下「'))
  check(gainTitles.length === 6, 'A: 六道菜都应有收益悬停提示，实际 ' + gainTitles.length)
  check(gainTitles.some(t => t.includes('好感 +')), 'A: 收益提示里应含好感增量')

  // 点第一道菜（100 券）→ 真的扣券并进 verdict
  const before = rt.stateSource.getSnapshot()
  const firstBuy = buttons(menuView).find(b => b.label === '购买')
  firstBuy.props.onClick()
  const after = rt.stateSource.getSnapshot()
  check(after.tickets === before.tickets - 100, 'A: 点购买应扣 100 券（' + before.tickets + '→' + after.tickets + '）')
  check(after.satiety === Math.min(100, before.satiety + 20), 'A: 点购买应加 20% 饱食度')
  check(rt.eatSource.getSnapshot().phase === 'verdict', 'A: 购买后应进 verdict')
  check(String(rt.eatSource.getSnapshot().lastVerdict).startsWith('田园沙拉——'), 'A: 评价应以菜名开头，实际 ' + rt.eatSource.getSnapshot().lastVerdict)

  // 再渲染一次菜单：购买后停在 verdict → 先回家，再重新进店（pickRestaurant 直接进菜单），
  // 刚买过的那道应显示「已售罄」且禁用
  rt.leaveStreet()
  rt.dispatch({ type: 'start', count: 1, random: () => 0 })
  rt.dispatch({ type: 'introNext' })
  rt.dispatch({ type: 'pickRestaurant', restaurantId: 'western' })
  check(rt.eatSource.getSnapshot().phase === 'menu', 'A: 应回到菜单阶段，实际 ' + rt.eatSource.getSnapshot().phase)
  const menuAgain = renderOverlay(ext, 'gal-eat-eat', rt)
  const againLabels = buttons(menuAgain).map(b => b.label)
  const soldOut = buttons(menuAgain).filter(b => b.label === '已售罄')
  check(soldOut.length === 1, 'A: 刚买过的菜应显示「已售罄」，实际 ' + soldOut.length
    + '（按钮：' + JSON.stringify(againLabels) + '）')
  check(soldOut[0]?.disabled === true, 'A: 已售罄按钮应禁用')
  // 用户要求（2026-10-08）：**任何吃饭页文本都不进历史面板** —— 评价只显示在吃饭页面上
  check(history.length === 0, 'A: 口味评价不该进历史面板，实际写了 ' + history.length + ' 条：'
    + JSON.stringify(history.map(l => l.text)))

  // —— ⑦ 回家（从菜单点「今天不吃了，回家」）：背景恢复、封锁解除、HUD 回来 ——
  const menuHomeBtn = buttons(menuAgain).find(b => b.label === '今天不吃了，回家')
  check(menuHomeBtn !== undefined, 'A: 菜单应有「今天不吃了，回家」按钮')
  menuHomeBtn.props.onClick()
  check(rt.eatSource.getSnapshot().phase === 'idle', 'A: 点回家应回 idle，实际 ' + rt.eatSource.getSnapshot().phase)
  check(rt.hudVisible() === true, 'A: 回家后 HUD 应恢复')
  check(ext.getBackdrop() === null, 'A: 回家应恢复家中背景')
  check(ext.getBlockReason() === null, 'A: 回家应解除封锁')
  check(ext.stateSource.getSnapshot().stageOwned === false, 'A: 回家应复位 stageOwned')
  // 吃饭页面在 idle 阶段不该渲染
  check(renderOverlay(ext, 'gal-eat-eat', rt) === null, 'A: idle 阶段吃饭页面不该渲染')

  // —— ⑧ 卸载 ——
  for (const fn of cleanups) {
    try { fn() } catch (error) { check(false, 'A: 清理钩子抛错：' + String(error)) }
  }
  check(ext.listOverlays().length === 0, 'A: 卸载应注销覆盖层')
  check(pkg.__test.runtime === null, 'A: 卸载应清空 runtime 句柄')
  check(blockHistory.filter(r => r !== null).length >= 1, 'A: 封锁变化应通知宿主')
  // 整段流程走完（含多句台词 + 多条评价），历史面板必须一条都没被写过
  check(history.length === 0, 'A: 整段吃饭流程都不该往历史面板写东西，实际 ' + history.length + ' 条')
}

// ============================================================================
// 场景 B：没有 gal-view —— 降级不崩
// ============================================================================
{
  const { threw, cleanups, pkg } = boot(null)
  check(threw === null, 'B: 无缝时 apply 不该抛错：' + String(threw))
  check(pkg.__test.runtime.ext() === null, 'B: 应取不到缝')
  check(pkg.__test.runtime.probe().ok === false, 'B: 探测应报不可用')
  check(pkg.__test.runtime.applyBackdrop(true) === false, 'B: 无缝时换背景应安全返回 false')
  check(pkg.__test.runtime.syncBlockToExt() === false, 'B: 无缝时同步封锁应安全返回 false')
  const t0 = pkg.__test.runtime.stateSource.getSnapshot().tickets
  pkg.__test.runtime.advanceTo(Date.now() + 3 * 60 * 1000)
  check(pkg.__test.runtime.stateSource.getSnapshot().tickets >= t0 + 2, 'B: 无缝时数值仍应照常结算')
  for (const fn of cleanups) {
    try { fn() } catch (error) { check(false, 'B: 清理钩子抛错：' + String(error)) }
  }
}

// ============================================================================
// 场景 C：全新用户首次启动
// ============================================================================
{
  const ext = createGalViewExt({ host: {}, console: { warn: () => {}, info: () => {}, error: () => {} } })
  const { pkg, threw } = boot(ext, null)
  check(threw === null, 'C: 首次启动不该抛错')
  const rt = pkg.__test.runtime
  const s = rt.stateSource.getSnapshot()
  check(s.tickets === 0, 'C: 首次启动券应为 0')
  check(s.satiety === 100, 'C: 首次启动饱食度应为 100')
  check(rt.hungry() === false, 'C: 首次启动不该饿昏')
  check(rt.feed({ restaurantId: 'grill-fish', name: '配菜拼盘', price: 100 }).ok === false, 'C: 0 券买不起')
  rt.advanceTo(Date.now() + 100 * 60 * 1000)
  check(rt.feed({ restaurantId: 'grill-fish', name: '配菜拼盘', price: 100 }).ok === true, 'C: 挂机 100 分钟应买得起最便宜的菜')
}

// ============================================================================
// 场景 D：存档损坏
// ============================================================================
{
  const ext = createGalViewExt({ host: {}, console: { warn: () => {}, info: () => {}, error: () => {} } })
  for (const raw of ['{ 坏 JSON', '', 'null', '[1,2]', '{"tickets":"很多"}']) {
    storageMap.clear()
    storageMap.set('gal-eat:state:v1', raw)
    let threw = null
    let pkg = null
    try { ({ pkg } = boot(ext)) } catch (error) { threw = error }
    check(threw === null, 'D: 坏存档不该让插件起不来（' + JSON.stringify(raw) + '）')
    const rt = pkg?.__test?.runtime
    check(rt !== null && rt !== undefined, 'D: 坏存档也应建好 runtime（' + JSON.stringify(raw) + '）')
    if (rt !== null && rt !== undefined) {
      const s = rt.stateSource.getSnapshot()
      check(typeof s.tickets === 'number' && s.tickets >= 0, 'D: 券应合法（' + JSON.stringify(raw) + '）')
      check(s.satiety >= 0 && s.satiety <= 100, 'D: 饱食度应合法（' + JSON.stringify(raw) + '）')
    }
  }
}

// ============================================================================
// 场景 E：台词交给 gal-view 自己的对话框（不再自绘对话框）
// ============================================================================
{
  const ext = createGalViewExt({
    host: {
      getScene: () => ({ elements: [], settings: { stageW: 1920, stageH: 1080 } }),
      getAssets: () => new Map(),
      appendHistoryLine: () => true,
    },
    console: { warn: () => {}, info: () => {}, error: () => {} },
  })
  const { pkg } = boot(ext, richState())
  const rt = pkg.__test.runtime

  // 进街：把当前开场短语交给 gal-view 的对话框 + 换背景
  rt.enterStreet({ type: 'start', count: 2, random: () => 0 })
  const intro = rt.eatSource.getSnapshot()
  check(intro.phase === 'intro', 'E: 应进入 intro')
  rt.say(intro.introLines[0], 'gal-eat:intro:0')
  const line = ext.getLineOverride()
  check(line !== null, 'E: 台词应写进 gal-view 的对话框（setLineOverride）')
  check(line !== null && line.text === intro.introLines[0], 'E: 覆盖的应是当前开场短语')
  check(ext.getBackdrop() !== null, 'E: 应同时换上美食街背景')

  // 说下一条：覆盖要跟着变（否则玩家一直看到同一句）
  rt.dispatch({ type: 'introNext' })
  const second = rt.eatSource.getSnapshot()
  const secondLine = second.introLines[second.introIndex]
  rt.say(secondLine, 'gal-eat:intro:1')
  check(ext.getLineOverride() !== null && ext.getLineOverride().text === secondLine,
    'E: 推进后覆盖应换成第二条短语')

  // 说满进餐厅列表：台词也要更新（指引用右边招牌）
  rt.dispatch({ type: 'introNext' })
  check(rt.eatSource.getSnapshot().phase === 'restaurant', 'E: 说满应进餐厅列表')
  rt.say('想吃哪一家？', 'gal-eat:restaurant')
  check(ext.getLineOverride() !== null && ext.getLineOverride().text === '想吃哪一家？',
    'E: 餐厅阶段台词应更新')

  // 回家：撤掉台词覆盖 + 恢复背景
  rt.leaveStreet()
  check(ext.getLineOverride() === null, 'E: 回家应撤掉台词覆盖（对话框回到正常转写）')
  check(ext.getBackdrop() === null, 'E: 回家应恢复家中背景')
}

if (errors.length > 0) {
  console.error('FAIL gal-eat 流程集成仿真（真渲染）：')
  for (const e of errors) console.error('  - ' + e)
  process.exit(1)
}
console.log('gal-eat 流程集成仿真（真渲染）ALL OK：'
  + '覆盖层带 runtime 注册 → HUD 渲染出数字/爱心等级 → 点「去吃饭」推进阶段并立刻换背景+封锁(接管舞台) → '
  + '吃饭页面各阶段真渲染（台词交给 gal-view 自己的对话框：无黑罩子、无自绘对话框、无需点继续；餐厅卡片、菜单 6 档购买按钮）→ '
  + '点购买真扣券加饱食度并给评价 → 已售罄禁用 → 回家复位 → 卸载清理；'
  + '无 gal-view / 首次启动 / 坏存档三种情形均安全')
process.exit(0)
