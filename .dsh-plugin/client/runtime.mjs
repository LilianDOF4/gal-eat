// gal-eat 运行时：游戏状态 + 持久化 + 挂机结算 + 扩展缝桥接（纯逻辑，可单测）。
//
// 与 gal-view 的关系：
//  - 玩法数值的**结算规则**与 gal-view 共库（复用 gal-view client 的 game-state.mjs /
//    eat.mjs 同一份纯函数），避免两处规则漂移——单测也只测那一份。
//  - 与 gal-view 的**交互**一律经 galViewExt 扩展缝，不碰 gal-view 内部模块。
//  - 视觉常量本地定义：不 import gal-view 的 styles.mjs（那是 45KB 的 CSS 字符串，
//    会把无关内容拖进本插件产物）。

import {
  defaultGameState, normalizeGameState, advanceGameState, feedWithDish, accountingDay,
} from '../../gal-view/.dsh-plugin/client/game-state.mjs'
import { createEatSession, eatSessionReduce, isBlocking, HUNGRY_SUFFIXES, pickPhrase } from '../../gal-view/.dsh-plugin/client/eat.mjs'
import { checkGalViewExt } from '../../gal-view/.dsh-plugin/client/galview-ext.mjs'
import { createAssetLoader, backgroundKeyNow, backgroundLabel, findSceneAssetId, FALLBACK_BACKDROP } from './eat-assets.mjs'

/** localStorage 键（机器级共享，跨会话/跨重启保留；§6）。 */
export const STORAGE_KEY = 'gal-eat:state:v1'
/** HUD 显示偏好键（眼睛开关；机器级）。 */
export const HUD_KEY = 'gal-eat:hud:v1'
/** 舞台覆盖层 id（HUD 左右两半分开注册，各自只在游戏模式渲染）。 */
export const OVERLAY_ID_LEFT = 'gal-eat-hud-left'
export const OVERLAY_ID_RIGHT = 'gal-eat-hud-right'

/** 本地视觉常量：条高 10px、爱心圈 52px、配色（§3.5 用户指定的样式要点）。 */
export const THEME = Object.freeze({
  satiety: '#ff9f43',
  affection: '#ff6fae',
  ticket: '#ffd479',
  barHeight: 10,
  heartSize: 52,
  tickMs: 1000,
  saveEveryMs: 10000,
})

/** 覆盖层组件用的语义色（批次② 的条/爱心复用）。 */
export const COLORS = Object.freeze({
  satiety: THEME.satiety,
  affection: THEME.affection,
  ticket: THEME.ticket,
})

/**
 * galViewExt 桥接：拿缝、探测可用性。
 * 缝缺失（未装 gal-view / 版本过旧）时给出可读原因，调用方据此显示降级 UI。
 * @param {{ ctx?: object, ext?: object, assetsMap?: object|null, getScene?: Function|null }} opts
 *   assetsMap/getScene 为可选的只读视图数据（由 gal-view 注入面提供），用于兜底取图。
 */
export function createExtBridge(opts = {}) {
  const ctx = opts.ctx ?? null
  const injected = opts.ext ?? null
  const assetsMap = opts.assetsMap ?? null
  const getSceneFallback = opts.getScene ?? null

  const resolve = () => {
    if (injected !== null && injected !== undefined) return injected
    if (ctx === null || typeof ctx.get !== 'function') return null
    try {
      return ctx.get('galViewExt') ?? null
    } catch {
      return null
    }
  }

  return {
    /** 当前缝实例（每次实时解析：gal-view 可能晚于本插件装配）。 */
    ext: resolve,
    /** 探测结果：{ ok, reason?, version? }。 */
    probe() {
      return checkGalViewExt(resolve())
    },
    /** 只读场景：优先问缝，其次用注入的兜底。 */
    scene() {
      const ext = resolve()
      if (ext !== null && typeof ext.getScene === 'function') {
        const fromExt = ext.getScene()
        if (fromExt !== null && fromExt !== undefined) return fromExt
      }
      return typeof getSceneFallback === 'function' ? getSceneFallback() : null
    },
    /** 只读素材库（Map<id, {dataUrl}> 或 null）：优先问缝，其次用注入的兜底。 */
    assets() {
      const ext = resolve()
      if (ext !== null && typeof ext.getAssets === 'function') {
        const fromExt = ext.getAssets()
        if (fromExt instanceof Map) return fromExt
      }
      return assetsMap
    },
  }
}

