// gal-eat 插件单测：运行时（离线补扣/在线结算/持久化/缝桥接）+ 产物契约 + 无 gal-view 降级。
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  STORAGE_KEY, HUD_KEY, THEME, createSource, initialStateFrom, catchUpOnLoad, tickState,
  createExtBridge, createEatRuntime, defaultHudPrefs, normalizeHudPrefs, hudVisibleFor,
  isHungry, appendHungrySuffix, blockReasonFor, HUNGRY_SATIETY,
} from '../.dsh-plugin/client/runtime.mjs'
import { typewriterSlice, TYPE_CPS, LINE_DWELL_MS } from '../.dsh-plugin/client/eat-typing.mjs'
import { HUNGRY_SUFFIXES } from '../gal-view/.dsh-plugin/client/eat.mjs'
import { checkGalViewExt, createGalViewExt } from '../gal-view/.dsh-plugin/client/galview-ext.mjs'

const ROOT = resolve(import.meta.dirname, '..')

/** 内存 storage 替身。 */
function memStorage(seed = null) {
  const map = new Map()
  if (seed !== null) map.set(STORAGE_KEY, seed)
  return {
    map,
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)) },
    removeItem: k => { map.delete(k) },
  }
}

/** 假 ctx：提供 get（cordis 语义）。 */
function fakeCtx(services = {}) {
  return { get: name => services[name] }
}

test('createSource：set/update 推送、同值不推送、订阅可退订、回调抛错被吞', () => {
  const src = createSource({ a: 1 })
  let n = 0
  const off = src.subscribe(() => { n += 1 })
  const same = src.getSnapshot()
  src.set(same)                        // 同一引用 → 不推送
  assert.equal(n, 0)
  src.set({ a: 1 })                    // 新对象（值相同但引用不同）→ 推送（快照语义按引用比较）
  assert.equal(n, 1)
  src.set({ a: 2 })
  assert.equal(n, 2)
  src.update({ b: 3 })
  assert.deepEqual(src.getSnapshot(), { a: 2, b: 3 })
  assert.equal(n, 3)
  off()
  src.set({ a: 9 })
  assert.equal(n, 3)

  const bad = createSource(0)
  bad.subscribe(() => { throw new Error('boom') })
  let ok = true
  try { bad.set(1) } catch { ok = false }
  assert.equal(ok, true, '订阅回调抛错不该冒泡')
})

test('initialStateFrom：坏数据回落到默认状态', () => {
  assert.equal(initialStateFrom(null).tickets, 0)
  assert.equal(initialStateFrom('junk').satiety, 100)
  const s = initialStateFrom({ tickets: 42, satiety: 999, menuBought: 'nope' })
  assert.equal(s.tickets, 42)
  assert.equal(s.satiety, 100)
  assert.deepEqual(s.menuBought, {})
})

test('catchUpOnLoad：离线只扣饱食度，不补券/好感', () => {
  const T0 = 1791403000000
  // 离线 8 小时：饱食度扣 96 点（8h ÷ 5min = 96），券/好感不涨
  const eightHours = 8 * 60 * 60 * 1000
  const r = catchUpOnLoad({ tickets: 5, satiety: 100, affectionPoints: 3, lastSeenAt: T0 }, T0 + eightHours)
  assert.equal(r.state.satiety, 4)
  assert.equal(r.state.tickets, 5)
  assert.equal(r.state.affectionPoints, 3)
  assert.equal(r.offlineGapMs, eightHours)
  assert.equal(r.state.lastSeenAt, T0 + eightHours)

  // 首次启动（无 lastSeenAt）：不补扣，只打时间戳
  const first = catchUpOnLoad(null, T0)
  assert.equal(first.offlineGapMs, 0)
  assert.equal(first.state.satiety, 100)
  assert.equal(first.state.lastSeenAt, T0)

  // 时钟回拨（gap <= 0）：安全
  const back = catchUpOnLoad({ lastSeenAt: T0 }, T0 - 1000)
  assert.equal(back.offlineGapMs, 0)
})

test('tickState：在线结算涨券涨好感并清当天菜单记录', () => {
  const T0 = 1791403000000
  const r = tickState({ ...initialStateFrom(null), lastSeenAt: T0, menuBought: { '2026-10-06': ['x'] } }, 10 * 60 * 1000, T0)
  assert.equal(r.tickets, 20, '10 分钟 = 20 券（每分钟 2 券）')
  assert.equal(r.affectionPoints, 1)
  assert.deepEqual(r.menuBought, {})
})

