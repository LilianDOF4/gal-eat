// 降级提示单测：没装 gal-view 时用户能不能**看见**提示（计划 §5.1 硬约束）。
import test from 'node:test'
import assert from 'node:assert/strict'
import { showDegradedNotice } from '../.dsh-plugin/client/DegradedNotice.mjs'

/** 极简 DOM 节点替身。 */
function fakeNode(tag = 'div') {
  const node = {
    tagName: String(tag).toUpperCase(),
    children: [],
    attrs: {},
    className: '',
    textContent: '',
    type: '',
    parent: null,
    style: {},
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

/** 装上假 document，返回 GAL 视窗根节点。 */
function installDom({ withGalRoot = true } = {}) {
  const galRoot = fakeNode('div')
  if (withGalRoot) galRoot.setAttribute('data-gal-view', '')
  const body = fakeNode('body')
  globalThis.document = {
    body,
    querySelector: sel => (sel === '[data-gal-view]' && withGalRoot ? galRoot : null),
    createElement: tag => fakeNode(tag),
  }
  return { galRoot, body }
}

test('有 GAL 视窗时：提示条挂在里面，含标题与原因，可关闭', () => {
  const { galRoot } = installDom()
  const remove = showDegradedNotice('未检测到 gal-view 扩展接口：请先安装 gal-view（0.4 及以上）插件')
  assert.equal(typeof remove, 'function')

  const notices = galRoot.children.filter(c => c.attrs['data-gal-eat-notice'] !== undefined)
  assert.equal(notices.length, 1, '应挂出一条提示')
  const box = notices[0]
  assert.equal(box.attrs.role, 'status')
  assert.equal(box.className, 'ge-degraded')

  const texts = box.children.map(c => c.textContent)
  assert.ok(texts.includes('gal-eat 未启用'), '应有标题，实际 ' + JSON.stringify(texts))
  assert.ok(texts.some(t => String(t).includes('gal-view')), '正文应说明缺少 gal-view')
  // 关闭按钮
  const close = box.children.find(c => c.tagName === 'BUTTON')
  assert.ok(close !== undefined, '应有关闭按钮')

  remove()
  assert.equal(galRoot.children.filter(c => c.attrs['data-gal-eat-notice'] !== undefined).length, 0, 'remove 应清掉提示')
})

test('幂等：重复显示只留一条（HMR / 重复 apply 不会堆叠）', () => {
  const { galRoot } = installDom()
  showDegradedNotice('原因 A')
  showDegradedNotice('原因 B')
  const notices = galRoot.children.filter(c => c.attrs['data-gal-eat-notice'] !== undefined)
  assert.equal(notices.length, 1, '只应保留一条')
  const text = notices[0].children.map(c => c.textContent).join(' ')
  assert.ok(text.includes('原因 B'), '应显示最新原因')
})

test('没有 GAL 视窗根节点：静默返回 noop（不能因为显示不了提示就崩）', () => {
  installDom({ withGalRoot: false })
  let remove = null
  let threw = null
  try { remove = showDegradedNotice('原因') } catch (error) { threw = error }
  assert.equal(threw, null)
  assert.equal(typeof remove, 'function')
  remove()   // 不该抛错
})

test('document 缺失（非浏览器环境）：安全返回 noop', () => {
  const saved = globalThis.document
  delete globalThis.document
  try {
    const remove = showDegradedNotice('原因')
    assert.equal(typeof remove, 'function')
    remove()
  } finally {
    globalThis.document = saved
  }
})

test('原因缺失时给一条兜底文案（不能空着）', () => {
  const { galRoot } = installDom()
  showDegradedNotice(undefined)
  const box = galRoot.children.find(c => c.attrs['data-gal-eat-notice'] !== undefined)
  const text = box.children.map(c => c.textContent).join(' ')
  assert.ok(text.includes('gal-view'), '兜底文案应提到 gal-view，实际 ' + text)
})
