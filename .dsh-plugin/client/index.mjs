// gal-eat 浏览器 half：经 galViewExt 扩展缝接入 gal-view 的游戏模式。
//
// 契约（官方 bundle 插件 client 契约）：
//   window.__ModuleLoader__.load({ id, factory }) → factory 返回 { name, inject, apply }
//   client 内核挂载时调用 apply(ctx)，ctx 提供 get/provide/slots/effect。
//
// 关键设计：**gal-view 是可选前置**。
//   - ctx.get('galViewExt') 拿不到（没装 gal-view / 版本过旧）时，只注册一条友好提示，
//     绝不抛错，也绝不影响 gal-view 本体或宿主其它部分。
//   - 拿到缝之后，一切交互都经缝进行（舞台覆盖层/台词覆盖/背景覆盖/封锁闸门）。
//
// 覆盖层：
//   gal-eat-hud-left   左上角 饱食度/好感度 双条（含爱心等级圈与眼睛开关）
//   gal-eat-hud-right  右上角 鲸元券 + 「去吃饭」（含眼睛开关）
//   gal-eat-eat        吃饭页面（批次 ③ 接入；当前阶段是占位提示）
// 各覆盖层自己判断「阶段 + 眼睛开关」决定渲染与否，因此注册一次即可长期有效。

import React from 'react'
import { createEatRuntime, OVERLAY_ID_LEFT, OVERLAY_ID_RIGHT } from './runtime.mjs'
import { HudLeft, HudRight, HudEyeHint } from './Hud.jsx'
import { EatView } from './EatView.jsx'
import { showDegradedNotice } from './DegradedNotice.mjs'
import { CSS } from './styles.mjs'

export const name = 'gal-eat'

/** 依赖槽位服务（与 gal-view 相同的注入面；扩展缝经 ctx.get 解析，不进 inject）。 */
export const inject = ['slots']

/**
 * 测试句柄：apply() 之后把内部 runtime 放进这个**对象**（不重绑导出名），
 * 供离线仿真（tests/verify-flow.mjs）驱动**真实**逻辑。
 * 官方 client 内核只读 name/inject/apply，多导出一个字段不影响加载。
 * 注意必须用对象属性而不是 `export let` 重新赋值 —— 产物是 CJS，
 * 用 `new Function` 执行时导出的 let 不会回填（取值快照）。
 */
export const __test = { runtime: null }

/** 覆盖层 id（吃饭页面层；批次 ③ 会在里面长出完整流程）。 */
const OVERLAY_ID_EAT = 'gal-eat-eat'
/** 眼睛关闭后的独立恢复入口（否则用户没有找回状态栏的办法）。 */
const OVERLAY_ID_EYE = 'gal-eat-eye'

/**
 * 客户端插件入口。
 * @param ctx - client 根上下文（get/provide/slots/effect）
 */