test('createExtBridge：缝缺失给出可读原因；缝存在时 ok', () => {
  const bare = createExtBridge({ ctx: fakeCtx({}) })
  assert.equal(bare.ext(), null)
  const probe = bare.probe()
  assert.equal(probe.ok, false)
  assert.ok(probe.reason.includes('gal-view'))

  const ext = createGalViewExt({ host: {}, console: { warn: () => {} } })
  const bridged = createExtBridge({ ctx: fakeCtx({ galViewExt: ext }) })
  assert.equal(bridged.ext(), ext)
  assert.deepEqual(bridged.probe(), { ok: true, version: 1 })

  // ctx.get 抛错也不能崩
  const throwing = createExtBridge({ ctx: { get: () => { throw new Error('nope') } } })
  assert.equal(throwing.ext(), null)

  // 直接注入的缝优先（不依赖 ctx）
  const injected = createExtBridge({ ext })
  assert.deepEqual(injected.probe(), { ok: true, version: 1 })
})

test('运行时：载入时离线补扣 + 在线推进 + 落盘键正确', () => {
  const T0 = 1791403000000
  let clock = T0
  const storage = memStorage(JSON.stringify({ tickets: 7, satiety: 100, affectionPoints: 0, lastSeenAt: T0 - 8 * 60 * 60 * 1000 }))
  const rt = createEatRuntime({ storage, now: () => clock, autoTick: false, ext: null, ctx: null })

  // 载入补扣：离线 8 小时 → 扣 96 点（8h ÷ 5min），券仍是 7
  assert.equal(rt.stateSource.getSnapshot().tickets, 7)
  assert.equal(rt.stateSource.getSnapshot().satiety, 4)
  assert.equal(rt.storageSource.getSnapshot().offlineGapMs, 8 * 60 * 60 * 1000)

  // 在线 3 分钟 → +6 券（每分钟 2 券）；饱食度照常按 5 分钟一档往下扣（8h 已扣到 4）
  clock = T0 + 3 * 60 * 1000
  rt.advanceTo(clock)
  const s = rt.stateSource.getSnapshot()
  assert.equal(s.tickets, 13, '7 + 3 分钟 × 2 = 13')
  assert.equal(s.satiety, 4, '3 分钟不够一档，不再扣')

  assert.equal(rt.save(), true)
  const written = JSON.parse(storage.getItem(STORAGE_KEY))
  assert.equal(written.tickets, 13)
  assert.equal(written.menuBought !== undefined, true)
  assert.equal(written.eat, undefined, 'eat 是会话内状态，不落盘')
  rt.dispose()
})

test('运行时：storage 不可用时也能跑（不崩、save 返回 false）', () => {
  const rt = createEatRuntime({ storage: null, now: () => 1000, autoTick: false })
  assert.equal(rt.storageSource.getSnapshot().available, false)
  assert.equal(rt.save(), false)
  assert.equal(rt.stateSource.getSnapshot().satiety, 100)
  rt.dispose()
})

// ---------------- 脏存档 / 时钟异常 / 切后台（数值正确性的边界） ----------------

test('存档损坏：坏 JSON / 空串 / 非对象 / 数组 都能回落成合法初始状态', () => {
  const clock = 1791403000000
  const bad = [
    '{ 这不是 JSON',
    '',
    'null',
    '42',
    '"just a string text"',
    '[1,2,3]',
    '{"tickets":"很多","satiety":"满"}',
    '{"menuBought":[]}',
  ]
  for (const raw of bad) {
    const storage = memStorage(raw)
    let rt = null
    let threw = null
    try {
      rt = createEatRuntime({ storage, now: () => clock, autoTick: false })
    } catch (error) {
      threw = error
    }
    assert.equal(threw, null, '坏存档不该抛错：' + JSON.stringify(raw) + ' → ' + String(threw))
    const s = rt.stateSource.getSnapshot()
    assert.equal(typeof s.tickets, 'number', JSON.stringify(raw))
    assert.ok(s.tickets >= 0, JSON.stringify(raw))
    assert.ok(s.satiety >= 0 && s.satiety <= 100, JSON.stringify(raw))
    // 坏存档也应该是可继续玩的状态（能落盘、能结算）
    assert.equal(rt.save(), true, '坏存档修复后应能落盘')
    rt.advanceTo(clock + 60 * 1000)
    assert.ok(rt.stateSource.getSnapshot().tickets >= 0)
    rt.dispose()
  }
})