/** 极简可观察源（与 gal-view 的 createObservable 同契约；自带一份，避免跨包耦合）。 */
export function createSource(initial) {
  let value = initial
  const listeners = new Set()
  const emit = () => {
    for (const fn of [...listeners]) {
      try {
        fn()
      } catch (error) {
        console.warn('[gal-eat] 订阅回调抛错（已忽略）:', error)
      }
    }
  }
  return {
    getSnapshot: () => value,
    subscribe(fn) {
      listeners.add(fn)
      return () => { listeners.delete(fn) }
    },
    set(next) {
      if (next === value) return
      value = next
      emit()
    },
    update(patch) {
      value = { ...value, ...patch }
      emit()
    },
  }
}

/** 从任意来源（含损坏数据）构造合法状态。 */
export function initialStateFrom(raw) {
  const base = defaultGameState()
  if (raw === null || typeof raw !== 'object') return base
  return normalizeGameState({ ...base, ...raw })
}

/**
 * 启动时结算：用 lastSeenAt 与当前时间的差值补扣饱食度（离线只扣饱食度，§3.1）。
 * @returns {{ state: object, offlineGapMs: number }}
 */
export function catchUpOnLoad(raw, nowMs) {
  const state = initialStateFrom(raw)
  if (state.lastSeenAt === null || !Number.isFinite(nowMs)) {
    return { state: { ...state, lastSeenAt: nowMs }, offlineGapMs: 0 }
  }
  const gap = Math.max(0, nowMs - state.lastSeenAt)
  if (gap <= 0) return { state: { ...state, lastSeenAt: nowMs }, offlineGapMs: 0 }
  const next = advanceGameState(state, gap, { offline: true, at: nowMs, menuDay: accountingDay(nowMs) })
  return { state: { ...next, lastSeenAt: nowMs }, offlineGapMs: gap }
}

/** 在线结算：按墙钟差值推进券/好感/饱食度，并把 menuBought 清到当天。 */
export function tickState(state, elapsedMs, nowMs) {
  return advanceGameState(state, elapsedMs, { at: nowMs, menuDay: accountingDay(nowMs) })
}

/** HUD 显示偏好（眼睛开关）：默认显示。 */
export function defaultHudPrefs() {
  return { visible: true }
}

/** 解析 HUD 偏好（容错）。 */
export function normalizeHudPrefs(raw) {
  if (raw === null || typeof raw !== 'object') return defaultHudPrefs()
  return { visible: raw.visible !== false }
}

/**
 * HUD 可见性（§3.5 眼睛开关 + §3.7 吃饭期间）：
 *  - 眼睛关闭 → 全部隐藏（饱食度/好感度/券/去吃饭按钮），但**数值照常结算**（只影响显示）
 *  - 吃饭页面打开（phase !== idle）→ 隐藏 HUD，让位给吃饭页面
 */
export function hudVisibleFor(hudPrefs, phase) {
  const prefs = normalizeHudPrefs(hudPrefs)
  return prefs.visible === true && phase === 'idle'
}

/** 饿昏阈值：饱食度见底（§3.3）。 */
export const HUNGRY_SATIETY = 0

/** 是否处于饿昏状态（饱食度 = 0）。 */
export function isHungry(state) {
  const s = state !== null && typeof state === 'object' ? state : {}
  return Number(s.satiety) <= HUNGRY_SATIETY
}

/**
 * 饿昏后缀：把一条饿昏台词追加到 AI 回答后面（§3.3）。
 * 纯函数、短语池固定 —— **不实时生成句子、不烧 token**。
 * @param {string} text - 原始台词
 * @param {{ random?: () => number, avoid?: string|null, pool?: readonly string[] }} [opts]
 */
export function appendHungrySuffix(text, opts = {}) {
  const body = typeof text === 'string' ? text : ''
  const pool = opts.pool ?? HUNGRY_SUFFIXES
  const line = pickPhrase(pool, opts.random ?? Math.random, opts.avoid ?? null)
  if (line === '') return body
  return body === '' ? line : body + '\n' + line
}

/**
 * 当前该写进扩展缝的封锁原因（null = 不封锁）。
 * 优先级：吃饭流程（更严格：接管舞台 + 封锁存档）> 饿昏（只禁发，舞台仍归 gal-view）。
 * @returns {{ mode: 'eat'|'hungry'|'none', reason: string|null, stageOwned: boolean }}
 */