export function apply(ctx) {
  // 幂等守卫：HMR / loader 重跑时不重复注入样式与覆盖层。
  if (document.querySelector('style[data-gal-eat-style]') !== null) return

  const styleEl = document.createElement('style')
  styleEl.setAttribute('data-gal-eat-style', '')
  styleEl.setAttribute('data-plugin', 'gal-eat')
  styleEl.textContent = CSS
  document.head.append(styleEl)

  // 运行时：状态、持久化、缝桥接。ctx 只在 apply 期可见，注入进去供运行时按需取缝。
  // 素材（美食街图）只经缝读取（getAssets），不直接依赖 gal-view 的注入面——
  // 这样"没装 gal-view"时的降级路径与正常路径完全一致。
  const runtime = createEatRuntime({ ctx })
  __test.runtime = runtime
  ctx.effect(() => () => {
    if (__test.runtime === runtime) __test.runtime = null
    runtime.releaseBlock()
    runtime.dispose()
    styleEl.remove()
  }, 'gal-eat: styles/runtime')

  /**
   * 把组件包成"舞台覆盖层组件"。
   * **关键**：必须把 runtime 通过 `options.runtime` 交给缝 —— gal-view 渲染覆盖层时
   * 会原样以 `overlayRuntime` prop 传回组件；否则组件取不到状态源，只能渲染空壳
   * （首版就错在这里：点「去吃饭」只有封锁生效，HUD 与吃饭页面都出不来）。
   * 闸门用**探测结果**而不是"缝非 null"：老版本 gal-view 可能留了同名但不完整的对象，
   * 直接调用会抛 TypeError 并让整个 apply 失败（连提示都显示不出来）。
   */
  const layer = (Component, id, order, extra = {}) => {
    if (runtime.probe().ok !== true) return null
    const ext = runtime.ext()
    if (ext === null || typeof ext.registerStageOverlay !== 'function') return null
    try {
      return ext.registerStageOverlay(
        // 双保险：优先用缝传回来的 runtime（同一实例），缺失时回落到闭包里的
        props => React.createElement(Component, { ...props, runtime: props?.overlayRuntime ?? runtime }),
        { id, order, runtime, ...extra },
      )
    } catch (error) {
      console.warn('[gal-eat] 注册覆盖层失败（该层将不显示）:', id, error)
      return null
    }
  }

  let disposers = []
  const register = () => {
    for (const off of disposers) off()
    disposers = []
    // HUD 与恢复入口先注册（order 40/42），吃饭页面压在最上（order 60）。
    // keepWhenStageOwned：吃饭页面**必须**声明自己就是"接管舞台的那一层"，
    // 否则 gal-view 在 stageOwned 时会把它一起隐藏 —— 用户看到的就是"点了去吃饭后一片空白"。
    const list = [
      layer(HudLeft, OVERLAY_ID_LEFT, 40),
      layer(HudRight, OVERLAY_ID_RIGHT, 40),
      layer(HudEyeHint, OVERLAY_ID_EYE, 42),
      layer(EatView, OVERLAY_ID_EAT, 60, { keepWhenStageOwned: true }),
    ].filter(Boolean)
    disposers = list
    return list.length
  }

  // 缝可能晚于本插件装配：轮询几次直到**探测通过**（通过就停；不通过则等它变好）。
  let tries = 0
  let removeNotice = null
  const syncDegradedNotice = () => {
    const probe = runtime.probe()
    if (probe.ok === true) {
      if (removeNotice !== null) { removeNotice(); removeNotice = null }
      return
    }
    // 未接入：给**用户看得见**的提示（取不到缝就没有舞台可挂，只能自己塞 DOM）。
    // 幂等：showDegradedNotice 内部会先清掉旧的那条。
    removeNotice = showDegradedNotice(probe.reason)
  }
  register()
  syncDegradedNotice()
  const timer = setInterval(() => {
    tries += 1
    if (runtime.probe().ok === true) {
      register()
      syncDegradedNotice()
      clearInterval(timer)
      return
    }
    if (tries >= 20) {
      // 等待结束仍未接入：留提示条（用户可在装好 gal-view 后刷新页面）
      syncDegradedNotice()
      clearInterval(timer)
    }
  }, 500)
  ctx.effect(() => () => {
    clearInterval(timer)
    if (removeNotice !== null) removeNotice()
    removeNotice = null
    for (const off of disposers) off()
    disposers = []
  }, 'gal-eat: stage overlays')

  // 探针日志：排查"插件装了但没反应"时先看这条。
  const probe = runtime.probe()
  console.info('[gal-eat] 已加载：' + (probe.ok ? 'galViewExt v' + probe.version + ' 已接入' : probe.reason))

  // ---- 控制台调试指令（测试/验收用，不参与正常玩法）----
  //   __galEat.grant(100)    加 100 券（传负数扣券）
  //   __galEat.setSatiety(0) 把饱食度设为 0 → 立刻进入饿昏状态
  //   __galEat.state()       看当前数值
  if (typeof window !== 'undefined') {
    window.__galEat = {
      grant: n => runtime.grant(n),
      setSatiety: v => runtime.setSatiety(v),
      state: () => ({ ...runtime.stateSource.getSnapshot() }),
      eat: () => ({ ...runtime.eatSource.getSnapshot() }),
      phase: () => runtime.eatSource.getSnapshot().phase,
      runtime,
    }
    console.info('[gal-eat] 控制台指令：__galEat.grant(100) 加券 / __galEat.setSatiety(0) 进饿昏 / __galEat.state() 看数值')
  }
}
