// 端到端仿真：加载 gal-eat 的真实产物（.dsh-plugin/client.js）→ 调 apply(ctx) →
// 按宿主契约仿真 slots / provide / get，断言：
//   ① 没有 gal-view（缝缺失）：插件正常加载、不抛错、注册的覆盖层为 0
//   ② 有 gal-view（缝存在）：插件注册舞台覆盖层，且能驱动缝（台词/背景/封锁）
//   ③ 卸载钩子生效：effect 清理时解除封锁、注销覆盖层
//
// 这是"插件产物"层面的门禁：跑 `node tests/verify-plugin.mjs`。
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createGalViewExt } from '../gal-view/.dsh-plugin/client/galview-ext.mjs'

const ROOT = resolve(import.meta.dirname, '..')
const code = readFileSync(resolve(ROOT, '.dsh-plugin/client.js'), 'utf8')

/** React 替身：createElement 记录调用；hooks 用最小实现。 */
let hookIndex = 0
const hookState = []
const reactStub = {
  createElement: (type, props, ...children) => ({ type, props: { ...(props ?? {}), children } }),
  useState: (init) => {
    const i = hookIndex++
    if (hookState.length <= i) hookState[i] = typeof init === 'function' ? init() : init
    return [hookState[i], next => { hookState[i] = next }]
  },
  useEffect: () => {},
  useMemo: fn => fn(),
  useRef: (init) => ({ current: init }),
  useCallback: fn => fn,
  useSyncExternalStore: (sub, get) => get(),
  Fragment: 'fragment',
}
reactStub.default = reactStub
const requireStub = name => {
  if (name === 'react') return reactStub
  throw new Error('unexpected require: ' + name)
}

/** 仿真宿主：捕获 ModuleLoader 载荷。 */
let captured = null
const windowMock = {
  localStorage: (() => {
    const map = new Map()
    return { getItem: k => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: k => map.delete(k) }
  })(),
  addEventListener: () => {},
  removeEventListener: () => {},
  __ModuleLoader__: { load: ({ id, factory }) => { captured = { id, ...factory(requireStub) } } },
}
/** 极简 DOM 节点替身（够 showDegradedNotice 用）。 */
function fakeNode(tag = 'div') {
  const node = {
    tagName: String(tag).toUpperCase(),
    children: [],
    attrs: {},
    className: '',
    textContent: '',
    type: '',
    parent: null,
    setAttribute(k, v) { node.attrs[k] = String(v) },
    getAttribute(k) { return node.attrs[k] ?? null },
    append(child) { child.parent = node; node.children.push(child); return node },
    remove() {
      if (node.parent !== null) {
        const i = node.parent.children.indexOf(node)
        if (i >= 0) node.parent.children.splice(i, 1)
        node.parent = null
      }
    },
    addEventListener() {},
    querySelector(sel) {
      const key = String(sel).replace(/^\[|\]$/g, '')
      const walk = n => {
        for (const c of n.children) {
          if (c.attrs[key] !== undefined) return c
          const hit = walk(c)
          if (hit !== null) return hit
        }
        return null
      }
      return walk(node)
    },
  }
  return node
}

const documentMock = {
  // 仿真"每次都是全新页面"：style 守卫查不到已注入的样式，apply 才会真正执行。
  // （幂等守卫本身在单测里另有覆盖：真实页面上第二次 apply 会直接返回。）
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: tag => fakeNode(tag),
  head: { append() {} },
  body: fakeNode('body'),
  addEventListener: () => {},
  removeEventListener: () => {},
}

const errors = []
function check(cond, message) {
  if (!cond) errors.push(message)
}

/** 仿真 cordis 的 ctx.effect(setup, label)：先执行 setup 拿 disposer（与内核语义一致）。 */
function effectCollector(cleanups) {
  return (setup, label) => {
    const dispose = typeof setup === 'function' ? setup() : undefined
    cleanups.push([typeof dispose === 'function' ? dispose : () => {}, label])
  }
}
function loadPlugin() {
  // 每次加载都重置模块级状态之外的东西：产物是纯函数体，直接 new Function 执行。
  new Function('window', 'document', 'setInterval', 'clearInterval', 'console', code)(
    windowMock, documentMock, () => 0, () => {}, { info: () => {}, warn: () => {}, error: () => {} },
  )
  return captured
}

// ---------------- 场景 ①：没有 gal-view ----------------
{
  const pkg = loadPlugin()
  check(pkg !== null, '① ModuleLoader 未捕获到载荷')
  check(pkg.id === 'gal-eat', '① id 应为 gal-eat，实际 ' + String(pkg?.id))
  check(typeof pkg.apply === 'function', '① 应导出 apply')
  check(Array.isArray(pkg.inject) && pkg.inject.includes('slots'), '① inject 应含 slots')

  const overlays = []
  const cleanups = []
  const ctx = {
    get: () => undefined,                       // 没有 galViewExt
    provide: () => () => {},
    effect: effectCollector(cleanups),
    slots: { inject: () => {}, register: () => () => {} },
  }
  let threw = null
  try {
    pkg.apply(ctx)
  } catch (error) {
    threw = error
  }
  check(threw === null, '① 无 gal-view 时 apply 不该抛错，实际：' + String(threw))
  check(overlays.length === 0, '① 缝缺失时不应注册覆盖层')
  check(cleanups.length >= 1, '① 应登记卸载钩子（ctx.effect）')
  // 降级探测结果必须点名 gal-view 并告诉用户怎么办（这条提示会显示在 GAL 视窗里）
  const rt = pkg.__test?.runtime
  check(rt !== null && rt !== undefined, '① 应导出内部 runtime 句柄')
  if (rt !== null && rt !== undefined) {
    const probe = rt.probe()
    check(probe.ok === false, '① 探测应报不可用')
    check(String(probe.reason).includes('gal-view'), '① 提示应点名 gal-view，实际：' + probe.reason)
    check(String(probe.reason).includes('安装'), '① 提示应告诉用户去安装')
    check(rt.ext() === null, '① 应取不到缝')
  }
  // 走一遍清理，确认不抛错
  for (const [fn] of cleanups) {
    try { fn() } catch (error) { check(false, '① 清理钩子抛错：' + String(error)) }
  }
}