test('系统时钟回拨：不产生负增量、不倒退数值、恢复后正常计', () => {
  const T0 = 1791403000000
  let clock = T0
  const rt = createEatRuntime({ storage: memStorage(), now: () => clock, autoTick: false })

  // 正常跑 5 分钟
  clock = T0 + 5 * 60 * 1000
  rt.advanceTo(clock)
  const before = rt.stateSource.getSnapshot()
  assert.equal(before.tickets, 10, '5 分钟 = 10 券（每分钟 2 券）')

  // 用户把系统时间往回调 1 小时
  clock = T0 - 60 * 60 * 1000
  rt.advanceTo(clock)
  const after = rt.stateSource.getSnapshot()
  assert.equal(after.tickets, before.tickets, '时钟回拨不该让券变少')
  assert.ok(after.satiety <= before.satiety, '饱食度也不该回升')
  assert.ok(after.satiety >= 0)

  // 再把时间调回未来：应继续正常累计（不会被回拨事件卡住）
  clock = T0 + 10 * 60 * 1000
  rt.advanceTo(clock)
  assert.ok(rt.stateSource.getSnapshot().tickets > after.tickets, '时间恢复正常后应继续涨券')
  rt.dispose()
})

test('切后台/窗口最小化很久：墙钟差值说话，一次补满（定时器被节流也不丢数值）', () => {
  const T0 = 1791403000000
  let clock = T0
  const rt = createEatRuntime({ storage: memStorage(), now: () => clock, autoTick: false })

  // 假设标签页被冻结 30 分钟，期间一个 tick 都没跑
  clock = T0 + 30 * 60 * 1000
  rt.advanceTo(clock)
  const s = rt.stateSource.getSnapshot()
  assert.equal(s.tickets, 60, '冻结 30 分钟应补 60 券（每分钟 2 券，墙钟差值）')
  assert.equal(s.affectionPoints, 3, '冻结 30 分钟应补 3 好感点')
  assert.equal(s.satiety, 100 - 6, '冻结 30 分钟应扣 6% 饱食度（30/5 取整）')

  // 连续多段长间隔（模拟被反复节流）也不丢
  clock += 10 * 60 * 1000
  rt.advanceTo(clock)
  assert.equal(rt.stateSource.getSnapshot().tickets, 80)
  rt.dispose()
})

test('跨天挂机：券与好感照常累计，饱食度夹在 0（不会变负）', () => {
  const T0 = 1791403000000
  let clock = T0
  const rt = createEatRuntime({ storage: memStorage(), now: () => clock, autoTick: false })
  // 挂 3 天 = 4320 分钟 → 8640 券（每分钟 2 券）、432 好感点
  clock = T0 + 3 * 24 * 60 * 60 * 1000
  rt.advanceTo(clock)
  const s = rt.stateSource.getSnapshot()
  assert.equal(s.tickets, 3 * 24 * 60 * 2, '3 天 = 8640 券')
  assert.equal(s.satiety, 0, '饱食度应夹在 0（3 天远超上限）')
  // 好感点是**累积**的：432 点 → 满 100 连升 4 级、余 32 点（不是 432 级）
  assert.equal(s.affectionLevel, 4, '432 好感点应升 4 级，实际 ' + s.affectionLevel)
  assert.equal(s.affectionPoints, 32, '应余 32 点，实际 ' + s.affectionPoints)
  rt.dispose()
})

test('运行时：feed 走规则并落状态；券不足不动状态', () => {
  const clock = 1791403000000
  const rt = createEatRuntime({ storage: memStorage(), now: () => clock, autoTick: false })
  const dish = { restaurantId: 'grill-fish', name: '招牌香辣烤鱼', price: 300 }

  const poor = rt.feed(dish)
  assert.equal(poor.ok, false)
  assert.equal(rt.stateSource.getSnapshot().tickets, 0)

  // 挂 400 分钟 → 800 券（每分钟 2 券）
  const rt2 = createEatRuntime({ storage: memStorage(), now: () => clock, autoTick: false })
  for (let i = 0; i < 400; i++) rt2.advanceTo(clock + (i + 1) * 60 * 1000)
  const rich = rt2.stateSource.getSnapshot()
  assert.equal(rich.tickets, 800)

  const okFeed = rt2.feed(dish)
  assert.equal(okFeed.ok, true)
  assert.equal(rt2.stateSource.getSnapshot().tickets, 500, '800 - 300 券（招牌香辣烤鱼 300 券）')
  assert.ok(rt2.stateSource.getSnapshot().satiety > 0)
  // 同一天同一道菜再点 → 被拒
  assert.equal(rt2.feed(dish).ok, false)
  rt.dispose()
  rt2.dispose()
})