export function blockReasonFor(session, state) {
  if (isBlocking(session)) {
    return { mode: 'eat', reason: '吃饭中……先陪我吃完这顿吧', stageOwned: true }
  }
  if (isHungry(state)) {
    // 饿昏**不接管舞台**：HUD 与「去吃饭」必须留着，否则用户没法自救（§3.3 防卡死）
    return { mode: 'hungry', reason: '饿昏了……先给我口饭吃', stageOwned: false }
  }
  return { mode: 'none', reason: null, stageOwned: false }
}

/**
 * 创建运行时。依赖可注入（单测用假 storage / 假时钟 / 假缝）。
 * @param {{ ctx?: object, ext?: object, storage?: object, now?: () => number, tickMs?: number, saveEveryMs?: number, autoTick?: boolean }} [opts]
 */
export function createEatRuntime(opts = {}) {
  const now = typeof opts.now === 'function' ? opts.now : () => Date.now()
  const storage = opts.storage !== undefined
    ? opts.storage
    : (typeof window !== 'undefined' ? window.localStorage : null)
  const tickMs = Number.isFinite(opts.tickMs) ? opts.tickMs : THEME.tickMs
  const saveEveryMs = Number.isFinite(opts.saveEveryMs) ? opts.saveEveryMs : THEME.saveEveryMs
  const bridge = createExtBridge({
    ctx: opts.ctx ?? null,
    ext: opts.ext ?? null,
    assetsMap: opts.assetsMap ?? null,
    getScene: opts.getScene ?? null,
  })
  // 素材加载器（宿主路由 → dataURL 缓存 → 失败静默回退内置图）。
  const assets = createAssetLoader({
    baseUrl: typeof opts.assetBaseUrl === 'string' ? opts.assetBaseUrl : '',
    fetchImpl: opts.fetchImpl,
    cache: opts.assetCache,
  })
  // 素材缓存变化的通知源（EatView 据此重渲染：图加载完成后换掉占位）。
  const assetTickSource = createSource({ seq: 0 })
  const notifyAssets = () => assetTickSource.update({ seq: assetTickSource.getSnapshot().seq + 1 })

  // ---- 载入 + 离线补扣（只扣饱食度）----
  let loaded = { state: defaultGameState(), offlineGapMs: 0 }
  try {
    const raw = storage !== null && typeof storage.getItem === 'function' ? storage.getItem(STORAGE_KEY) : null
    loaded = catchUpOnLoad(raw === null ? null : JSON.parse(raw), now())
  } catch (error) {
    console.warn('[gal-eat] 读取存档失败，使用初始状态:', error)
    loaded = catchUpOnLoad(null, now())
  }

  const stateSource = createSource({ ...loaded.state, eat: createEatSession() })
  const storageSource = createSource({ available: storage !== null, lastSavedAt: null, offlineGapMs: loaded.offlineGapMs })
  const eatSource = createSource(stateSource.getSnapshot().eat)

  // ---- HUD 偏好（眼睛开关）+ 可见性 ----
  let hudPrefs = defaultHudPrefs()
  try {
    const rawHud = storage !== null && typeof storage.getItem === 'function' ? storage.getItem(HUD_KEY) : null
    if (rawHud !== null) hudPrefs = normalizeHudPrefs(JSON.parse(rawHud))
  } catch (error) {
    console.warn('[gal-eat] 读取 HUD 偏好失败，用默认值:', error)
  }
  const hudSource = createSource({ ...hudPrefs, visible: hudVisibleFor(hudPrefs, 'idle') })

  const persistHud = () => {
    if (storage === null || typeof storage.setItem !== 'function') return false
    try {
      storage.setItem(HUD_KEY, JSON.stringify(hudPrefs))
      return true
    } catch (error) {
      console.warn('[gal-eat] 写入 HUD 偏好失败:', error)
      return false
    }
  }

  const syncHudVisibility = phase => {
    hudSource.set({ ...hudPrefs, visible: hudVisibleFor(hudPrefs, phase ?? eatSource.getSnapshot().phase) })
  }

  let lastTickAt = now()
  let lastSaveAt = lastTickAt
  let tickTimer = null

  const persist = () => {
    if (storage === null || typeof storage.setItem !== 'function') return false
    try {
      const snap = stateSource.getSnapshot()
      const { eat, ...persistable } = snap
      storage.setItem(STORAGE_KEY, JSON.stringify(persistable))
      storageSource.update({ lastSavedAt: now() })
      return true
    } catch (error) {
      console.warn('[gal-eat] 写入存档失败:', error)
      return false
    }
  }

  const applyState = next => {
    stateSource.set({ ...next, eat: stateSource.getSnapshot().eat })
  }

  const advanceTo = at => {
    const since = Math.max(0, at - lastTickAt)
    lastTickAt = at
    if (since === 0) return
    applyState(tickState(stateSource.getSnapshot(), since, at))
  }

  const setEat = next => {
    eatSource.set(next)
    stateSource.set({ ...stateSource.getSnapshot(), eat: next })
    syncHudVisibility(next.phase)
  }

  // ---- 定时器：每秒结算（墙钟差值，最小化/后台节流不影响数值）----
  // 同一处也负责：饿昏状态变化时更新封锁原因（§3.3）、缝晚到时补挂饿昏后缀改写。
  let extReady = false
  const ensureExtHooks = () => {
    if (extReady) return
    if (bridge.ext() === null) return
    extReady = true
    installHungrySuffix()
  }
  if (opts.autoTick !== false && typeof setInterval === 'function') {
    tickTimer = setInterval(() => {
      const at = now()
      advanceTo(at)
      if (!extReady) ensureExtHooks()
      syncBlock()
      if (at - lastSaveAt >= saveEveryMs) {
        lastSaveAt = at
        persist()
      }
    }, tickMs)
    if (typeof tickTimer === 'object' && tickTimer !== null && typeof tickTimer.unref === 'function') tickTimer.unref()
  }

  // ---- 页面退出/切后台时立刻落盘 ----
  const onHide = () => { advanceTo(now()); persist() }
  const hasWindow = typeof window !== 'undefined' && typeof window.addEventListener === 'function'
  if (hasWindow) {
    window.addEventListener('pagehide', onHide)
    document.addEventListener('visibilitychange', onHide)
  }

  /** 把「是否封锁」写进扩展缝（§3.7）；无缝时安全跳过。
   *  优先级：吃饭流程 > 饿昏（饿昏只禁发，存档不受影响）。 */
  const syncBlock = () => {
    const ext = bridge.ext()
    if (ext === null || typeof ext.setBlockReason !== 'function') return false
    const { reason, stageOwned } = blockReasonFor(eatSource.getSnapshot(), stateSource.getSnapshot())
    ext.setBlockReason(reason, { stageOwned })
    return true
  }

  /** 饿昏后缀（§3.3）：挂进显示层改写，AI 每条回答后追加一句固定短语。 */
  const installHungrySuffix = () => {
    const ext = bridge.ext()
    if (ext === null || typeof ext.addLineTransform !== 'function') return false
    // 同一条回答重复触发时避免连着说同一句：按明文记忆上一条
    let lastSuffix = null
    ext.addLineTransform((text, context) => {
      if (context !== null && typeof context === 'object' && context.kind === 'player') return text
      if (!isHungry(stateSource.getSnapshot())) return text
      // 已经带过饿昏后缀的（例如历史面板回放）不重复追加
      if (typeof text === 'string' && HUNGRY_SUFFIXES.some(line => text.includes(line))) return text
      const next = appendHungrySuffix(text, { avoid: lastSuffix })
      const added = next.slice(typeof text === 'string' ? text.length : 0).replace(/^\n/, '')
      if (added !== '') lastSuffix = added
      return next
    })
    return true
  }

  /** 取一张素材的 dataURL（同步返回缓存，未就绪时返回 null 并后台加载）。 */
  const assetOf = name => {
    const hit = assets.peek(name)
    if (hit !== null) return hit
    void assets.load(name).then(v => { if (v !== null) notifyAssets() })
    return null
  }

  /**
   * 当前该用的背景（按早/中/晚）。三级回退：
   *   ① gal-view 场景素材库（用户导入过）
   *   ② 宿主路由真图（`Pictures\gal-eat\<时段>.png`）
   *   ③ 内置矢量夜市图（**任何时刻都不会空着**；真图加载完成会自动替换为真图）
   * 真图未就绪时先返回内置图（它本身就是"兜底素材"语义，不会被误解成坏图）。
   */
  const currentBackdrop = () => {
    const key = backgroundKeyNow(now())
    const sceneAssets = bridge.assets()
    const sceneId = findSceneAssetId(bridge.scene(), sceneAssets, backgroundLabel(key))
    if (sceneId !== null && sceneAssets instanceof Map) {
      const record = sceneAssets.get(sceneId)
      if (record !== undefined && typeof record.dataUrl === 'string') return record.dataUrl
    }
    const fromDisk = assetOf(key)
    return fromDisk !== null ? fromDisk : FALLBACK_BACKDROP
  }

  /** 进/出美食街要用的两个动作（提成本地函数：对象方法里 `this` 不可靠）。 */
  const applyBackdrop = on => {
    const ext = bridge.ext()
    if (ext === null || typeof ext.setBackdrop !== 'function') return false
    ext.setBackdrop(on ? { dataUrl: currentBackdrop() } : null)
    return true
  }
  const clearLine = () => {
    const ext = bridge.ext()
    if (ext !== null && typeof ext.setLineOverride === 'function') ext.setLineOverride(null)
  }

  /**
   * 注意：**吃饭页面的文本一律不进历史面板**（用户 2026-10-08 明确要求）。
   * 台词只经 `setLineOverride` 显示在对话框里；口味评价只显示在吃饭页面上。
   * 因此本插件不调用缝的 `appendHistoryLine`（早期版本调用过，已移除）。
   */

  /** 吃饭阶段机：转发到纯函数、发布结果、同步封锁与 HUD 可见性（§3.7）。 */
  const dispatch = action => {
    const before = eatSource.getSnapshot()
    const next = eatSessionReduce(before, action)
    if (next !== before) {
      setEat(next)
      syncBlockToExt()
      // 口味评价只显示在吃饭页面上，**不写历史面板**（用户要求：吃饭页文本不进历史）
    }
    return next
  }

  /** 按当前阶段同步「是否封锁」到扩展缝（§3.7）；顺带补挂晚到的钩子（饿昏后缀）。 */
  const syncBlockToExt = () => {
    ensureExtHooks()
    return syncBlock()
  }

  // 首次尝试（缝可能已经就绪）。必须放在 installHungrySuffix/ensureExtHooks 定义之后。
  ensureExtHooks()

  return {
    stateSource,
    eatSource,
    storageSource,
    hudSource,
    assetTickSource,
    THEME,
    /** 当前缝（可能为 null）。 */
    ext: () => bridge.ext(),
    /** 缝探测结果（降级提示用）。 */
    probe: () => bridge.probe(),
    /** 只读场景（缝 → 注入兜底）。 */
    scene: () => bridge.scene(),
    /** 只读素材库（Map 或 null）。 */
    assetsMap: () => bridge.assets(),
    /**
     * 取一张素材的 dataURL（同步返回缓存，未就绪时返回 null 并后台加载）。
     * 调用方拿到 null 就用兜底（背景 = 内置矢量夜市图；菜品 = 纯文字）。
     */
    asset: assetOf,
    /** 预取一组素材（进吃饭页面时调用）。 */
    prefetchAssets(names) {
      return assets.prefetch(names).then(n => { if (n > 0) notifyAssets(); return n })
    },
    /** 该素材是否已确认缺失（菜单据此显示"无图"态）。 */
    assetMissing: name => assets.isMissing(name),
    /**
     * 当前时段的背景：优先场景素材库（用户导入过），其次宿主路由图，
     * 都没有时返回内置矢量夜市图（**绝不空着**）。
     */
    currentBackdrop,
    /** 眼睛开关：切换 HUD 显隐（只影响显示，数值照常结算）。 */
    toggleEye() {
      hudPrefs = { ...hudPrefs, visible: !(hudPrefs.visible === true) }
      persistHud()
      syncHudVisibility()
      return hudPrefs.visible === true
    },
    /** 眼睛状态（true = 显示）。 */
    eyeOpen: () => hudPrefs.visible === true,
    /** 当前 HUD 是否可见（眼睛开 且 不在吃饭阶段）。 */
    hudVisible: () => hudSource.getSnapshot().visible === true,
    /** 立刻落盘。 */
    save: persist,
    /**
     * 测试用：直接增/减券（正数加券、负数扣券，下限 0），并立刻落盘。
     * 只为验收/调试方便，不改动正常结算规则。
     * @param {number} amount
     * @returns {number} 调整后的券数
     */
    grant(amount = 100) {
      const n = Number(amount)
      const cur = stateSource.getSnapshot()
      if (!Number.isFinite(n) || n === 0) return cur.tickets
      const next = normalizeGameState({ ...cur, tickets: Math.max(0, Math.round(cur.tickets + n)) })
      applyState(next)
      persist()
      return stateSource.getSnapshot().tickets
    },
    /**
     * 测试用：把饱食度设为指定值（默认 0 → 立刻饿昏，方便验收饿昏表现）。
     * @param {number} value 0..100
     */
    setSatiety(value = 0) {
      const v = Number(value)
      const cur = stateSource.getSnapshot()
      const next = normalizeGameState({ ...cur, satiety: Number.isFinite(v) ? v : 0 })
      applyState(next)
      syncBlockToExt()
      persist()
      return stateSource.getSnapshot().satiety
    },
    /** 吃一道菜（走 game-state 规则；失败返回原因且状态不变）。 */
    feed(dish) {
      const at = now()
      advanceTo(at)
      const result = feedWithDish(stateSource.getSnapshot(), dish, { at })
      if (result.ok) applyState(result.state)
      return result
    },
    /** 吃饭阶段机（见 createEatRuntime 顶部说明）。 */
    dispatch,
    /**
     * 进美食街：换背景 + 置为给定阶段。
     * 放在**事件处理器里**调用，而不是只靠组件 effect —— effect 若被延迟/跳过，
     * 就会重现"点了去吃饭、输入框被禁、背景却没换"的观感（首版真实事故）。
     */
    enterStreet(action = { type: 'start' }) {
      const next = dispatch(action)
      if (next.phase !== 'idle') applyBackdrop(true)
      return next
    },
    /** 离开美食街：撤台词 + 恢复家中背景 + 解除封锁（同样在事件里调用，立刻生效）。 */
    leaveStreet() {
      const next = dispatch({ type: 'goHome' })
      clearLine()
      applyBackdrop(false)
      syncBlockToExt()
      return next
    },
    /** 显示一条提示（例如"券不够啦…"），不改变阶段。 */
    setNotice(text) {
      return dispatch({ type: 'notice', text: typeof text === 'string' ? text : '' })
    },
    /** 是否处于饿昏状态（饱食度 = 0，§3.3）。 */
    hungry: () => isHungry(stateSource.getSnapshot()),
    /** 当前封锁模式与原因（'eat' / 'hungry' / 'none'）。 */
    blockMode: () => blockReasonFor(eatSource.getSnapshot(), stateSource.getSnapshot()),
    /** 按当前阶段同步「是否封锁」到扩展缝（§3.7）。 */
    syncBlockToExt,
    /** 进入/退出吃饭时把舞台背景换成美食街 / 换回家中背景（§3.6）。 */
    applyBackdrop,
    /** 舞台点击订阅（"点击继续"节奏）。无缝时返回 noop。 */
    onStageClick(fn) {
      const ext = bridge.ext()
      if (ext === null || typeof ext.onStageClick !== 'function') return () => {}
      return ext.onStageClick(fn)
    },
    /**
     * 把一句台词交给 gal-view 的对话框显示（**走它自己的打字机节奏**）。
     * **不写历史面板**（用户要求：吃饭页文本不进历史），只做显示。
     * 缝不可用或方法缺失时安全返回 false（不抛错）。
     */
    say(text, key = 'gal-eat') {
      const line = typeof text === 'string' ? text : ''
      const ext = bridge.ext()
      if (ext === null) return false
      if (typeof ext.setLineOverride !== 'function') return false
      ext.setLineOverride({ text: line, key, kind: 'assistant' })
      return true
    },
    /** 撤掉台词覆盖（回家前调用，让对话框回到正常转写）。 */
    clearLine,
    /** 手动推进时间（测试/调试用）。 */
    advanceTo,
    /** 解除封锁（退出吃饭/停用插件时调用）。 */
    releaseBlock() {
      const ext = bridge.ext()
      if (ext !== null && typeof ext.setBlockReason === 'function') ext.setBlockReason(null)
    },
    dispose() {
      if (tickTimer !== null) clearInterval(tickTimer)
      tickTimer = null
      persist()
      if (hasWindow) {
        window.removeEventListener('pagehide', onHide)
        document.removeEventListener('visibilitychange', onHide)
      }
    },
  }
}
