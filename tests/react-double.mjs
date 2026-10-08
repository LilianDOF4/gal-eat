// 测试用 React 替身（按**组件隔离** hooks）：同一个实例既供 gal-eat/gal-view 产物（external react），
// 也供 .jsx 测试文件使用，因此测试里渲染出来的元素树就是产物真实渲染的树。
//
// 为什么必须按组件隔离：早期版本所有组件共用一个 hookState 数组 + 每组件重置索引，
// 结果组件 A 的 useState 槽位会撞上组件 B 的 —— 于是"明明是 visible=true，组件却渲染成 null"，
// 制造出难以定位的**假失败**。真实 React 的 hooks 是按组件实例存放的，这里照做。
//
// 限制（够用即可）：不做重渲染调度；useEffect 不自动执行（副作用由测试显式驱动）；
// useState 的更新只写回本组件槽位，需要"看到更新"时由测试重置后再渲染一次。

/** componentKey -> { slots: [], cursor: number } */
const components = new Map()
let current = null

export function resetHooks() {
  components.clear()
  current = null
}

/** 以组件身份（函数引用或名字+调用序）取/建它的 hook 槽位。 */
function slotBucket(key) {
  if (!components.has(key)) components.set(key, { slots: [], cursor: 0 })
  const bucket = components.get(key)
  // 每次重新进入该组件都从 0 开始（真实 React 每次渲染都按顺序读自己的 hooks）
  bucket.cursor = 0
  return bucket
}

function keyOf(type) {
  // 用函数引用本身作 key（同组件多次渲染复用同一份状态）；匿名组件用名字兜底
  if (typeof type === 'function') return type
  return String(type)
}

let currentType = null

/**
 * 渲染一个组件：进入它的 hook 作用域（按组件隔离），函数组件直接调用，类组件 new 后取 render()。
 */
export function renderComponent(type, props) {
  if (typeof type !== 'function') return { type, props: props ?? {} }
  // 类组件：原型上有 render（例如 gal-view 的错误边界）
  if (type.prototype !== undefined && typeof type.prototype.render === 'function') {
    const instance = new type(props ?? {})
    return instance.render()
  }
  const prevType = currentType
  currentType = keyOf(type)
  current = slotBucket(currentType)
  try {
    return type(props ?? {})
  } finally {
    currentType = prevType
    current = prevType !== null ? slotBucket(prevType) : null
  }
}

export function createElement(type, props, ...children) {
  const flat = children.flat(Infinity).filter(c => c !== null && c !== undefined && c !== false && c !== true)
  const merged = { ...(props ?? {}) }
  if (flat.length === 1) merged.children = flat[0]
  else if (flat.length > 1) merged.children = flat
  if (typeof type === 'function') return renderComponent(type, merged)
  return { type, props: merged }
}

export function useState(init) {
  if (current === null) return [typeof init === 'function' ? init() : init, () => {}]
  const i = current.cursor++
  if (current.slots.length <= i) current.slots[i] = typeof init === 'function' ? init() : init
  const set = v => { current.slots[i] = typeof v === 'function' ? v(current.slots[i]) : v }
  return [current.slots[i], set]
}

export function useEffect(fn) {
  // 不自动执行；调用方可用 pendingEffectsOf 取回（本文件默认不暴露调度）
}

export function useMemo(fn) {
  return fn()
}

export function useRef(init) {
  if (current === null) return { current: init }
  const i = current.cursor++
  if (current.slots.length <= i) current.slots[i] = { current: init }
  return current.slots[i]
}

export function useCallback(fn) {
  return fn
}

export function useSyncExternalStore(subscribe, getSnapshot) {
  // 真实 React 每次渲染都会调用 getSnapshot 读最新快照，这里照做（不缓存、不占槽位）
  return getSnapshot()
}

export const Fragment = 'fragment'

/** 类组件基类：gal-view 的错误边界继承它（`extends React.Component`）。 */
export class Component {
  constructor(props) {
    this.props = props ?? {}
    this.state = this.state ?? {}
  }

  setState(next) {
    const patch = typeof next === 'function' ? next(this.state) : next
    this.state = { ...this.state, ...(patch ?? {}) }
  }

  render() {
    return null
  }
}

const React = {
  createElement,
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
  useSyncExternalStore,
  Component,
  Fragment,
}
React.default = React

export default React