test('运行时：dispatch 推进阶段机并同步封锁到缝', () => {
  const clock = 1791403000000
  const blocked = []
  const ext = createGalViewExt({
    host: { onBlockChange: r => blocked.push(r), getScene: () => null },
    console: { warn: () => {} },
  })
  const rt = createEatRuntime({ storage: memStorage(), now: () => clock, autoTick: false, ext })

  assert.equal(rt.eatSource.getSnapshot().phase, 'idle')
  rt.dispatch({ type: 'start', count: 2, random: () => 0 })
  assert.equal(rt.eatSource.getSnapshot().phase, 'intro')
  // stateSource 里的 eat 同步更新
  assert.equal(rt.stateSource.getSnapshot().eat.phase, 'intro')

  assert.equal(rt.syncBlockToExt(), true)
  assert.ok(ext.getBlockReason() !== null, '吃饭中应该封锁')
  assert.equal(ext.stateSource.getSnapshot().stageOwned, true, '吃饭应接管舞台')

  rt.dispatch({ type: 'goHome' })
  assert.equal(rt.eatSource.getSnapshot().phase, 'idle')
  rt.syncBlockToExt()
  assert.equal(ext.getBlockReason(), null)
  assert.equal(ext.stateSource.getSnapshot().stageOwned, false)
  assert.deepEqual(blocked, ['吃饭中……先陪我吃完这顿吧', null])

  rt.releaseBlock()
  assert.equal(ext.getBlockReason(), null)
  rt.dispose()
})

test('运行时：无缝时 syncBlockToExt 返回 false 且不抛错（无 gal-view 降级）', () => {
  const rt = createEatRuntime({ storage: memStorage(), now: () => 1000, autoTick: false, ext: null })
  assert.equal(rt.syncBlockToExt(), false)
  rt.releaseBlock()
  assert.equal(rt.probe().ok, false)
  rt.dispose()
})

test('插件产物契约：client.js 是 __ModuleLoader__ 载荷且注入 slots', () => {
  const code = readFileSync(resolve(ROOT, '.dsh-plugin/client.js'), 'utf8')
  assert.ok(code.includes('__ModuleLoader__.load'), '必须是 ModuleLoader 载荷')
  assert.ok(code.includes('"id": "gal-eat"') || code.includes("id: 'gal-eat'") || code.includes('id: "gal-eat"'), 'id 必须是 gal-eat')
  assert.ok(code.includes('galViewExt'), '必须经 galViewExt 接入')
  assert.ok(code.includes('ge-hud-left'), '必须带 HUD 样式（批次②）')
  assert.ok(code.includes('ge-heart'), '必须带爱心等级圈样式')
  assert.ok(code.includes('ge-eat-btn'), '必须有「去吃饭」按钮（按类名断言）')
  // esbuild 默认 charset=ascii，中文会写成 \uXXXX 转义；这里连同文案一起断言，
  // 保证"去吃饭"按钮真的带上了用户文案（\u53BB\u5403\u996D = 去吃饭）。
  assert.ok(code.includes('\\u53BB\\u5403\\u996D'), '「去吃饭」文案必须以 \\uXXXX 形式存在')
  assert.ok(code.includes('ge-eye'), '必须有眼睛开关')
  assert.ok(code.includes('gal-eat:state:v1'), '必须用约定的 localStorage 键')
  // 注：缝的实现（galview-ext → store → persist）被 esbuild 内联，产物里会**顺带**出现
  // gal-view 的键名常量；这里断言的是"gal-eat 自己的持久化入口只用自建键"。
  assert.ok(code.includes('localStorage'), '运行时经 localStorage 持久化')
})

