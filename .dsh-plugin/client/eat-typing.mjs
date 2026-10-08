// 吃饭页面的纯逻辑小工具（放在 .mjs 里，单测可直接 import；.jsx 组件文件 Node 解析不了）。

/** 打字速度（字/秒）——吃饭页面复刻场景对话框时的节奏。 */
export const TYPE_CPS = 45
/** 一句打完后停留多久再自动进下一句。 */
export const LINE_DWELL_MS = 1600

/**
 * 打字机切片：给定一行文字与已过去的时间，返回"现在该显示到第几个字"。
 * 抽成纯函数是为了可测（不必依赖计时器/effect），组件与测试共用同一套节奏。
 * @param {string} text
 * @param {number} elapsedMs
 * @param {number} [cps]
 * @returns {{ shown: string, done: boolean }}
 */
export function typewriterSlice(text, elapsedMs, cps = TYPE_CPS) {
  const line = typeof text === 'string' ? text : ''
  if (line === '') return { shown: '', done: true }
  const speed = Number.isFinite(cps) && cps > 0 ? cps : TYPE_CPS
  const elapsed = Number.isFinite(elapsedMs) && elapsedMs > 0 ? elapsedMs : 0
  const count = Math.min(line.length, Math.floor((elapsed / 1000) * speed))
  return { shown: line.slice(0, count), done: count >= line.length }
}
