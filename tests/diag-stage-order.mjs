// 诊断：让 gal-view 的真实 StageView 渲染"吃饭中"的状态，打印元素绘制顺序，
// 用来定位"对话框/立绘为什么看不见"（是被外部层盖住，还是根本没渲染）。
//
// 用法: node tests/diag-stage-order.mjs
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import React, { resetHooks } from './react-double.mjs'
import { createGalViewExt } from '../gal-view/.dsh-plugin/client/galview-ext.mjs'

const VIEW_CODE = readFileSync(fileURLToPath(new URL('../gal-view/.dsh-plugin/client.js', import.meta.url)), 'utf8')
const EAT_CODE = readFileSync(fileURLToPath(new URL('../.dsh-plugin/client.js', import.meta.url)), 'utf8')

const storageMap = new Map()
const makeWindow = () => ({
  localStorage: {
    getItem: k => (storageMap.has(k) ? storageMap.get(k) : null),
    setItem: (k, v) => storageMap.set(k, String(v)),
    removeItem: k => storageMap.delete(k),
  },
  addEventListener: () => {}, removeEventListener: () => {}, isSecureContext: false, __ModuleLoader__: null,
})
const fakeNode = (tag = 'div') => ({
  tagName: String(tag).toUpperCase(), children: [], attrs: {}, className: '', textContent: '', style: {},
  setAttribute(k, v) { this.attrs[k] = String(v) }, getAttribute(k) { return this.attrs[k] ?? null },
  append(c) { this.children.push(c); return this }, remove() {}, addEventListener() {}, querySelector() { return null },
})
const documentMock = {
  querySelector: () => null, querySelectorAll: () => [], createElement: t => fakeNode(t),
  head: { append() {} }, body: fakeNode('body'), addEventListener: () => {}, removeEventListener: () => {},
}
globalThis.MutationObserver = class { observe() {} disconnect() {} takeRecords() { return [] } }
globalThis.indexedDB = { open: () => { const r = {}; setTimeout(() => { r.result = { objectStoreNames: { contains: () => true }, createObjectStore() {}, transaction: () => { const tx = {}; setTimeout(() => { if (tx.oncomplete) tx.oncomplete() }, 0); tx.objectStore = () => ({ get: () => ({}), put: () => {}, getAll: () => ({}) }); return tx }, close() {} }; if (r.onupgradeneeded) r.onupgradeneeded(); if (r.onsuccess) r.onsuccess() }, 0); return r } }

const requireStub = name => {
  if (name === 'react') return React
  throw new Error('unexpected require: ' + name)
}
function loadBundle(code) {
  const win = makeWindow()
  let captured = null
  win.__ModuleLoader__ = { load: ({ id, factory }) => { captured = { id, ...factory(requireStub) } } }
  new Function('window', 'document', 'setInterval', 'clearInterval', 'console', 'fetch', code)(
    win, documentMock, () => 0, () => {}, { info: () => {}, warn: () => {}, error: () => {} },
    () => Promise.reject(new Error('no net')),
  )
  return captured
}

// —— 场景：正式舞台尺寸 1920×1080，含背景/立绘/对话框/台词/名牌 ——
const SCENE = {
  version: 1,
  settings: { stageW: 1920, stageH: 1080, gridSize: 4, assistantSpeaker: 'char-b', showGrid: false },
  elements: [
    { id: 'bg', type: 'background', name: '背景', x: 0, y: 0, w: 1920, h: 1080, hidden: false, order: 0, text: '', fontSize: 16, fontFamily: '', color: '#000', opacity: 1, rotation: 0, assetId: '' },
    { id: 'char', type: 'character', name: '角色', x: 280, y: 164, w: 1456, h: 1424, hidden: false, order: 10, text: '', fontSize: 16, fontFamily: '', color: '#9b8cff', opacity: 1, rotation: 0, assetId: '', character: { label: '妮丝', name: '妮丝', color: '#9b8cff' } },
    { id: 'dlg', type: 'dialogue', name: '对话框', x: 40, y: 476, w: 1816, h: 636, hidden: false, order: 30, text: '', fontSize: 18, fontFamily: '', color: '#fff', opacity: .9, rotation: 0, assetId: '' },
    { id: 'dtx', type: 'dialogue-text', name: '台词框', x: 364, y: 788, w: 1288, h: 248, hidden: false, order: 31, text: '', fontSize: 26, fontFamily: '', color: '#f4f6ff', opacity: 1, rotation: 0, assetId: '' },
    { id: 'nm', type: 'speaker-name', name: 'AI 名牌', x: 404, y: 666, w: 216, h: 58, hidden: false, order: 32, text: 'AI', fontSize: 22, fontFamily: '', color: '#ffe9b0', opacity: 1, rotation: 0, assetId: '', role: 'assistant' },
  ],
}