// ---------------- 场景 ①b：装了过旧版 gal-view（没有缝） ----------------
{
  hookIndex = 0
  hookState.length = 0
  const cleanups = []
  const ctx = {
    // 老版本 gal-view 提供的是别的东西，没有 galViewExt；但某些实现可能留了同名空壳
    get: name => (name === 'galViewExt' ? { version: 0 } : undefined),
    provide: () => () => {},
    effect: effectCollector(cleanups),
    slots: { inject: () => {}, register: () => () => {} },
  }
  const pkg = loadPlugin()
  let threw = null
  try { pkg.apply(ctx) } catch (error) { threw = error }
  check(threw === null, '①b 过旧 gal-view 时 apply 不该抛错，实际：' + String(threw))
  const rt = pkg.__test?.runtime
  if (rt !== null && rt !== undefined) {
    const probe = rt.probe()
    check(probe.ok === false, '①b 过旧版本应判为不可用')
    check(probe.version === 0, '①b 应回报对方版本号')
    check(String(probe.reason).includes('过旧'), '①b 提示应说明版本过旧，实际：' + probe.reason)
    // 过旧时所有缝能力都必须安全降级，而不是抛错
    check(rt.applyBackdrop(true) === false, '①b 过旧时换背景应安全返回 false')
    check(rt.syncBlockToExt() === false, '①b 过旧时同步封锁应安全返回 false')
    check(typeof rt.onStageClick(() => {}) === 'function', '①b 过旧时点击订阅应返回 noop')
    check(rt.say('测试') === false, '①b 过旧时 say 应安全返回 false')
  } else {
    check(false, '①b 应导出内部 runtime 句柄')
  }
  for (const [fn] of cleanups) {
    try { fn() } catch (error) { check(false, '①b 清理钩子抛错：' + String(error)) }
  }
}

// ---------------- 场景 ②：有 gal-view（缝可用） ----------------
{
  hookIndex = 0
  hookState.length = 0
  const overlays = []
  const ext = createGalViewExt({
    host: { getScene: () => ({ elements: [] }), onBlockChange: () => {} },
    console: { warn: () => {}, info: () => {}, error: () => {} },
  })
  const cleanups = []
  const ctx = {
    get: name => (name === 'galViewExt' ? ext : undefined),
    provide: () => () => {},
    effect: effectCollector(cleanups),
    slots: {
      inject: () => {},
      register: () => () => {},
    },
  }
  const pkg = loadPlugin()
  let threw = null
  try {
    pkg.apply(ctx)
  } catch (error) {
    threw = error
  }
  check(threw === null, '② 有缝时 apply 不该抛错，实际：' + String(threw))
  const list = ext.listOverlays()
  check(list.length === 4, '② 应注册 4 个舞台覆盖层（HUD 左/右 + 眼睛恢复 + 吃饭页面），实际 ' + list.length)
  check(list.map(o => o.id).join(',') === 'gal-eat-hud-left,gal-eat-hud-right,gal-eat-eye,gal-eat-eat',
    '② 覆盖层 id 顺序应为 左/右/眼睛/吃饭，实际 ' + list.map(o => o.id).join(','))
  check(typeof list[0]?.component === 'function', '② 覆盖层 component 应是组件函数')

  // 渲染每一个覆盖层组件：验证两态（HUD 可见 / 隐藏、吃饭阶段 / 待机）都不会崩
  const runtime = {
    stateSource: { getSnapshot: () => ({ tickets: 3, satiety: 88, affectionPoints: 12, affectionLevel: 1, ticketBankMs: 0 }), subscribe: () => () => {} },
    storageSource: { getSnapshot: () => ({ available: true, lastSavedAt: null, offlineGapMs: 0 }), subscribe: () => () => {} },
    hudSource: { getSnapshot: () => ({ visible: true }), subscribe: () => () => {} },
    eatSource: { getSnapshot: () => ({ phase: 'idle', introLines: [], introIndex: 0, restaurantId: null, message: '' }), subscribe: () => () => {} },
    probe: () => ({ ok: true, version: 1 }),
    ext: () => ext,
    eyeOpen: () => true,
    toggleEye: () => true,
    dispatch: () => ({ phase: 'idle' }),
  }
  let renderError = null
  try {
    for (const item of list) {
      const el = item.component({ runtime })
      check(el !== null && el !== undefined, '② 覆盖层 ' + item.id + ' 应返回元素')
    }
  } catch (error) {
    renderError = error
  }
  check(renderError === null, '② 覆盖层组件渲染不该抛错，实际：' + String(renderError))

  // 清理：注销覆盖层 + 解除封锁
  for (const [fn] of cleanups) {
    try { fn() } catch (error) { check(false, '② 清理钩子抛错：' + String(error)) }
  }
  check(ext.listOverlays().length === 0, '② 卸载后覆盖层应清空，实际 ' + ext.listOverlays().length)
  check(ext.getBlockReason() === null, '② 卸载后封锁应解除')
}

if (errors.length > 0) {
  console.error('FAIL gal-eat 端到端仿真：')
  for (const e of errors) console.error('  - ' + e)
  process.exit(1)
}
console.log('gal-eat 端到端仿真 ALL OK（无缝降级 / 有缝接入 / 卸载清理 三种情形）')
process.exit(0)
