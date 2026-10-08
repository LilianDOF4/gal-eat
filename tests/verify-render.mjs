// 跨插件渲染验证：加载 gal-view 与 gal-eat 两个**真实产物**，
// 用 gal-view 真实 StageView 渲染"带外部覆盖层 + 外部背景"的场景，
// 检查外部插件注册的界面到底有没有被渲染进舞台（并打印元素类型便于定位）。
//
// 用法: node tests/verify-render.mjs
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import React, { resetHooks } from './react-double.mjs'
import { createGalViewExt } from '../gal-view/.dsh-plugin/client/galview-ext.mjs'

const errors = []
const check = (cond, msg) => { if (!cond) errors.push(msg) }

const VIEW_CODE = readFileSync(fileURLToPath(new URL('../gal-view/.dsh-plugin/client.js', import.meta.url)), 'utf8')
const EAT_CODE = readFileSync(fileURLToPath(new URL('../.dsh-plugin/client.js', import.meta.url)), 'utf8')

// ---------------- 共用假环境 ----------------
const storageMap = new Map()
const makeWindow = () => ({
  localStorage: {
    getItem: k => (storageMap.has(k) ? storageMap.get(k) : null),
    setItem: (k, v) => storageMap.set(k, String(v)),
    removeItem: k => storageMap.delete(k),
  },
  addEventListener: () => {},
  removeEventListener: () => {},
  isSecureContext: false,
  __ModuleLoader__: null,
})
function fakeNode(tag = 'div') {
  return {
    tagName: String(tag).toUpperCase(), children: [], attrs: {}, className: '', textContent: '', style: {},
    setAttribute(k, v) { this.attrs[k] = String(v) },
    getAttribute(k) { return this.attrs[k] ?? null },
    append(c) { this.children.push(c); return this },
    remove() {},
    addEventListener() {},
    querySelector() { return null },
  }
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
/** gal-view 用了 MutationObserver 监听占位符变化：给个空壳。 */
globalThis.MutationObserver = class {
  observe() {}
  disconnect() {}
  takeRecords() { return [] }
}
globalThis.FileReader = class {
  readAsDataURL() {}
}
globalThis.indexedDB = {
  open: () => {
    const req = {}
    setTimeout(() => {
      req.result = {
        objectStoreNames: { contains: () => true },
        createObjectStore() {},
        transaction: () => {
          const tx = {}
          setTimeout(() => { if (typeof tx.oncomplete === 'function') tx.oncomplete() }, 0)
          tx.objectStore = () => ({ get: () => ({}), put: () => {}, getAll: () => ({}) })
          return tx
        },
        close() {},
      }
      if (typeof req.onupgradeneeded === 'function') req.onupgradeneeded()
      if (typeof req.onsuccess === 'function') req.onsuccess()
    }, 0)
    return req
  },
}
const requireStub = name => {
  if (name === 'react') return React
  throw new Error('产物 require 了未预期的模块: ' + name)
}

/** 加载一个产物，返回它的导出（name/inject/apply…）。 */
function loadBundle(code) {
  const win = makeWindow()
  let captured = null
  win.__ModuleLoader__ = { load: ({ id, factory }) => { captured = { id, ...factory(requireStub) } } }
  // verify-bundle 的老套路：用 new Function 提供 window/document/React 三件套
  new Function('window', 'document', 'setInterval', 'clearInterval', 'console', 'fetch', code)(
    win, documentMock, () => 0, () => {}, { info: () => {}, warn: () => {}, error: () => {} },
    () => Promise.reject(new Error('no network')),
  )
  return captured
}

// ---------------- 元素树工具 ----------------
function findByClass(node, cls) {
  let hit = null
  const walk = n => {
    if (hit !== null || n === null || n === undefined) return
    if (typeof n !== 'object') return
    if (Array.isArray(n)) { for (const c of n) walk(c); return }
    const cn = n.props?.className
    if (typeof cn === 'string' && cn.split(/\s+/).includes(cls)) { hit = n; return }
    walk(n.props?.children)
  }
  walk(node)
  return hit
}
function classesIn(node) {
  const out = new Set()
  const walk = n => {
    if (n === null || n === undefined || typeof n !== 'object') return
    if (Array.isArray(n)) { for (const c of n) walk(c); return }
    const cn = n.props?.className
    if (typeof cn === 'string') for (const c of cn.split(/\s+/)) if (c.startsWith('gv-') || c.startsWith('ge-')) out.add(c)
    walk(n.props?.children)
  }
  walk(node)
  return [...out]
}

// ---------------- ① 两个产物都能加载 ----------------
const viewPkg = loadBundle(VIEW_CODE)
check(viewPkg !== null, 'gal-view 产物应能加载')
check(typeof viewPkg.apply === 'function', 'gal-view 应导出 apply')

// ---------------- ② 建缝（gal-view 侧）并注册 gal-eat 的覆盖层 ----------------
const ext = createGalViewExt({
  host: { getScene: () => ({ elements: [] }), getAssets: () => new Map(), appendHistoryLine: () => true },
  console: { warn: () => {}, info: () => {}, error: () => {} },
})

const eatCleanups = []
let eatRuntime = null
const eatCtx = {
  get: name => (name === 'galViewExt' ? ext : undefined),
  provide: () => () => {},
  effect: (setup) => {
    const d = typeof setup === 'function' ? setup() : undefined
    eatCleanups.push(typeof d === 'function' ? d : () => {})
  },
  slots: { inject: () => {}, register: () => () => {} },
}
const eatPkg2 = loadBundle(EAT_CODE)
eatPkg2.apply(eatCtx)
eatRuntime = eatPkg2.__test?.runtime ?? null
check(eatRuntime !== null, '应能从 gal-eat 产物拿到 runtime 句柄')
const overlays = ext.listOverlays()
check(overlays.length === 4, 'gal-eat 应注册 4 个覆盖层，实际 ' + overlays.length)
for (const o of overlays) {
  check(o.runtime !== null && o.runtime !== undefined, '覆盖层 ' + o.id + ' 必须带 runtime')
}

// ---------------- ③ 从 gal-view 产物里取真实 StageView 并渲染 ----------------
const registered = []
const viewCtx = {
  get: () => undefined,
  provide: () => () => {},
  effect: (setup) => { if (typeof setup === 'function') setup() },
  slots: {
    inject: (name, fn) => { if (typeof fn === 'function') fn() },
    register: (options, Component) => {
      registered.push({ options, Component })
      return () => {}
    },
  },
}
viewPkg.apply(viewCtx)
check(registered.length >= 1, 'gal-view 应注册 conversation.view 槽位（实际 ' + registered.length + '）')

const entry = registered.find(r => r.options?.name === 'conversation.view')
const GalView = entry?.Component
check(typeof GalView === 'function', '应拿到 GalView 组件')

// 直接渲染 GalView：需要它的一堆注入 props（hooks 舱 + api）。
// 用最小替身：只要不抛错、且能从中找到外部覆盖层/背景即可。
const subs = () => () => {}
const mkHook = initial => fn => (typeof fn === 'function' ? fn(initial) : initial)
const scene = {
  version: 1,
  settings: { gridSize: 20, showGrid: false, assistantSpeaker: 'a1', autoSpeed: 1, stageW: 1920, stageH: 1080 },
  elements: [
    { id: 'bg', type: 'background', name: '背景', x: 0, y: 0, w: 960, h: 540, hidden: false, locked: true, order: 0, text: '', color: '#000', fontSize: 16, fontFamily: '', opacity: 1, rotation: 0, assetId: 'preset-bg' },
    // 角色立绘：id 必须等于 settings.assistantSpeaker，否则不会渲染（真实场景同此规则）
    { id: 'a1', type: 'character', name: '角色', x: 120, y: 80, w: 700, h: 700, hidden: false, locked: false, order: 10, text: '', color: '#9b8cff', fontSize: 16, fontFamily: '', opacity: 1, rotation: 0, assetId: '', character: { label: '妮丝', name: '妮丝', color: '#9b8cff' } },
    { id: 'dlg', type: 'dialogue', name: '对话框', x: 60, y: 380, w: 840, h: 130, hidden: false, locked: false, order: 40, text: '', color: '#fff', fontSize: 18, fontFamily: '', opacity: .9, rotation: 0, assetId: '' },
    { id: 'dtx', type: 'dialogue-text', name: '台词', x: 90, y: 400, w: 780, h: 90, hidden: false, locked: false, order: 41, text: '（测试台词）', color: '#fff', fontSize: 18, fontFamily: '', opacity: 1, rotation: 0, assetId: '' },
    { id: 'nm', type: 'speaker-name', name: 'AI名牌', x: 80, y: 350, w: 120, h: 26, hidden: false, locked: false, order: 42, text: 'AI', color: '#fff', fontSize: 14, fontFamily: '', opacity: 1, rotation: 0, assetId: '', role: 'assistant' },
  ],
}
const chatLegacy = {
  // 一条已定稿的 assistant 行 → GalView 才认为"当前有台词"（line 非 null），
  // 场景的对话框与台词框才会渲染出来。没有它，后面"对话框/立绘必须在舞台上"的断言没有意义。
  nodes: [{ kind: 'assistant', seq: 1, blocks: [{ kind: 'text', text: '（测试台词）' }] }],
  partial: null, runningCalls: [], turnEnds: new Map(), turnTimings: new Map(),
}

const props = {
  sessionId: 's1',
  // 游戏模式必须有"当前台词"才会渲染对话框与台词框（真实环境里 always 有）
  line: { key: 'k1', kind: 'assistant', text: '（测试台词）', speaker: { name: 'AI', color: '#fff' } },
  type: { target: '（测试台词）', shown: '（测试台词）', done: true },
  pending: [],
  questionControl: null,
  useSession: fn => (typeof fn === 'function' ? fn({ running: false, blank: false, promptError: null, pending: null }) : { running: false }),
  useInput: fn => (typeof fn === 'function' ? fn({ draft: '' }) : {}),
  inputActions: { submit: () => {}, setDraft: () => {} },
  useChat: fn => (typeof fn === 'function' ? fn({ legacy: chatLegacy }) : { legacy: chatLegacy }),
  // ^ chatLegacy 在下面定义：给一条已定稿的 assistant 行，GalView 才有"当前台词"，
  //   场景的对话框/台词框才会被渲染（否则 line 为 null，框根本不出现）
  useScene: mkHook(scene),
  useHistory: mkHook({ undo: 0, redo: 0 }),
  useAssets: mkHook({ map: new Map() }),
  useFonts: mkHook({ map: new Map() }),
  useStore: mkHook({ lineKey: null, pageIndex: 0, shown: '', done: true, dwellSince: null, statusHold: false }),
  useProjection: () => undefined,
  useAutoSaveStatus: mkHook({ lastAt: null }),
  useSessionPendingInteraction: fn => (typeof fn === 'function' ? fn(new Map()) : undefined),
  useSessionStatus: fn => (typeof fn === 'function' ? fn(new Map()) : undefined),
  actions: { saveProgress: () => {} },
  api: { setViewSessionId: () => {}, currentSessionId: () => 's1', hasSessionsService: () => false, mainTitle: () => 't' },
  galViewExt: ext,
}

resetHooks()
let tree = null
let threw = null
try {
  tree = GalView(props)
} catch (error) {
  threw = error
}
check(threw === null, 'GalView 渲染不该抛错：' + String(threw))
if (process.env.GALEAT_DEBUG) {
  console.log('[debug] 渲染出的 gv-/ge- 类名:', classesIn(tree).join(' '))
}

// ---------------- ④ 外部覆盖层必须真的进树 ----------------
// 置一个覆盖层 + 背景，再渲染一次，检查 gv-ext-overlay / gv-ext-backdrop 是否存在
ext.setBackdrop({ dataUrl: 'data:image/svg+xml,<svg/>' })
resetHooks()
let tree2 = null
threw = null
try { tree2 = GalView(props) } catch (error) { threw = error }
check(threw === null, '带背景/覆盖层时渲染不该抛错：' + String(threw))

const backdropEl = findByClass(tree2, 'gv-ext-backdrop')
const overlayEl = findByClass(tree2, 'gv-ext-overlay')
check(backdropEl !== null, '外部背景覆盖应渲染出 .gv-ext-backdrop')
check(overlayEl !== null, '外部覆盖层应渲染出 .gv-ext-overlay')
// 待机时：HUD 两半应渲染，吃饭页面与眼睛恢复入口不该渲染
const idleClasses = classesIn(tree2)
check(idleClasses.includes('ge-hud-left'), '待机时左上 HUD 应渲染')
check(idleClasses.includes('ge-hud-right'), '待机时右上 HUD（含「去吃饭」）应渲染')
check(!idleClasses.includes('ge-eat-layer'), '待机时不该有吃饭页面')
check(idleClasses.includes('ge-eat-btn'), '待机时「去吃饭」按钮应存在')

// ---------------- ⑤ 在真实 GalView 树里点「去吃饭」，看阶段与背景是否真的变 ----------------
function findButtonByText(node, text) {
  let hit = null
  const walk = n => {
    if (hit !== null || n === null || n === undefined || typeof n !== 'object') return
    if (Array.isArray(n)) { for (const c of n) walk(c); return }
    if (n.type === 'button') {
      const label = (() => {
        const collect = x => {
          if (x === null || x === undefined || x === false) return ''
          if (typeof x === 'string' || typeof x === 'number') return String(x)
          if (Array.isArray(x)) return x.map(collect).join('')
          if (typeof x === 'object') return collect(x.props?.children)
          return ''
        }
        return collect(n.props?.children)
      })()
      if (label === text) { hit = n; return }
    }
    walk(n.props?.children)
  }
  walk(node)
  return hit
}

check(ext.getBackdrop() !== null, '前面为了验证渲染设过背景（此处不应为空）')
ext.setBackdrop(null)   // 清干净，再验证"点一下才出现背景"
check(ext.getBackdrop() === null, '点击前不该有背景覆盖')
check(eatRuntime.eatSource.getSnapshot().phase === 'idle', '点击前应待机')
check(ext.listOverlays().length === 4, 'HUD 与吃饭页面应已注册')

resetHooks()
let tree3 = null
threw = null
try { tree3 = GalView(props) } catch (error) { threw = error }
check(threw === null, '点击前渲染不该抛错：' + String(threw))
if (process.env.GALEAT_DEBUG) {
  console.log('[debug] phase=', eatRuntime.eatSource.getSnapshot().phase,
    'hudVisible=', eatRuntime.hudVisible(), 'eyeOpen=', eatRuntime.eyeOpen())
  console.log('[debug] tree3 ge- 类名:', classesIn(tree3).filter(c => c.startsWith('ge-')).join(' '))
  // 把每个 gv-ext-overlay 容器里的直接子节点类型打出来，定位"哪一层没渲染"
  ;(() => {
    let idx = 0
    const walk = x => {
      if (x === null || x === undefined || typeof x !== 'object') return
      if (Array.isArray(x)) { for (const c of x) walk(c); return }
      const cn = x.props?.className
      if (typeof cn === 'string' && cn.split(/\s+/).includes('gv-ext-overlay')) {
        const kid = x.props?.children
        const describe = k => {
          if (k === null || k === undefined) return 'null'
          if (Array.isArray(k)) return '[' + k.map(describe).join(',') + ']'
          if (typeof k === 'string') return JSON.stringify(k)
          const cls = k.props?.className
          return '<' + String(k.type?.name ?? k.type) + (cls !== undefined ? ' class=' + cls : '') + '>'
        }
        console.log('[debug] overlay#' + (idx++) + ' 子节点:', describe(kid))
      }
      walk(x.props?.children)
    }
    walk(tree3)
  })()
  console.log('[debug] tree3 里 gv-ext-overlay 个数:', (() => {
    let n = 0
    const walk = x => {
      if (x === null || x === undefined || typeof x !== 'object') return
      if (Array.isArray(x)) { for (const c of x) walk(c); return }
      const cn = x.props?.className
      if (typeof cn === 'string' && cn.split(/\s+/).includes('gv-ext-overlay')) n += 1
      walk(x.props?.children)
    }
    walk(tree3)
    return n
  })())
  for (const o of ext.listOverlays()) {
    resetHooks()
    let el = null
    try { el = o.component({ overlayRuntime: o.runtime, extOptions: o.options }) } catch (e) { el = 'THREW: ' + e.message }
    const cls = typeof el === 'object' && el !== null ? classesIn(el).join(' ') : String(el)
    console.log('[debug] 覆盖层', o.id, '→', cls === '' ? String(el) : cls)
  }
}
const goEat = findButtonByText(tree3, '去吃饭')
check(goEat !== null, '真实 GalView 树里应能找到「去吃饭」按钮')
if (goEat !== null) {
  let clickErr = null
  try { goEat.props.onClick() } catch (error) { clickErr = error }
  check(clickErr === null, '点「去吃饭」不该抛错：' + String(clickErr))
  check(eatRuntime.eatSource.getSnapshot().phase === 'intro',
    '点「去吃饭」应进入 intro，实际 ' + eatRuntime.eatSource.getSnapshot().phase)
  check(ext.getBackdrop() !== null, '点「去吃饭」应**立刻**有背景覆盖（用户反馈的正是这一点没生效）')
  check(ext.stateSource.getSnapshot().stageOwned === true, '吃饭应接管舞台（HUD 让位给吃饭页面）')
  check(ext.getBlockReason() !== null, '吃饭应封锁发送')

  // 再渲染一次：此时吃饭页面应当出现在树里
  resetHooks()
  let tree4 = null
  try { tree4 = GalView(props) } catch (error) { check(false, '进街后渲染不该抛错：' + String(error)) }
  const after = classesIn(tree4)
  if (process.env.GALEAT_DEBUG) {
    console.log('[debug] 点击后 phase=', eatRuntime.eatSource.getSnapshot().phase,
      'hudVisible=', eatRuntime.hudVisible(), 'backdrop=', ext.getBackdrop()?.kind)
    console.log('[debug] 点击后 ge- 类名:', after.filter(c => c.startsWith('ge-')).join(' '))
  }
  check(after.includes('ge-eat-layer'), '进街后吃饭页面应渲染进舞台')
  // 美食街背景不再由本插件铺：改由 gal-view 的 ExtBackdrop（.gv-ext-backdrop）画在**所有场景元素之前**，
  // 否则会盖住角色立绘与对话框（这正是"吃饭页看不到立绘/对话框"的根因）。
  check(findByClass(tree4, 'gv-ext-backdrop') !== null, '进街后应由 gal-view 的 ExtBackdrop 铺美食街背景')
  check(after.includes('gv-el-character'), '立绘(.gv-el-character)必须仍在舞台上')
  check(after.includes('gv-dialogue'), '对话框(.gv-dialogue)必须仍在舞台上')
  // 舞台要打上 data-ext-backdrop 标记（插件据此隐掉自家的"家中背景"元素）
  const stageEl = (() => {
    let hit = null
    const walk = n => {
      if (hit !== null || n === null || n === undefined || typeof n !== 'object') return
      if (Array.isArray(n)) { for (const c of n) walk(c); return }
      const cn = n.props?.className
      if (typeof cn === 'string' && cn.split(/\s+/).includes('gv-stage')) { hit = n; return }
      walk(n.props?.children)
    }
    walk(tree4)
    return hit
  })()
  check(stageEl !== null && stageEl.props?.['data-ext-backdrop'] !== undefined,
    '外部背景生效时舞台应带 data-ext-backdrop 标记')
  // 而 HUD 应当让位（不再有 ge-hud-right）
  check(!after.includes('ge-hud-right'), '进街后 HUD 应让位给吃饭页面')
  // 台词覆盖：开场短语送进对话框
  const intro = eatRuntime.eatSource.getSnapshot()
  eatRuntime.say(intro.introLines[0] ?? '（开场）', 'gal-eat:intro:0')
  check(ext.getLineOverride() !== null, '开场短语应进对话框覆盖（走 gal-view 打字机）')
}

if (errors.length > 0) {
  console.error('FAIL 跨插件渲染验证：')
  for (const e of errors) console.error('  - ' + e)
  process.exit(1)
}
console.log('跨插件渲染验证 ALL OK：两个产物可共存加载；gal-eat 注册 4 层覆盖层（带 runtime）；'
  + 'gal-view 真实 StageView 把外部背景渲染成 .gv-ext-backdrop、把外部覆盖层渲染成 .gv-ext-overlay，'
  + '且覆盖层内部是 gal-eat 的真实组件内容')
process.exit(0)
