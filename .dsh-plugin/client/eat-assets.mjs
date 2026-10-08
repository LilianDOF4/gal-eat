// 吃饭页面的图片素材：早/中/晚背景选择 + 从宿主路由取图（带缓存与失败回退）。
//
// 送达链路（§5.4 的查找顺序，从好到差）：
//   ① 宿主路由 `/gal-eat/asset?name=<名字>`（读用户 `Pictures\gal-eat\`，见 lib/index.js）
//   ② gal-view 场景素材库（用户把图导入过 GAL 视窗时能命中）
//   ③ 内置兜底：背景用自绘矢量夜市图；菜品图缺失 → 菜单退化为纯文字（**绝不能崩**）

/** 背景按本地时间选：05:00–11:00 早、11:00–17:00 中、其余 晚（计划 §3.6）。 */
export function backgroundKeyForHour(hour) {
  const h = Number.isFinite(hour) ? Math.floor(hour) : 0
  if (h >= 5 && h < 11) return 'morning'
  if (h >= 11 && h < 17) return 'noon'
  return 'evening'
}

/** 按当前本地时间取背景名。 */
export function backgroundKeyNow(nowMs = Date.now()) {
  return backgroundKeyForHour(new Date(nowMs).getHours())
}

/** 背景名 → 中文时段（标题/无障碍用）。 */
export function backgroundLabel(key) {
  if (key === 'morning') return '清晨'
  if (key === 'noon') return '正午'
  return '夜晚'
}

/** 客户端取图地址（同源，宿主路由）。 */
export function assetUrl(name, base = '') {
  return base + '/gal-eat/asset?name=' + encodeURIComponent(String(name))
}

/** 内置兜底背景：自绘矢量夜市（SVG data URL，几 KB，保证没图也不会空着）。
 *  用 preserveAspectRatio="slice" 让它像照片一样按 cover 铺满舞台。 */
export const FALLBACK_BACKDROP = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="90" viewBox="0 0 160 90" '
  + 'preserveAspectRatio="xMidYMid slice">'
  + '<defs>'
  + '<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">'
  + '<stop offset="0" stop-color="#160f2e"/><stop offset="0.55" stop-color="#42215a"/><stop offset="1" stop-color="#8d3f4f"/>'
  + '</linearGradient>'
  + '<linearGradient id="glow" x1="0" y1="0" x2="0" y2="1">'
  + '<stop offset="0" stop-color="#ffd479" stop-opacity="0.85"/><stop offset="1" stop-color="#ffd479" stop-opacity="0"/>'
  + '</linearGradient>'
  + '</defs>'
  + '<rect width="160" height="90" fill="url(#sky)"/>'
  // 远处楼房剪影
  + '<g fill="#1b1230">'
  + '<rect x="4" y="34" width="18" height="40"/><rect x="26" y="26" width="14" height="48"/>'
  + '<rect x="44" y="38" width="20" height="36"/><rect x="96" y="28" width="16" height="46"/>'
  + '<rect x="116" y="36" width="18" height="38"/><rect x="138" y="24" width="18" height="50"/>'
  + '</g>'
  // 窗户灯光
  + '<g fill="#ffd479" opacity="0.75">'
  + '<rect x="7" y="38" width="3" height="3"/><rect x="13" y="44" width="3" height="3"/>'
  + '<rect x="29" y="30" width="3" height="3"/><rect x="34" y="38" width="3" height="3"/>'
  + '<rect x="99" y="33" width="3" height="3"/><rect x="105" y="41" width="3" height="3"/>'
  + '<rect x="141" y="29" width="3" height="3"/><rect x="147" y="37" width="3" height="3"/>'
  + '</g>'
  // 地面与摊位
  + '<rect y="74" width="160" height="16" fill="#2a1a33"/>'
  + '<g>'
  + '<rect x="14" y="58" width="26" height="16" fill="#5d2a3c"/><rect x="12" y="55" width="30" height="4" fill="#ff9f43"/>'
  + '<rect x="52" y="60" width="30" height="14" fill="#3d2a4f"/><rect x="50" y="57" width="34" height="4" fill="#ff6fae"/>'
  + '<rect x="98" y="59" width="28" height="15" fill="#4a2a35"/><rect x="96" y="56" width="32" height="4" fill="#ffd479"/>'
  + '</g>'
  // 灯笼串
  + '<g fill="#ff6b6b">'
  + '<circle cx="30" cy="16" r="2.6"/><circle cx="52" cy="12" r="2.6"/><circle cx="74" cy="16" r="2.6"/>'
  + '<circle cx="96" cy="12" r="2.6"/><circle cx="118" cy="16" r="2.6"/><circle cx="140" cy="12" r="2.6"/>'
  + '</g>'
  + '<path d="M0 10 Q40 20 80 10 T160 10" stroke="#3a2140" stroke-width="0.8" fill="none"/>'
  + '<rect width="160" height="90" fill="url(#glow)" opacity="0.35"/>'
  + '</svg>',
)

