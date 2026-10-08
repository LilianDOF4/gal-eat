/** 没装（或装了过旧）gal-view 时的用户可见提示。
 *
 * 为什么不用舞台覆盖层：这种状态下取不到 gal-view 的扩展缝，
 * **根本没有舞台可以挂**。所以这里退一步：自己往 GAL 视窗的根节点里塞一个置顶条。
 * 找不到 GAL 视窗根节点时（例如用户从没打开过 GAL 页签）什么都不做，
 * 只留控制台日志——绝不因为"没法显示提示"而影响其它功能。
 *
 * 纯 DOM 操作，不依赖 react。
 */

/** 提示条的选择器标记（便于幂等与清理）。 */
const NOTICE_ATTR = 'data-gal-eat-notice'

/**
 * 在 GAL 视窗里显示一条降级提示。
 * @param {string} reason - 来自 runtime.probe() 的可读原因
 * @returns {() => void} 移除函数
 */
export function showDegradedNotice(reason) {
  if (typeof document === 'undefined' || document === null) return () => {}
  let host = null
  try {
    host = document.querySelector('[data-gal-view]')
  } catch {
    host = null
  }
  if (host === null || host === undefined) return () => {}   // 没有 GAL 视窗可挂：静默

  // 幂等：已经有一条时先清掉（HMR / 重复 apply）
  const stale = host.querySelector('[' + NOTICE_ATTR + ']')
  if (stale !== null && stale !== undefined && typeof stale.remove === 'function') stale.remove()

  const box = document.createElement('div')
  box.setAttribute(NOTICE_ATTR, '')
  box.setAttribute('role', 'status')
  box.className = 'ge-degraded'

  const title = document.createElement('span')
  title.className = 'ge-degraded-title'
  title.textContent = 'gal-eat 未启用'
  box.append(title)

  const text = document.createElement('span')
  text.textContent = reason !== null && reason !== undefined && String(reason) !== ''
    ? String(reason)
    : '未检测到 gal-view 扩展接口，请先安装/更新 gal-view。'
  box.append(text)

  const close = document.createElement('button')
  close.type = 'button'
  close.className = 'ge-degraded-close'
  close.setAttribute('aria-label', '关闭提示')
  close.textContent = '×'
  close.addEventListener('click', () => { try { box.remove() } catch { /* 已移除 */ } })
  box.append(close)

  // 优先插到 GAL 视窗根节点里（能被 gv-root 的定位上下文收住）；
  // 根节点不接受子节点时退化为插到 body。
  try {
    host.append(box)
  } catch {
    try { document.body.append(box) } catch { /* 放弃显示 */ }
  }

  return () => {
    try { box.remove() } catch { /* 已移除 */ }
  }
}