const viewPkg = loadBundle(VIEW_CODE)
const ext = createGalViewExt({ host: { getScene: () => SCENE, getAssets: () => new Map(), appendHistoryLine: () => true }, console: { warn: () => {}, info: () => {}, error: () => {} } })
const eatPkg = loadBundle(EAT_CODE)
const cleanups = []
eatPkg.apply({
  get: n => (n === 'galViewExt' ? ext : undefined),
  provide: () => () => {},
  effect: s => { const d = typeof s === 'function' ? s() : undefined; cleanups.push(typeof d === 'function' ? d : () => {}) },
  slots: { inject: () => {}, register: () => () => {} },
})
const rt = eatPkg.__test.runtime
rt.enterStreet({ type: 'start', count: 2, random: () => 0 })
rt.say('今天吃什么好呢？', 'gal-eat:intro:0')
console.log('阶段:', rt.eatSource.getSnapshot().phase, '| 覆盖层数:', ext.listOverlays().length)
console.log('台词覆盖:', JSON.stringify(ext.getLineOverride()))
console.log('背景覆盖:', ext.getBackdrop()?.kind)

const registered = []
viewPkg.apply({
  get: () => undefined, provide: () => () => {}, effect: s => { if (typeof s === 'function') s() },
  slots: { inject: (n, fn) => { if (typeof fn === 'function') fn() }, register: (o, C) => { registered.push({ o, C }); return () => {} } },
})
const GalView = registered.find(r => r.o?.name === 'conversation.view')?.C

const subs = () => () => {}
const mkHook = init => fn => (typeof fn === 'function' ? fn(init) : init)
const props = {
  sessionId: 's1',
  useSession: fn => (typeof fn === 'function' ? fn({ running: false, blank: false, promptError: null, pending: null }) : { running: false }),
  useInput: fn => (typeof fn === 'function' ? fn({ draft: '' }) : {}),
  inputActions: { submit: () => {}, setDraft: () => {} },
  useChat: fn => (typeof fn === 'function' ? fn({ legacy: { nodes: [], partial: null, runningCalls: [], turnEnds: [], turnTimings: [] } }) : {}),
  useScene: mkHook(SCENE),
  useHistory: mkHook({ undo: 0, redo: 0 }),
  useAssets: mkHook({ map: new Map() }),
  useFonts: mkHook({ map: new Map() }),
  useStore: mkHook({ lineKey: null, pageIndex: 0, shown: '', done: true, dwellSince: null, statusHold: false }),
  useProjection: () => undefined,
  useAutoSaveStatus: mkHook({ lastAt: null }),
  useSessionPendingInteraction: fn => (typeof fn === 'function' ? fn(new Map()) : undefined),
  useSessionStatus: fn => (typeof fn === 'function' ? fn(new Map()) : undefined),
  actions: { saveProgress: () => {} },
  api: { setViewSessionId: () => {}, currentSessionId: () => 's1', hasSessionsService: () => false, mainTitle: () => 't' },
  galViewExt: ext,
}

resetHooks()
const tree = GalView(props)

/** 按"绘制顺序"列出舞台直属子节点（后画的会盖住先画的）。 */
const stage = (() => {
  let hit = null
  const walk = n => {
    if (hit !== null || n === null || n === undefined || typeof n !== 'object') return
    if (Array.isArray(n)) { for (const c of n) walk(c); return }
    const cn = n.props?.className
    if (typeof cn === 'string' && cn.split(/\s+/).includes('gv-stage')) { hit = n; return }
    walk(n.props?.children)
  }
  walk(tree)
  return hit
})()

console.log('\n=== gv-stage 直属子节点（按绘制顺序，后面的盖前面的）===')
const kids = Array.isArray(stage?.props?.children) ? stage.props.children : [stage?.props?.children]
kids.filter(Boolean).forEach((k, i) => {
  const cls = k?.props?.className ?? '(无 class)'
  const z = k?.props?.style?.zIndex
  console.log(`  ${String(i).padStart(2)}  class=${String(cls).padEnd(22)} zIndex=${z ?? '-'}  type=${typeof k?.type === 'function' ? k.type.name : k?.type}`)
})

console.log('\n结论提示：对话框(.gv-dialogue) 与立绘(.gv-el-character) 在列表中的位置若在 .gv-ext-overlay 之前，')
console.log('         且外部层是不透明容器，则会被盖住 —— 这就是"吃饭页面看不到对话框/立绘"的原因。')
