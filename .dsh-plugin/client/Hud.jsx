/** gal-eat 的 HUD：左上角双状态条（饱食度/好感度）+ 右上角鲸元券与「去吃饭」。
 *
 * 规格来自 GAL-EAT-PLUGIN-PLAN.md §3.5（用户第 9 条）：
 *  - 左上角上下两条堆叠，**饱食度在上、好感度在下**
 *  - 条高 10px；文字标签在条**上方**、左端与条左端对齐
 *  - 饱食度橙色、好感度粉色
 *  - 好感度条**左侧**是直径 52px 的圆圈，内嵌粉红爱心，爱心上白色数字 = 好感等级
 *  - 条右侧显示小号数值（100% / 37/100，弱化颜色）
 *  - 右上角鲸元券显示数字；数字下方是文字「去吃饭」的按钮
 *  - 紧挨状态栏右边一个小眼睛图标：开启隐藏时**四项全部隐藏**（只影响显示，数值照常结算）
 *  - 位置在顶栏下方，不压住顶栏
 *
 * 两个组件都只在「游戏模式 且 HUD 可见」时渲染内容；不可见时返回 null（DOM 也不占位）。
 */

import React, { useEffect, useState } from 'react'
import { COLORS, THEME } from './runtime.mjs'
import { STAT_GEO, HEART_GEO, statStack, leftPanelOrder, UI_SCALE, scaleStyle, HUD_GEO } from './hud-layout.mjs'
import { satietyTooltip, affectionTooltip, ticketTooltip } from './eat-info.mjs'

const HEART_PATH = 'M50 87 C22 66 6 51 6 33 C6 18 18 8 31 8 C40 8 46 13 50 20 C54 13 60 8 69 8 C82 8 94 18 94 33 C94 51 78 66 50 87 Z'

/** 订阅一个可观察源。 */
function useSource(source) {
  const [snap, setSnap] = useState(() => source.getSnapshot())
  useEffect(() => {
    setSnap(source.getSnapshot())
    return source.subscribe(() => setSnap(source.getSnapshot()))
  }, [source])
  return snap
}

/** 粉色爱心 + 白色等级数字（好感度条左侧的圆圈）。尺寸来自 hud-layout（单测钉住 52px）。 */
function HeartLevel({ level }) {
  return (
    <div className="ge-heart" style={{ width: HEART_GEO.size, height: HEART_GEO.size }} title={'好感等级 ' + level}>
      <svg viewBox="0 0 100 100" className="ge-heart-svg" aria-hidden="true">
        <path d={HEART_PATH} fill={COLORS.affection} stroke="rgba(255,255,255,.55)" strokeWidth="3" />
      </svg>
      <span className="ge-heart-num">{level}</span>
    </div>
  )
}

/** 一条状态条（标签在条**上方**、左端对齐；行高与间隙来自 hud-layout）。
 *  `hint` 是鼠标悬停提示词（与鲸元券/去吃饭一样的 title）。 */
function StatBar({ label, percent, color, valueText, hint }) {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0))
  const stack = statStack(STAT_GEO.barHeight)
  return (
    <div className="ge-stat" style={{ minWidth: STAT_GEO.minWidth }} title={hint}>
      <div className="ge-stat-top" style={{ marginBottom: STAT_GEO.labelGap }}>
        <span className="ge-stat-label" style={{ fontSize: STAT_GEO.labelFontSize }}>{label}</span>
        <span className="ge-stat-value" style={{ fontSize: STAT_GEO.valueFontSize }}>{valueText}</span>
      </div>
      <div className="ge-bar" style={{ height: stack.barHeight }}>
        <div className="ge-bar-fill" style={{ width: clamped + '%', background: color }} />
      </div>
    </div>
  )
}

/** 左上角：饱食度 + 好感度（好感度带爱心等级圈）。
 *  两条的**堆叠顺序**由 hud-layout 的 leftPanelOrder() 决定（单测断言"饱食度在上"）。 */
