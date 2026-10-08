// HUD 布局单测：把计划 §3.5 的**空间关系**钉死（这些关系最容易在人眼验收时被挑出来）。
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  HUD_GEO, STAT_GEO, HEART_GEO, statStack, affectionRow, eyeAfter, leftPanelOrder, hudParts,
  UI_SCALE, scaleStyle, barZoomStyle,
} from '../.dsh-plugin/client/hud-layout.mjs'
import { THEME } from '../.dsh-plugin/client/runtime.mjs'

test('条高与爱心直径严格等于用户指定的 10px / 52px（不许悄悄改）', () => {
  assert.equal(STAT_GEO.barHeight, 10)
  assert.equal(HEART_GEO.size, 52)
  // 与 runtime 的 THEME 必须一致（两处都定义过尺寸，防漂移）
  assert.equal(THEME.barHeight, STAT_GEO.barHeight)
  assert.equal(THEME.heartSize, HEART_GEO.size)
})

test('状态条垂直排布：**文字标签在条上方**，且条的顶端 ≥ 标签高度', () => {
  const s = statStack(10)
  assert.equal(s.labelTop, 0, '标签在行首')
  assert.ok(s.barTop > s.labelTop, '条必须在标签下方')
  assert.ok(s.barTop >= STAT_GEO.labelFontSize, '条不能压在标签文字上')
  assert.equal(s.barTop, STAT_GEO.labelFontSize + STAT_GEO.labelGap)
  assert.equal(s.totalHeight, s.barTop + 10, '总高 = 标签 + 间隙 + 条高')
  // 非法入参回落到默认条高
  assert.equal(statStack(NaN).barHeight, 10)
  assert.equal(statStack(undefined).barHeight, 10)
})

test('好感度行：**爱心圈在状态条左侧**，且不重叠', () => {
  const row = affectionRow()
  assert.equal(row.heartLeft, 0, '爱心在最左')
  assert.equal(row.heartSize, 52)
  assert.ok(row.barLeft >= row.heartSize, '条必须完全在爱心右边')
  assert.equal(row.barLeft, 52 + HEART_GEO.gap, '条起点 = 爱心直径 + 间隙')
  assert.ok(row.barGap > 0, '爱心与条之间要留缝，不能贴死')
})

test('眼睛开关：紧挨状态栏**右边**（不是左边、不重叠）', () => {
  const e = eyeAfter(120)
  assert.equal(e.lastItemLeft, 0)
  assert.ok(e.eyeLeft >= 120, '眼睛必须在最后一个部件右侧')
  assert.equal(e.eyeLeft, 128, '间距 = 8px（与面板 gap 一致）')
  assert.ok(e.gap > 0)
  assert.equal(eyeAfter(0).eyeLeft, 8)
  assert.equal(eyeAfter(NaN).eyeLeft, 8, '非法宽度按 0 处理')
  assert.equal(eyeAfter(120, NaN).eyeLeft, 128, '非法间距回落默认 8')
})

test('左上角堆叠顺序：**饱食度在上、好感度在下**', () => {
  assert.deepEqual(leftPanelOrder(), ['satiety', 'affection'])
})

test('HUD 位置：左上/右上，都在顶栏下方（top > 0，不压顶栏）', () => {
  assert.equal(HUD_GEO.left.anchor, 'left')
  assert.equal(HUD_GEO.right.anchor, 'right')
  assert.equal(HUD_GEO.left.top, HUD_GEO.right.top)
  assert.ok(HUD_GEO.left.top > 0, '必须离开顶栏边缘（顶栏高约 44px，靠 top 留白避开）')
  assert.ok(HUD_GEO.left.left > 0 && HUD_GEO.right.right > 0, '两侧都要留边距')
})

test('HUD 部件清单：三个部件、左右分区、眼睛排在状态栏之后', () => {
  const parts = hudParts()
  assert.equal(parts.length, 3)
  assert.deepEqual(parts.map(p => p.id), ['hud-left', 'hud-right', 'hud-eye'])
  assert.equal(parts.find(p => p.id === 'hud-left').zone, 'left')
  assert.equal(parts.find(p => p.id === 'hud-right').zone, 'right')
  assert.equal(parts.find(p => p.id === 'hud-eye').zone, 'right')
  // 眼睛的 order 必须大于同区的状态栏（保证它画在上层、点得到）
  const right = parts.find(p => p.id === 'hud-right')
  const eye = parts.find(p => p.id === 'hud-eye')
  assert.ok(eye.order > right.order, '眼睛层要压在状态栏之上')
})

// ============ 界面放大（2026-10-08 用户验收：左上 ×2、右上 ×2、吃饭右栏 ×1.5）============

test('scaleStyle：边距按倍数补回，缩放后贴边距离与原来一致', () => {
  // 放大 2 倍、期望视觉上距顶 10px → CSS 里写 5px（5 × 2 = 10）
  const s2 = scaleStyle(2, { top: 10, left: 14 })
  assert.equal(s2.transform, 'scale(2)')
  assert.equal(s2.transformOrigin, '0 0')
  assert.equal(s2.top, '5px')
  assert.equal(s2.left, '7px')
  // 放大 1.5 倍
  const s15 = scaleStyle(1.5, { top: 30, left: 9 })
  assert.equal(s15.transform, 'scale(1.5)')
  assert.equal(s15.top, '20px')
  assert.equal(s15.left, '6px')
})

test('scaleStyle：1 倍与脏入参都退回空样式（不改变原样）', () => {
  assert.deepEqual(scaleStyle(1, { top: 10 }), {})
  assert.deepEqual(scaleStyle(0, { top: 10 }), {})
  assert.deepEqual(scaleStyle(-3, { top: 10 }), {})
  assert.deepEqual(scaleStyle(NaN, { top: 10 }), {})
  // 未给边距时不硬塞 top/left
  const s = scaleStyle(2, {})
  assert.equal(s.transform, 'scale(2)')
  assert.equal(s.top, undefined)
  assert.equal(s.left, undefined)
})

test('UI_SCALE：四处的倍数就是验收要求的 200% / 200% / 150% / 150%', () => {
  assert.equal(UI_SCALE.hudLeft, 2)
  assert.equal(UI_SCALE.hudRight, 2)
  assert.equal(UI_SCALE.eatRight, 1.5)
  assert.equal(UI_SCALE.eatHead, 1.5)
  assert.equal(Object.isFrozen(UI_SCALE), true, '常量应冻结，防运行期误改')
})

test('barZoomStyle：整条横栏用 zoom（布局级缩放），1 倍与脏入参退回空样式', () => {
  // 必须用 zoom 而不是 transform：transform 只放大"视觉"，
  // 整条 left:0;right:0 的 1920px 横栏两端会被挤出舞台
  assert.deepEqual(barZoomStyle(1.5), { zoom: '1.5' })
  assert.deepEqual(barZoomStyle(2), { zoom: '2' })
  assert.deepEqual(barZoomStyle(1), {}, '1 倍不加样式')
  assert.deepEqual(barZoomStyle(0), {})
  assert.deepEqual(barZoomStyle(-2), {})
  assert.deepEqual(barZoomStyle(NaN), {})
  assert.equal(barZoomStyle(1.5).transform, undefined, '绝不能返回 transform（会踩回两端被挤出舞台的坑）')
})