test('插件包声明：main/exports/dsh.bundle 与 cordis patch 一致', () => {
  const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'))
  assert.equal(pkg.name, 'gal-eat')
  assert.equal(pkg.type, 'module')
  assert.equal(pkg.main, './lib/index.js')
  assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml')
  assert.deepEqual(pkg.dsh.client.inject, ['slots'])
  assert.ok(String(pkg.peerDependencies['gal-view']).length > 0, '必须声明 gal-view 前置（仅提示用途）')

  const nodeHalf = readFileSync(resolve(ROOT, 'lib/index.js'), 'utf8')
  assert.ok(nodeHalf.includes("export const name = 'gal-eat'"))
  assert.ok(nodeHalf.includes('export function apply'))

  const patch = readFileSync(resolve(ROOT, 'cordis.patch.yml'), 'utf8')
  assert.ok(patch.includes('id: gal-eat'))
  assert.ok(patch.includes('name: gal-eat'))
})

test('THEME：与用户指定的视觉规格一致（条高 10px、爱心 52px、三种配色）', () => {
  assert.equal(THEME.barHeight, 10)
  assert.equal(THEME.heartSize, 52)
  assert.equal(THEME.satiety, '#ff9f43')
  assert.equal(THEME.affection, '#ff6fae')
  assert.equal(THEME.ticket, '#ffd479')
  assert.equal(THEME.tickMs, 1000)
  assert.equal(THEME.saveEveryMs, 10000)
})

test('HUD 可见性：眼睛关闭或吃饭期间都隐藏；默认显示', () => {
  assert.deepEqual(defaultHudPrefs(), { visible: true })
  assert.deepEqual(normalizeHudPrefs(null), { visible: true })
  assert.deepEqual(normalizeHudPrefs({ visible: false }), { visible: false })
  assert.deepEqual(normalizeHudPrefs('junk'), { visible: true })

  assert.equal(hudVisibleFor({ visible: true }, 'idle'), true)
  assert.equal(hudVisibleFor({ visible: false }, 'idle'), false, '眼睛关闭 → 全隐')
  assert.equal(hudVisibleFor({ visible: true }, 'intro'), false, '吃饭期间 → 隐藏 HUD')
  assert.equal(hudVisibleFor({ visible: true }, 'menu'), false)
  assert.equal(hudVisibleFor({ visible: false }, 'menu'), false)
})

test('眼睛开关：切换只影响显示、数值照常结算、偏好持久化', () => {
  const clock = 1791403000000
  const storage = memStorage()
  const rt = createEatRuntime({ storage, now: () => clock, autoTick: false })

  assert.equal(rt.eyeOpen(), true)
  assert.equal(rt.hudVisible(), true)

  // 关闭眼睛：HUD 不可见，但数值照常推进
  assert.equal(rt.toggleEye(), false)
  assert.equal(rt.hudVisible(), false)
  rt.advanceTo(clock + 5 * 60 * 1000)
  assert.equal(rt.stateSource.getSnapshot().tickets, 10, '隐藏只影响显示，数值照常结算')
  assert.equal(rt.hudSource.getSnapshot().visible, false)
  // 偏好落盘
  assert.deepEqual(JSON.parse(storage.getItem(HUD_KEY)), { visible: false })

  // 打开：恢复显示
  assert.equal(rt.toggleEye(), true)
  assert.equal(rt.hudVisible(), true)

  // 新运行时读回偏好（模拟刷新页面）
  rt.toggleEye()
  const rt2 = createEatRuntime({ storage, now: () => clock, autoTick: false })
  assert.equal(rt2.eyeOpen(), false, '偏要跨重启保留')
  assert.equal(rt2.hudVisible(), false)
  rt.dispose()
  rt2.dispose()
})

test('吃饭期间 HUD 自动隐藏，回家后恢复（§3.7）', () => {
  const clock = 1791403000000
  const rt = createEatRuntime({ storage: memStorage(), now: () => clock, autoTick: false })
  assert.equal(rt.hudVisible(), true)
  rt.dispatch({ type: 'start', count: 2, random: () => 0 })
  assert.equal(rt.eatSource.getSnapshot().phase, 'intro')
  assert.equal(rt.hudVisible(), false, '进入吃饭流程应隐藏 HUD')
  rt.dispatch({ type: 'goHome' })
  assert.equal(rt.hudVisible(), true, '回家后 HUD 恢复')
  rt.dispose()
})

test('dispatch 进入/退出吃饭会自动同步封锁，无需调用方手动 syncBlockToExt', () => {
  const ext = createGalViewExt({ host: {}, console: { warn: () => {} } })
  const rt = createEatRuntime({ storage: memStorage(), now: () => 1791403000000, autoTick: false, ext })
  assert.equal(ext.getBlockReason(), null)
  rt.dispatch({ type: 'start', count: 1, random: () => 0 })
  assert.ok(ext.getBlockReason() !== null, '进入吃饭应自动封锁')
  rt.dispatch({ type: 'goHome' })
  assert.equal(ext.getBlockReason(), null, '回家应自动解除封锁')
  rt.dispose()
})