/**
 * 创建素材加载器：同源路由取图 → dataURL 缓存 → 失败静默（调用方用兜底）。
 * @param {{ baseUrl?: string, fetchImpl?: Function, cache?: Map }} [opts]
 */
export function createAssetLoader(opts = {}) {
  const baseUrl = typeof opts.baseUrl === 'string' ? opts.baseUrl : ''
  const doFetch = typeof opts.fetchImpl === 'function'
    ? opts.fetchImpl
    : (typeof fetch === 'function' ? fetch.bind(globalThis) : null)
  const cache = opts.cache instanceof Map ? opts.cache : new Map()
  const pending = new Map()
  const failed = new Set()

  const load = async name => {
    if (typeof name !== 'string' || name === '') return null
    if (cache.has(name)) return cache.get(name)
    if (failed.has(name)) return null
    if (doFetch === null) return null
    if (pending.has(name)) return pending.get(name)
    const task = (async () => {
      try {
        const res = await doFetch(assetUrl(name, baseUrl), { credentials: 'same-origin' })
        if (res === null || res === undefined || res.ok !== true) throw new Error('HTTP ' + String(res?.status))
        const blob = await res.blob()
        const dataUrl = await blobToDataUrl(blob)
        cache.set(name, dataUrl)
        return dataUrl
      } catch {
        // 没图是正常情况（用户没放图）：记下来免得每次重试，交给兜底
        failed.add(name)
        return null
      } finally {
        pending.delete(name)
      }
    })()
    pending.set(name, task)
    return task
  }

  return {
    /** 同步读缓存（渲染时用，避免闪烁）。 */
    peek: name => cache.get(name) ?? null,
    /** 是否已知该素材缺失。 */
    isMissing: name => failed.has(name),
    /** 异步取图（带缓存/去重）。 */
    load,
    /** 预取一批（进吃饭页面时调用）。 */
    async prefetch(names) {
      const list = Array.isArray(names) ? names : []
      const results = await Promise.all(list.map(n => load(n)))
      return results.filter(v => v !== null).length
    },
    /** 已缓存的素材快照（供订阅/调试）。 */
    snapshot: () => Object.fromEntries(cache.entries()),
  }
}

/** Blob → dataURL（fileReader 不可用时退化为 base64 直转）。 */
function blobToDataUrl(blob) {
  if (typeof FileReader === 'function') {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(new Error('FileReader failed'))
      reader.readAsDataURL(blob)
    })
  }
  return blob.arrayBuffer().then(buffer => {
    const bytes = new Uint8Array(buffer)
    let binary = ''
    for (const b of bytes) binary += String.fromCharCode(b)
    const type = typeof blob.type === 'string' && blob.type !== '' ? blob.type : 'image/png'
    return 'data:' + type + ';base64,' + btoa(binary)
  })
}

/**
 * 在 gal-view 场景素材库里按 dataURL 反查素材 id（§5.4 的查找顺序②）。
 * 用户若把美食街图导入过 GAL 视窗，这里能命中而不必依赖磁盘目录。
 * @param {object|null} scene - galViewExt.getScene() 的结果
 * @param {Map|null} assetsMap - 素材库（{id, dataUrl}）
 * @param {string} label - 元素名/标签里包含的关键词（如 '早晨'）
 */
export function findSceneAssetId(scene, assetsMap, label) {
  if (scene === null || scene === undefined || !(assetsMap instanceof Map) || typeof label !== 'string' || label === '') return null
  const elements = Array.isArray(scene.elements) ? scene.elements : []
  for (const el of elements) {
    if (el === null || typeof el !== 'object') continue
    const text = String(el.text ?? '') + String(el.name ?? '')
    if (!text.includes(label)) continue
    if (typeof el.assetId === 'string' && assetsMap.has(el.assetId)) return el.assetId
  }
  return null
}