export function HudLeft({ runtime }) {
  const state = useSource(runtime.stateSource)
  const hud = useSource(runtime.hudSource)
  if (hud.visible !== true) return null
  const satiety = Math.max(0, Math.min(100, state.satiety))
  const points = Math.max(0, Math.min(100, state.affectionPoints))

  const bars = {
    satiety: (
      <StatBar
        key="satiety"
        label="饱食度"
        percent={satiety}
        color={COLORS.satiety}
        valueText={Math.round(satiety) + '%'}
        hint={satietyTooltip()}
      />
    ),
    affection: (
      <div className="ge-affection-row" key="affection">
        <HeartLevel level={state.affectionLevel} />
        <StatBar
          label="好感度"
          percent={points}
          color={COLORS.affection}
          valueText={points + '/100'}
          hint={affectionTooltip()}
        />
      </div>
    ),
  }

  return (
    <div
      className="ge-hud-left"
      data-gal-eat="hud-left"
      /* 用户要求：左上双条放大到 200%（整体等比放大，比例不变） */
      style={scaleStyle(UI_SCALE.hudLeft, { top: HUD_GEO.left.top, left: HUD_GEO.left.left })}
    >
      {leftPanelOrder().map(key => bars[key])}
    </div>
  )
}

/** 右上角：鲸元券 + 「去吃饭」按钮 + 眼睛开关。 */
export function HudRight({ runtime }) {
  const state = useSource(runtime.stateSource)
  const hud = useSource(runtime.hudSource)
  if (hud.visible !== true) return null
  const eyeOpen = runtime.eyeOpen()
  return (
    <div
      className="ge-hud-right"
      data-gal-eat="hud-right"
      /* 用户要求：右上券数字与「去吃饭」放大到 200%。
         右对齐的盒子以**右上角**为原点缩放，才不会把面板推出画面。 */
      style={{ ...scaleStyle(UI_SCALE.hudRight, { top: HUD_GEO.right.top }), transformOrigin: '100% 0' }}
    >
      <div className="ge-ticket" title={ticketTooltip()}>
        <span className="ge-ticket-num">{state.tickets}</span>
      </div>
      <button
        type="button"
        className="ge-eat-btn"
        title="去美食街吃饭"
        onClick={() => {
          // 走 enterStreet：**点一下立刻换背景 + 封锁**（不依赖组件 effect 是否跑到）
          if (typeof runtime.enterStreet === 'function') runtime.enterStreet({ type: 'start' })
          else runtime.dispatch({ type: 'start' })
        }}
      >
        去吃饭
      </button>
      <button
        type="button"
        className={'ge-eye' + (eyeOpen ? ' is-open' : '')}
        title={eyeOpen ? '隐藏状态栏（数值照常结算）' : '显示状态栏'}
        aria-label={eyeOpen ? '隐藏状态栏' : '显示状态栏'}
        onClick={() => runtime.toggleEye()}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path
            d="M2 12 C5 6.5 8.6 4.5 12 4.5 C15.4 4.5 19 6.5 22 12 C19 17.5 15.4 19.5 12 19.5 C8.6 19.5 5 17.5 2 12 Z"
            fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"
          />
          <circle cx="12" cy="12" r="3.3" fill="none" stroke="currentColor" strokeWidth="1.7" />
          {!eyeOpen && <line x1="4" y1="20" x2="20" y2="4" stroke="currentColor" strokeWidth="1.9" />}
        </svg>
      </button>
    </div>
  )
}

/** 眼睛关闭时的小提示（告诉用户还能点眼睛恢复）。 */
export function HudEyeHint({ runtime }) {
  const hud = useSource(runtime.hudSource)
  const eyeOpen = runtime.eyeOpen()
  if (hud.visible === true || eyeOpen) return null
  return (
    <button type="button" className="ge-eye ge-eye-solo" title="显示状态栏" onClick={() => runtime.toggleEye()}>
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path d="M2 12 C5 6.5 8.6 4.5 12 4.5 C15.4 4.5 19 6.5 22 12 C19 17.5 15.4 19.5 12 19.5 C8.6 19.5 5 17.5 2 12 Z" fill="none" stroke="currentColor" strokeWidth="1.7" />
        <circle cx="12" cy="12" r="3.3" fill="none" stroke="currentColor" strokeWidth="1.7" />
        <line x1="4" y1="20" x2="20" y2="4" stroke="currentColor" strokeWidth="1.9" />
      </svg>
    </button>
  )
}