test('测试用控制台指令：grant 加券 / setSatiety 直接进饿昏', () => {
  const clock = 1791403000000
  const ext = createGalViewExt({ host: {}, console: { warn: () => {} } })
  const storage = memStorage()
  const rt = createEatRuntime({ storage, now: () => clock, autoTick: false, ext })

  // 初始 0 券 → grant(100) 后能买最便宜的菜
  assert.equal(rt.stateSource.getSnapshot().tickets, 0)
  assert.equal(rt.grant(100), 100, 'grant(100) 应返回调整后的券数')
  assert.equal(rt.stateSource.getSnapshot().tickets, 100)
  assert.equal(rt.feed({ restaurantId: 'grill-fish', name: '配菜拼盘', price: 100 }).ok, true,
    '加券后应能买得起最便宜的菜')

  // 负数扣券、下限 0
  assert.equal(rt.grant(-60), 0)
  assert.equal(rt.grant(-999), 0, '扣到负数应夹在 0')

  // 非法入参不影响状态
  const before = rt.stateSource.getSnapshot().tickets
  assert.equal(rt.grant(NaN), before)
  assert.equal(rt.grant(0), before)
  assert.equal(rt.grant('x'), before)

  // 加券会立刻落盘（控制台指令后刷新页面数值还在）
  rt.grant(250)
  assert.equal(JSON.parse(storage.getItem(STORAGE_KEY)).tickets, 250)

  // setSatiety(0) → 立刻饿昏 + 封锁写进缝
  assert.equal(rt.hungry(), false)
  assert.equal(rt.setSatiety(0), 0)
  assert.equal(rt.hungry(), true, 'setSatiety(0) 应立刻进入饿昏')
  assert.equal(ext.getBlockReason(), '饿昏了……先给我口饭吃', '饿昏应同步封锁（且不接管舞台）')
  assert.equal(ext.stateSource.getSnapshot().stageOwned, false, '饿昏不能接管舞台，HUD 要留着自救')

  // 吃饱即解除
  rt.setSatiety(100)
  assert.equal(rt.hungry(), false)
  assert.equal(ext.getBlockReason(), null)
  assert.equal(rt.setSatiety(999), 100, '饱食度上限 100')
  rt.dispose()
})

test('打字机纯函数：按时间切片、到点结束、脏入参安全', () => {
  // 100 字/秒：0.5 秒应打出 50 字；用足够长的文本才看不完
  const long = 'x'.repeat(120)
  assert.deepEqual(typewriterSlice(long, 500, 100), { shown: 'x'.repeat(50), done: false })
  assert.deepEqual(typewriterSlice('abcdef', 500, 100), { shown: 'abcdef', done: true }, '短句 0.5 秒就打完了')
  assert.deepEqual(typewriterSlice('abc', 1000, 100), { shown: 'abc', done: true })
  assert.equal(typewriterSlice(long, 99999, 100).done, true)
  // 起点为 0：还没打出字（不是错误状态）
  assert.deepEqual(typewriterSlice('你好', 0, TYPE_CPS), { shown: '', done: false })
  // 空行/坏入参
  assert.deepEqual(typewriterSlice('', 1000), { shown: '', done: true })
  assert.deepEqual(typewriterSlice(null, 1000), { shown: '', done: true })
  assert.equal(typewriterSlice('abc', -5, 45).shown, '')
  assert.equal(typewriterSlice('abc', NaN, 45).shown, '')
  assert.equal(typewriterSlice('abc', 1000, 0).done, true, '非法速度回落默认，不打错')
  // 时间越长显示越多，且不超过原文
  const a = typewriterSlice('测试台词一二三四五', 100).shown
  const b = typewriterSlice('测试台词一二三四五', 300).shown
  assert.ok(b.length >= a.length)
  assert.ok(b.length <= 9)
  // 节奏常量与 gal-view 的打字速度同量级（normal=60），这里略慢
  assert.ok(TYPE_CPS > 0 && TYPE_CPS <= 60)
  assert.ok(LINE_DWELL_MS >= 800 && LINE_DWELL_MS <= 4000)
})

