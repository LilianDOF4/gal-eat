// HUD 布局常量与纯几何计算。
//
// 为什么单独抽出来：§3.5 的布局要求（"文字标签在**条上方**、左端对齐条左端"、"好感度条**左侧**是
// 52px 的爱心圈"、"眼睛紧挨状态栏**右边**"）是**空间关系**，最容易在人眼验收时被挑出来，
// 却一直只靠注释保证、没有任何断言。这里把布局变成纯数据，单测就能钉住这些关系
// （不许出现"标签跑到条下面"这类回归）。

/** 面板在舞台内的大致位置（与 styles.mjs 的 CSS 保持一致）。 */
export const HUD_GEO = Object.freeze({
  left: Object.freeze({ top: 10, left: 14, anchor: 'left' }),
  right: Object.freeze({ top: 10, right: 14, anchor: 'right' }),
})

/** 状态条：标签在上、条在下；条高固定 10px（§3.5）。 */
export const STAT_GEO = Object.freeze({
  barHeight: 10,
  labelGap: 2,          // 标签与条之间的间隙
  labelFontSize: 12,
  valueFontSize: 10,    // 条右侧的小号数值（弱化）
  minWidth: 168,
})

/** 爱心等级圈：直径 52px，位在好感度条左侧（§3.5）。 */
export const HEART_GEO = Object.freeze({
  size: 52,
  gap: 8,               // 爱心与条之间的间隙
})

/**
 * 一条状态条的垂直排布：标签在上、条在下（供单测断言"标签在条上方"）。
 * @param {number} barHeight
 * @returns {{ labelTop: number, barTop: number, barHeight: number, totalHeight: number }}
 */
export function statStack(barHeight = STAT_GEO.barHeight) {
  const h = Number.isFinite(barHeight) ? barHeight : STAT_GEO.barHeight
  const labelTop = 0
  const barTop = labelTop + STAT_GEO.labelFontSize + STAT_GEO.labelGap
  return { labelTop, barTop, barHeight: h, totalHeight: barTop + h }
}

/**
 * 好感度那一行的水平排布：**[爱心圈] --gap-- [状态条]**。
 * 返回各部件相对行左端的偏移，便于断言"爱心在条左侧"。
 * @returns {{ heartLeft: number, heartSize: number, barLeft: number, barGap: number }}
 */
export function affectionRow() {
  const heartLeft = 0
  return {
    heartLeft,
    heartSize: HEART_GEO.size,
    barLeft: heartLeft + HEART_GEO.size + HEART_GEO.gap,
    barGap: HEART_GEO.gap,
  }
}

/**
 * 右上面板里"眼睛开关紧挨状态栏右边"的水平关系。
 * 眼睛跟在同一行的最后一个部件之后（gap 与面板一致）。
 * @param {number} lastItemWidth - 眼睛左边最后一个部件的宽度
 * @param {number} gap
 * @returns {{ lastItemLeft: number, eyeLeft: number, gap: number }}
 */
export function eyeAfter(lastItemWidth, gap = 8) {
  const width = Number.isFinite(lastItemWidth) && lastItemWidth >= 0 ? lastItemWidth : 0
  const g = Number.isFinite(gap) && gap >= 0 ? gap : 8
  return { lastItemLeft: 0, eyeLeft: width + g, gap: g }
}

/**
 * 左上角两条的堆叠顺序：**饱食度在上、好感度在下**（§3.5，用户第 9 条）。
 * 返回自上而下的顺序数组，单测据此断言。
 */
export function leftPanelOrder() {
  return ['satiety', 'affection']
}

/** 右下角/相对舞台的四个 HUD 部件（顺序即渲染顺序，便于快照断言）。 */
export function hudParts() {
  return [
    { id: 'hud-left', zone: 'left', order: 40 },
    { id: 'hud-right', zone: 'right', order: 40 },
    { id: 'hud-eye', zone: 'right', order: 42 },
  ]
}

/**
 * 用户要求的界面放大倍数（2026-10-08 验收）：
 * 左上双条 ×2、右上券面板 ×2、吃饭页右栏 ×1.5、吃饭页顶部条 ×1.5。
 * 用 `transform: scale` 放大而不是逐条改字号/尺寸：**比例完全不变**，也不会牵动别处布局。
 */
export const UI_SCALE = Object.freeze({
  hudLeft: 2,
  hudRight: 2,
  eatRight: 1.5,
  /** 吃饭页顶部条（美食街·时段 / 鲸元券 / 今天不吃了回家）。 */
  eatHead: 1.5,
})

/**
 * 把"放大 N 倍"翻译成 CSS。以**左上角**为原点缩放会连带把边距也放大，
 * 所以要把期望的**视觉边距**除以倍数补回去，这样放大后贴边距离与原来一致。
 *
 * @param {number} scale 放大倍数（1 = 不缩放，返回空对象）
 * @param {{ top?: number, left?: number }} inset 期望的视觉边距（px）
 * @returns {{ transform?: string, transformOrigin?: string, top?: string, left?: string }}
 */
export function scaleStyle(scale, inset = {}) {
  const s = Number.isFinite(scale) && scale > 0 ? scale : 1
  if (s === 1) return {}
  const style = { transform: 'scale(' + s + ')', transformOrigin: '0 0' }
  if (Number.isFinite(inset.top)) style.top = (inset.top / s) + 'px'
  if (Number.isFinite(inset.left)) style.left = (inset.left / s) + 'px'
  return style
}

/**
 * 整条横栏的放大：用 **zoom** 而不是 `transform: scale`。
 *
 * 为什么必须用 zoom：横栏是 `left:0; right:0` 铺满整条舞台的，舞台内部宽 1920px。
 * 用 transform 放大时盒子仍按 1920px 布局，只是**视觉**被放大 1.5 倍（视觉宽 2880px）——
 * 多出来的 960px 全在舞台外，最左边的标题（美食街·时段）就被推出去了。
 * zoom 是**布局级**缩放：盒子本身算 1.5 倍宽，内容仍排在框内，两侧都不丢。
 */
export function barZoomStyle(scale) {
  const s = Number.isFinite(scale) && scale > 0 ? scale : 1
  if (s === 1) return {}
  return { zoom: String(s) }
}