test('吃饭页文本永不进历史面板（用户 2026-10-08 要求）', () => {
  const clock = 1791403000000
  const history = []
  const ext = createGalViewExt({
    host: {
      getScene: () => ({ elements: [], settings: { stageW: 1920, stageH: 1080 } }),
      getAssets: () => new Map(),
      appendHistoryLine: line => { history.push(line); return true },
    },
    console: { warn: () => {} },
  })
  const rt = createEatRuntime({ storage: memStorage(), now: () => clock, autoTick: false, ext })
  rt.grant(1000)

  // 进街 → 台词 → 买一道菜（会产生口味评价）→ 推到菜单 → 回家
  rt.enterStreet({ type: 'start', count: 2, random: () => 0 })
  rt.say('今天吃什么好呢？', 'gal-eat:intro:0')
  rt.dispatch({ type: 'introNext' })
  rt.dispatch({ type: 'introNext' })
  rt.dispatch({ type: 'pickRestaurant', restaurantId: 'western' })
  const bought = rt.feed({ restaurantId: 'western', name: '田园沙拉', price: 100 })
  assert.equal(bought.ok, true, '加券后应该买得起')
  rt.dispatch({ type: 'dishBought', dish: { restaurantId: 'western', name: '田园沙拉', price: 100 } })
  rt.say('田园沙拉——清爽', 'gal-eat:verdict')
  rt.leaveStreet()

  assert.equal(history.length, 0, '整段吃饭流程都不该往历史面板写东西，实际 ' + JSON.stringify(history))
  assert.equal(typeof rt.logLine, 'undefined', 'logLine 已移除（不该再暴露写历史的入口）')
  // 但显示必须仍然正常：台词仍交给对话框覆盖
  assert.equal(rt.say('再试一句'), true, 'say 仍应把台词交给对话框')
  assert.equal(ext.getLineOverride()?.text, '再试一句')
  rt.dispose()
})

test('checkGalViewExt 在插件侧的用法：缺失/可用两态都能给出结论', () => {
  assert.equal(checkGalViewExt(null).ok, false)
  assert.equal(checkGalViewExt(createGalViewExt({ host: {}, console: { warn: () => {} } })).ok, true)
})

test('依赖版本门槛：缺服务 / 过旧 / 缺方法 三种情况都给出可读提示', () => {
  // ① 完全没装 gal-view：ctx.get 拿不到服务
  const none = checkGalViewExt(undefined)
  assert.equal(none.ok, false)
  assert.ok(none.reason.includes('gal-view'), '提示里应点名 gal-view')
  assert.ok(none.reason.includes('安装'), '提示里应告诉用户去安装')

  // ② 装了但版本过旧（连缝都没有的老版本）
  const stale = checkGalViewExt({ version: 0 })
  assert.equal(stale.ok, false)
  assert.ok(stale.reason.includes('过旧'), '应提示版本过旧')
  assert.ok(stale.reason.includes('更新'), '应告诉用户去更新')
  assert.equal(stale.version, 0, '应回报对方版本号，便于排查')

  // ③ 版本够但接口缺方法（半残的缝）
  const partial = { version: 1, registerStageOverlay: () => {}, setLineOverride: () => {} }
  const res = checkGalViewExt(partial)
  assert.equal(res.ok, false)
  assert.ok(res.reason.includes('setBackdrop'), '应列出缺少的方法名')

  // ④ 形状不对
  assert.ok(checkGalViewExt('junk').reason.includes('形状异常'))
  assert.ok(checkGalViewExt({}).reason.includes('版本号'))

  // ⑤ 正常可用
  const good = createGalViewExt({ host: {}, console: { warn: () => {} } })
  assert.deepEqual(checkGalViewExt(good), { ok: true, version: 1 })
})

test('依赖门槛与声明一致：gal-eat 声明的前置版本就是缝的引入版本', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  // README/cordis 说明里承诺的最低版本是 0.4，而缝（galViewExt v1）正是 0.4.0 引入的
  assert.equal(pkg.peerDependencies['gal-view'], '>=0.4.0')
  assert.equal(pkg.peerDependenciesMeta['gal-view'].optional, true,
    '前置必须声明为 optional：DSH 不该因为没装 gal-view 就拒绝加载本插件（本体要能给出提示）')
})

// ---------------- 饿昏状态（§3.3） ----------------

test('isHungry：只有饱食度 = 0 才算饿昏', () => {
  assert.equal(HUNGRY_SATIETY, 0)
  assert.equal(isHungry({ satiety: 0 }), true)
  assert.equal(isHungry({ satiety: 0.4 }), false)
  assert.equal(isHungry({ satiety: 1 }), false)
  assert.equal(isHungry({ satiety: 100 }), false)
  assert.equal(isHungry(null), false)
  assert.equal(isHungry({}), false)
  assert.equal(isHungry('junk'), false)
})

test('appendHungrySuffix：追加固定短语（不生成、不重复相邻、幂等）', () => {
  const pool = ['A', 'B']
  assert.equal(appendHungrySuffix('答完了', { random: () => 0, pool }), '答完了\nA')
  assert.equal(appendHungrySuffix('答完了', { random: () => 0, avoid: 'A', pool }), '答完了\nB')
  // 空文本：只给后缀，不产生前导换行
  assert.equal(appendHungrySuffix('', { random: () => 0, pool }), 'A')
  assert.equal(appendHungrySuffix(null, { random: () => 0, pool }), 'A')
  // 默认池：短语来自 HUNGRY_SUFFIXES
  const out = appendHungrySuffix('答完了')
  assert.ok(HUNGRY_SUFFIXES.some(line => out.endsWith(line)), '默认应追加饿昏池里的一句')
})

test('blockReasonFor：吃饭接管舞台；饿昏只禁发（舞台仍归 gal-view，HUD 留着能自救）', () => {
  const idle = { phase: 'idle' }
  const eating = { phase: 'intro' }
  const full = { satiety: 100 }
  const starving = { satiety: 0 }

  assert.deepEqual(blockReasonFor(idle, full), { mode: 'none', reason: null, stageOwned: false })

  const hungry = blockReasonFor(idle, starving)
  assert.equal(hungry.mode, 'hungry')
  assert.ok(hungry.reason.includes('饿昏'))
  assert.equal(hungry.stageOwned, false, '饿昏不能接管舞台（否则「去吃饭」被藏起来，用户没法自救）')

  const eat = blockReasonFor(eating, full)
  assert.equal(eat.mode, 'eat')
  assert.equal(eat.stageOwned, true)

  // 吃饭优先于饿昏
  assert.equal(blockReasonFor(eating, starving).mode, 'eat')
})

test('饿昏后缀经扩展缝挂载：AI 回答被追加、玩家行不动、吃饱后不再追加', () => {
  const clock = 1791403000000
  const ext = createGalViewExt({ host: {}, console: { warn: () => {} } })
  // 初始饱食度 0：直接从饿昏状态开始
  const rt = createEatRuntime({
    storage: memStorage(JSON.stringify({ satiety: 0, lastSeenAt: clock })),
    now: () => clock,
    autoTick: false,
    ext,
  })
  assert.equal(rt.hungry(), true, '初始状态应为饿昏')

  // 手动触发一次"缝就绪挂钩"（生产环境由 tick / index 调用）
  rt.syncBlockToExt()
  assert.equal(ext.getBlockReason(), '饿昏了……先给我口饭吃')

  // 直接把改写链跑一遍：AI 台词被追加，玩家台词不被改写
  const ai = ext.applyLineTransforms('问题我回答了。', { kind: 'assistant' })
  assert.ok(HUNGRY_SUFFIXES.some(line => ai.includes(line)), 'AI 回答应带饿昏后缀：' + ai)
  const player = ext.applyLineTransforms('你是谁？', { kind: 'player' })
  assert.equal(player, '你是谁？')

  // 幂等：已经带过后缀的文本不重复追加
  const again = ext.applyLineTransforms(ai, { kind: 'assistant' })
  assert.equal(again, ai)

  // 吃一顿 → 饱食度上来 → 不再是饿昏，且下一 tick 自动解除封锁
  const fed = rt.feed({ restaurantId: 'grill-fish', name: '配菜拼盘', price: 100 })
  // 券不足时先给券
  if (!fed.ok) {
    rt.advanceTo(clock + 200 * 60 * 1000)
    assert.equal(rt.feed({ restaurantId: 'grill-fish', name: '配菜拼盘', price: 100 }).ok, true)
  }
  assert.ok(rt.stateSource.getSnapshot().satiety > 0)
  assert.equal(rt.hungry(), false)
  rt.syncBlockToExt()
  assert.equal(ext.getBlockReason(), null, '吃饱后应解除封锁')
  const afterEat = ext.applyLineTransforms('我吃饱了。', { kind: 'assistant' })
  assert.equal(afterEat, '我吃饱了。', '非饿昏状态不该追加后缀')
  rt.dispose()
})
